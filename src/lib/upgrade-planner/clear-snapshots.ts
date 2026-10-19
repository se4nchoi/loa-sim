// A clear's gear snapshot (lostark.bible, via our server). One request per clear the player picks; snapshots never
// change, so each is kept: in memory for this visit and in localStorage (the last few) for the next.
import type { ClearSnapshot } from '$lib/bible-data';

const PREFIX = 'loa-sim:clear-snapshot:';
const KEEP = 30;
const memory = new Map<string, Promise<ClearSnapshot>>();

function stored(hash: string): ClearSnapshot | null {
	try {
		const v = JSON.parse(localStorage.getItem(PREFIX + hash) ?? 'null');
		return v && typeof v === 'object' && Array.isArray(v.items) ? v : null;
	} catch {
		return null;
	}
}

function store(hash: string, snap: ClearSnapshot) {
	try {
		localStorage.setItem(PREFIX + hash, JSON.stringify(snap));
		const keys = Object.keys(localStorage).filter((k) => k.startsWith(PREFIX));
		// Oldest first by insertion is unknown to localStorage; drop arbitrary extras beyond KEEP (they're re-fetchable).
		for (const k of keys.slice(0, Math.max(0, keys.length - KEEP))) if (k !== PREFIX + hash) localStorage.removeItem(k);
	} catch {
		/* kept for this visit only */
	}
}

export function clearSnapshot(hash: string): Promise<ClearSnapshot> {
	const hit = memory.get(hash);
	if (hit) return hit;
	const saved = stored(hash);
	const request = saved
		? Promise.resolve(saved)
		: fetch(`/api/snapshot/${hash}`).then(async (res) => {
				const body = await res.json().catch(() => null);
				if (!res.ok) throw new Error(body?.message ?? `Couldn't load this clear's setup (${res.status})`);
				store(hash, body);
				return body as ClearSnapshot;
			});
	memory.set(hash, request);
	request.catch(() => memory.delete(hash));
	return request;
}
