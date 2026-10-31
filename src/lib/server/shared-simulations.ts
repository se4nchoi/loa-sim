import { command, redisConfig } from './redis';
import { postgresQuery, postgresConfigured } from './postgres';
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

export const sharingConfigured = postgresConfigured;
// All Redis builds created before cutover have expired by then. No Redis reads after this deadline.
export const LEGACY_SHARE_UNTIL = Date.parse('2026-12-02T00:00:00Z');

/** A short-lived counter, shared across function instances; never stores the raw address. */
export async function allowShare(address: string, _fetch: typeof fetch, now = Date.now()): Promise<boolean> {
	const key = createHash('sha256').update(address).digest('hex');
	const rows = await postgresQuery(`INSERT INTO loa_share_limits(subject_hash,hits,expires_at)
		VALUES($1,1,$2::timestamptz+interval '10 minutes')
		ON CONFLICT(subject_hash) DO UPDATE SET
			hits=CASE WHEN loa_share_limits.expires_at <= $2::timestamptz THEN 1 ELSE least(11,loa_share_limits.hits+1) END,
			expires_at=CASE WHEN loa_share_limits.expires_at <= $2::timestamptz THEN $2::timestamptz+interval '10 minutes' ELSE loa_share_limits.expires_at END
		RETURNING hits`, [key,new Date(now).toISOString()]);
	return Number(rows[0]?.hits) <= 10;
}

async function storeShare(id: string, character: string, payload: string, expiresAt: number, now: number) {
	return postgresQuery(`WITH expired AS (
		DELETE FROM loa_shared_simulations WHERE id IN (SELECT id FROM loa_shared_simulations WHERE expires_at <= $5::timestamptz LIMIT 100)
	), old_limits AS (
		DELETE FROM loa_share_limits WHERE subject_hash IN (SELECT subject_hash FROM loa_share_limits WHERE expires_at <= $5::timestamptz LIMIT 100)
	)
	INSERT INTO loa_shared_simulations(id,character,payload,expires_at) VALUES($1,$2,$3,$4::timestamptz)
	ON CONFLICT(id) DO NOTHING RETURNING id`, [id,character,payload,new Date(expiresAt).toISOString(),new Date(now).toISOString()]);
}

export function sharedPlan(json: string): SavedSimulation {
	if (Buffer.byteLength(json) > MAX_SHARE_BYTES) throw new Error('This simulation is too large to share.');
	const parsed = parseSimulation(json);
	const key = parsed.characterKey.toLowerCase();
	if (!/^(na|ce)\/[^/?#\s]{1,40}$/u.test(key)) throw new Error('This character region or name is unsupported.');
	// Only the snapshot and edits are shared, never browser-specific IDs or pinned status.
	return {version:1,id:'shared',name:parsed.name,characterKey:key,savedAt:Date.now(),loadout:parsed.loadout,state:parsed.state};
}

export async function createSharedSimulation(plan: SavedSimulation, _fetch: typeof fetch, now = Date.now()) {
	const expiresAt = now + SHARE_TTL * 1000;
	const entry: SharedSimulation = {version:1,plan:{...plan,savedAt:now},expiresAt,originalCp:simulationCP(plan)};
	const value = deflateSync(JSON.stringify(entry)).toString('base64url');
	for (let attempt = 0; attempt < 3; attempt++) {
		const id = randomBytes(6).toString('base64url');
		// Conflicts never overwrite builds or extend expiry.
		const result = await storeShare(id, plan.characterKey.split('/')[1].toLowerCase(), value, expiresAt, now);
		if (result.length === 1) return {path:`/s/${encodeURIComponent(normalizeName(plan.characterKey.split('/')[1]))}/${id}`,expiresAt};
	}
	throw new Error('Could not create a unique link. Please try again.');
}

export async function getSharedSimulation(id: string, name: string, fetchFn: typeof fetch, now = Date.now()): Promise<SharedSimulation | null> {
	if (!/^[A-Za-z0-9_-]{8}$/.test(id)) return null;
	const rows = await postgresQuery('SELECT payload, expires_at FROM loa_shared_simulations WHERE id=$1', [id]);
	if (rows.length) {
		if (new Date(String(rows[0].expires_at)).getTime() <= now) return null;
		return decodeShare(rows[0].payload, id, name, now);
	}
	if (now >= LEGACY_SHARE_UNTIL || !redisConfig()) return null;
	const imported = await postgresQuery("SELECT value FROM loa_stats_meta WHERE key='redis-shares-imported'");
	if (imported.length) return null;
	// Temporary, read-only recovery path for old links. New shares never touch Redis.
	const value = await command(['GET', `loa-sim:share:${id}`], fetchFn);
	if (value === null) return null;
	const entry = decodeShare(value,id,name,now);
	if (!entry) return null;
	await storeShare(id,name.toLowerCase(),value as string,entry.expiresAt,now);
	return entry;
}

function decodeShare(value: unknown, id: string, name: string, now: number): SharedSimulation | null {
 if (typeof value !== 'string' || value.length > MAX_SHARE_ENCODED_CHARS) throw new Error('Invalid shared simulation.');
 const entry = JSON.parse(inflateSync(Buffer.from(value, 'base64url'), {maxOutputLength:MAX_SHARE_RECORD_BYTES}).toString()) as SharedSimulation;
 if (!entry || entry.version !== 1 || !Number.isFinite(entry.expiresAt) || !Number.isFinite(entry.originalCp)) throw new Error('Invalid shared simulation.');
	if (entry.expiresAt <= now) return null;
	const plan = parseSimulation(JSON.stringify(entry.plan));
 if (!/^(na|ce)\/[^/?#\s]{1,40}$/u.test(plan.characterKey.toLowerCase()) ||
  plan.characterKey.split('/')[1]?.toLowerCase() !== name.toLowerCase()) return null;
 return {...entry, calculatedCp: simulationCP(plan), plan:{...plan,id:`shared:${id}`}};
}
