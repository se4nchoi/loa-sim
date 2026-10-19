// Server-side character loader. lostark.bible's developer allows loa-sim to fetch a character's page data
// (`__data.json`) from our server, one character per player action (2026-10-08; browsers can't, it has no CORS).
// It caches each character briefly, shares one request between simultaneous callers, and never crawls.
// Set BIBLE_SERVER_FETCH=0 to turn it off (players then paste their data instead).

import { env } from '$env/dynamic/private';
import { decodeCharacterData, bibleDataUrl, bibleSnapshotUrl, decodeSnapshot, type CharacterData, type ClearSnapshot } from '$lib/bible-data';

// The CDN can cache this result for another minute: keep the combined window under two minutes.
export const CHARACTER_CACHE_SECONDS = 60;
const TTL_MS = CHARACTER_CACHE_SECONDS * 1000;
const TIMEOUT_MS = 15_000;
const cache = new Map<string, { at: number; data: CharacterData }>();
const inFlight = new Map<string, Promise<CharacterData>>();

export const serverFetchEnabled = () => env.BIBLE_SERVER_FETCH !== '0';

async function fetchCharacter(region: string, name: string, fetchFn: typeof fetch): Promise<CharacterData> {
	let res: Response;
	try {
		res = await fetchFn(bibleDataUrl(region, name), {
			headers: { 'user-agent': 'loa-sim combat power simulator (https://loa-sim.vercel.app; one character per player action)' },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch (e) {
		throw new Error(e instanceof Error && e.name === 'TimeoutError' ? 'lostark.bible took too long to answer' : "Couldn't reach lostark.bible");
	}
	if (res.status === 404) throw new Error(`${name} (${region}) wasn't found on lostark.bible`);
	if (!res.ok) throw new Error(`lostark.bible returned ${res.status}`);
	let body: unknown;
	try {
		body = await res.json();
	} catch {
		throw new Error('lostark.bible sent something unexpected');
	}
	return decodeCharacterData(body, name, region);
}

/** One character's bible data, from a short cache or a single upstream request. */
export async function loadCharacter(region: string, name: string, fetchFn: typeof fetch): Promise<CharacterData> {
	const key = `${region}/${name}`.toLowerCase();
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.data;
	const pending = inFlight.get(key);
	if (pending) return pending;
	const request = fetchCharacter(region, name, fetchFn)
		.then((data) => {
			cache.set(key, { at: Date.now(), data });
			return data;
		})
		.finally(() => inFlight.delete(key));
	inFlight.set(key, request);
	return request;
}

// Snapshots are addressed by a hash of their content, so one never changes: keep the last few hundred, and share one
// request between simultaneous callers. Fetched when a player picks a clear (one snapshot per action).
const SNAPSHOT_CACHE = 300;
const snapshots = new Map<string, ClearSnapshot>();
const snapshotsInFlight = new Map<string, Promise<ClearSnapshot>>();

async function fetchSnapshot(hash: string, fetchFn: typeof fetch): Promise<ClearSnapshot> {
	let res: Response;
	try {
		res = await fetchFn(bibleSnapshotUrl(hash), {
			headers: { 'user-agent': 'loa-sim combat power simulator (https://loa-sim.vercel.app; one snapshot per player action)' },
			signal: AbortSignal.timeout(TIMEOUT_MS)
		});
	} catch (e) {
		throw new Error(e instanceof Error && e.name === 'TimeoutError' ? 'lostark.bible took too long to answer' : "Couldn't reach lostark.bible");
	}
	if (res.status === 404) throw new Error("lostark.bible doesn't have this clear's snapshot");
	if (!res.ok) throw new Error(`lostark.bible returned ${res.status}`);
	let body: unknown;
	try {
		body = await res.json();
	} catch {
		throw new Error('lostark.bible sent something unexpected');
	}
	return decodeSnapshot(body);
}

/** The gear snapshot LOA Logs linked to a clear, from the cache or a single upstream request. */
export async function loadSnapshot(hash: string, fetchFn: typeof fetch): Promise<ClearSnapshot> {
	const hit = snapshots.get(hash);
	if (hit) return hit;
	const pending = snapshotsInFlight.get(hash);
	if (pending) return pending;
	const request = fetchSnapshot(hash, fetchFn)
		.then((snap) => {
			snapshots.set(hash, snap);
			if (snapshots.size > SNAPSHOT_CACHE) snapshots.delete(snapshots.keys().next().value!);
			return snap;
		})
		.finally(() => snapshotsInFlight.delete(hash));
	snapshotsInFlight.set(hash, request);
	return request;
}
