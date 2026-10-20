import { command, redisConfig } from './redis';
import { createHash, randomBytes } from 'node:crypto';
import { deflateSync, inflateSync } from 'node:zlib';
import { normalizeName } from '$lib/bible-data';
import { parseSimulation, simulationCP, type SavedSimulation } from '$lib/upgrade-planner/saved-simulations';

export const SHARE_TTL = 30 * 24 * 60 * 60;
export const MAX_SHARE_BYTES = 128 * 1024;
const MAX_SHARE_RECORD_BYTES = MAX_SHARE_BYTES * 2;
const MAX_SHARE_ENCODED_CHARS = Math.ceil((MAX_SHARE_RECORD_BYTES + 1024) * 4 / 3);
export interface SharedSimulation {
	version: 1;
	plan: SavedSimulation;
	expiresAt: number;
	originalCp: number;
 /** Recalculated after validating/migrating the saved state using the current simulator. */
 calculatedCp?: number;
}

export { redisConfig };

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
 if (typeof value !== 'string' || value.length > MAX_SHARE_ENCODED_CHARS) throw new Error('Invalid shared simulation.');
 const entry = JSON.parse(inflateSync(Buffer.from(value, 'base64url'), {maxOutputLength:MAX_SHARE_RECORD_BYTES}).toString()) as SharedSimulation;
 if (!entry || entry.version !== 1 || !Number.isFinite(entry.expiresAt) || !Number.isFinite(entry.originalCp)) throw new Error('Invalid shared simulation.');
	if (entry.expiresAt <= now) return null;
	const plan = parseSimulation(JSON.stringify(entry.plan));
 if (!/^(na|ce)\/[^/?#\s]{1,40}$/u.test(plan.characterKey.toLowerCase()) ||
  plan.characterKey.split('/')[1]?.toLowerCase() !== name.toLowerCase()) return null;
 return {...entry, calculatedCp: simulationCP(plan), plan:{...plan,id:`shared:${id}`}};
}
