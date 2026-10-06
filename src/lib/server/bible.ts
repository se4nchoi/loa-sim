// Demo-only loader. On lostark.bible itself the page already has this data.
//
// lostark.bible's robots.txt disallows automated access, so this fetches one character per user
// request, caches it, and never crawls.

import type { Loadout } from '$lib/upgrade-planner/types';

const TTL_MS = 30 * 60 * 1000;
const cache = new Map<string, { at: number; data: CharacterData }>();

export interface CharacterData {
	name: string;
	region: string;
	header: { ilvl?: number; class?: string; title?: string; guild?: { name?: string } | null } | null;
	loadout: Loadout | null;
}

/** SvelteKit serializes page data with devalue's flat format: values reference each other by index. */
function unflatten(values: unknown[]): unknown {
	const hydrated: unknown[] = new Array(values.length);
	const done = new Set<number>();
	const special: Record<number, unknown> = { [-1]: undefined, [-3]: NaN, [-4]: Infinity, [-5]: -Infinity, [-6]: -0 };
	const hydrate = (i: number): unknown => {
		if (i in special) return special[i];
		if (done.has(i)) return hydrated[i];
		done.add(i);
		const v = values[i];
		if (v === null || typeof v !== 'object') return (hydrated[i] = v);
		if (Array.isArray(v)) {
			if (typeof v[0] === 'string') {
				if (v[0] === 'Date') return (hydrated[i] = new Date(v[1] as string));
				throw new Error(`Unsupported devalue tag ${v[0]}`);
			}
			const arr: unknown[] = (hydrated[i] = []);
			for (const j of v as number[]) arr.push(hydrate(j));
			return arr;
		}
		const obj: Record<string, unknown> = (hydrated[i] = {});
		for (const [k, j] of Object.entries(v as Record<string, number>)) obj[k] = hydrate(j);
		return obj;
	};
	return hydrate(0);
}

type DataNode = { type: string; data?: unknown[] };

export async function loadCharacter(region: string, name: string, fetchFn: typeof fetch): Promise<CharacterData> {
	const key = `${region}/${name}`.toLowerCase();
	const hit = cache.get(key);
	if (hit && Date.now() - hit.at < TTL_MS) return hit.data;

	const url = `https://lostark.bible/character/${encodeURIComponent(region)}/${encodeURIComponent(name)}/__data.json?x-sveltekit-invalidated=011`;
	const res = await fetchFn(url, { headers: { 'user-agent': 'loa-eff upgrade planner demo (single lookups)' } });
	if (!res.ok) throw new Error(`lostark.bible returned ${res.status}`);
	const body = (await res.json()) as { type: string; nodes: (DataNode | null)[] };
	if (body.type !== 'data') throw new Error('Character not found');

	const nodes = body.nodes.filter((n): n is DataNode & { data: unknown[] } => n?.type === 'data' && !!n.data);
	const pages = nodes.map((n) => unflatten(n.data) as Record<string, unknown>);
	const layout = pages.find((p) => 'header' in p) as { header?: CharacterData['header'] } | undefined;
	const page = pages.find((p) => 'loadouts' in p) as { loadouts?: Loadout[] } | undefined;
	if (!page) throw new Error('Character not found');

	const data: CharacterData = {
		name,
		region,
		header: layout?.header ?? null,
		loadout: page.loadouts?.find((l) => l.type === 'ark_passive' && l.battlePoint) ?? null
	};
	cache.set(key, { at: Date.now(), data });
	return data;
}
