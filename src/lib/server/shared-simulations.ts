import { env } from '$env/dynamic/private';
import { createHash, randomBytes } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { normalizeName } from '$lib/bible-data';
import { parseSimulation, simulationCP, type SavedSimulation } from '$lib/upgrade-planner/saved-simulations';

export const SHARE_TTL = 30 * 24 * 60 * 60;
export const MAX_SHARE_BYTES = 128 * 1024;
export interface SharedSimulation {
	version: 1;
	plan: SavedSimulation;
	expiresAt: number;
	originalCp: number;
}

export function redisConfig() {
	for (const prefix of ['STORAGE', 'STORAGE_KV', 'STORAGE_UPSTASH_REDIS', 'UPSTASH_REDIS', 'KV']) {
		const url = env[`${prefix}_REST_API_URL`] ?? env[`${prefix}_REST_URL`];
		const token = env[`${prefix}_REST_API_TOKEN`] ?? env[`${prefix}_REST_TOKEN`];
		if (url && token) return { url, token };
	}
	return null;
}

async function command(args: (string | number)[], fetchFn: typeof fetch): Promise<unknown> {
	const config = redisConfig();
	if (!config) throw new Error('Sharing storage is not configured.');
	const response = await fetchFn(config.url, {
		method: 'POST', headers: { authorization: `Bearer ${config.token}`, 'content-type': 'application/json' },
		body: JSON.stringify(args), signal: AbortSignal.timeout(10_000), cache: 'no-store'
	});
	if (!response.ok) throw new Error('Sharing storage is unavailable.');
	const body = await response.json();
	if (body.error) throw new Error('Sharing storage could not complete the request.');
	return body.result;
}

/** A short-lived counter, shared across function instances; never stores the raw address. */
export async function allowShare(address: string, fetchFn: typeof fetch): Promise<boolean> {
	const key = 'loa-sim:share-limit:' + createHash('sha256').update(address).digest('hex');
	const count = await command(['EVAL', "local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 600) end; return n", 1, key], fetchFn);
	return typeof count === 'number' && count <= 10;
}

export function sharedPlan(json: string): SavedSimulation {
	if (Buffer.byteLength(json) > MAX_SHARE_BYTES) throw new Error('This simulation is too large to share.');
	const parsed = parseSimulation(json);
	const key = parsed.characterKey.toLowerCase();
	if (!/^(na|ce)\/[^/?#\s]{1,40}$/u.test(key)) throw new Error('This character region or name is unsupported.');
	// Only the snapshot and edits are shared, never browser-specific IDs or pinned status.
	return {version:1,id:'shared',name:parsed.name,characterKey:key,savedAt:Date.now(),loadout:parsed.loadout,state:parsed.state};
}

export async function createSharedSimulation(plan: SavedSimulation, fetchFn: typeof fetch, now = Date.now()) {
	const expiresAt = now + SHARE_TTL * 1000;
	const entry: SharedSimulation = {version:1,plan:{...plan,savedAt:now},expiresAt,originalCp:simulationCP(plan)};
	const value = deflateSync(JSON.stringify(entry)).toString('base64url');
	for (let attempt = 0; attempt < 3; attempt++) {
		const id = randomBytes(6).toString('base64url');
		// NX prevents overwriting an existing build or extending its expiry on collision.
		const result = await command(['SET', `loa-sim:share:${id}`, value, 'EX', SHARE_TTL, 'NX'], fetchFn);
		if (result === 'OK') return {path:`/s/${encodeURIComponent(normalizeName(plan.characterKey.split('/')[1]))}/${id}`,expiresAt};
		if (result !== null) throw new Error('Sharing storage returned an unexpected result.');
	}
	throw new Error('Could not create a unique link. Please try again.');
}

export async function getSharedSimulation(id: string, name: string, fetchFn: typeof fetch, now = Date.now()): Promise<SharedSimulation | null> {
	if (!/^[A-Za-z0-9_-]{8}$/.test(id)) return null;
	const value = await command(['GET', `loa-sim:share:${id}`], fetchFn);
	if (value === null) return null;
	if (typeof value !== 'string' || value.length > MAX_SHARE_BYTES) throw new Error('Invalid shared simulation.');
	const entry = JSON.parse(inflateSync(Buffer.from(value, 'base64url'), {maxOutputLength:MAX_SHARE_BYTES * 2}).toString()) as SharedSimulation;
	if (entry.version !== 1 || !Number.isFinite(entry.expiresAt) || !Number.isFinite(entry.originalCp)) throw new Error('Invalid shared simulation.');
	if (entry.expiresAt <= now) return null;
	const plan = parseSimulation(JSON.stringify(entry.plan));
	if (plan.characterKey.split('/')[1]?.toLowerCase() !== name.toLowerCase()) return null;
	return {...entry,plan:{...plan,id:`shared:${id}`}};
}
