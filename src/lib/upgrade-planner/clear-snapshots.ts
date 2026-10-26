// A clear's gear snapshot (lostark.bible, via our server). One request per clear the player picks; snapshots never
// change, so each is kept: in memory for this visit and in localStorage (the last few) for the next.
import type { ClearSnapshot } from '$lib/bible-data';
import { decodeCore } from './tables';

const PREFIX = 'loa-sim:clear-snapshot:v2:';
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

/** A build's Order cores as one key (core kinds, grade aside), to group runs by the cores they were played on. */
export const orderCoreKey = (ids: number[]) =>
	ids.filter((id) => decodeCore(id)?.attr === 'order').map((id) => String(id).slice(0, 8)).sort().join(',');

/**
 * Whether a gear snapshot is the setup a run was played on. lostark.bible can keep its highest-CP setup instead (another
 * spec's Ark Passive and Order cores; seen on 5 of 9 characters' recent runs, 10-26), so the snapshot's enlightenment
 * must be the one the run recorded. Unknown on either side: trusted.
 */
export function snapshotFitsRun(snap: ClearSnapshot, enlightenment: { id: number; lv: number }[] | null | undefined): boolean {
	const ran = (enlightenment ?? []).filter((n) => n.lv > 0).map((n) => `${n.id}:${n.lv}`).sort().join(',');
	const kept = (snap.arkPassive?.enlightenment ?? []).filter((n) => n.level > 0).map((n) => `${n.id}:${n.level}`).sort().join(',');
	return !ran || !kept || ran === kept;
}
