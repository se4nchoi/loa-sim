// Decoding lostark.bible character data (the page's SvelteKit `__data.json`). Shared by the server
// loader and the browser paste flow; nothing here touches the network.

import type { CpDigest, CpDistribution } from '$lib/upgrade-planner/cp-distribution';
import type { Loadout } from '$lib/upgrade-planner/types';

export const REGIONS = ['NA', 'CE'] as const;
export type Region = (typeof REGIONS)[number];

export interface CharacterData {
	name: string;
	region: string;
	header: { ilvl?: number; class?: string; title?: string; guild?: { name?: string } | null } | null;
	loadout: Loadout | null;
	/** The class's Combat Power distribution, for "top X%" (missing on characters saved before it was kept). */
	cpDistribution?: CpDistribution | null;
}

/** The URL whose response a player copies into the paste box. Opening it is ordinary browsing. */
export const bibleDataUrl = (region: string, name: string) =>
	`https://lostark.bible/character/${encodeURIComponent(region)}/${encodeURIComponent(name)}/__data.json?x-sveltekit-invalidated=011`;

export const bibleCharacterUrl = (region: string, name: string) =>
	`https://lostark.bible/character/${encodeURIComponent(region)}/${encodeURIComponent(name)}`;

/** Game naming convention: first letter upper case, the rest lower case ("sOULSHAN" → "Soulshan", "élan" → "Élan"). */
export const normalizeName = (name: string) => {
	const chars = [...name.trim()];
	return chars.length ? chars[0].toLocaleUpperCase() + chars.slice(1).join('').toLocaleLowerCase() : '';
};

/** Accepts "Name", or a lostark.bible character URL (with or without the data suffix). */
export function parseCharacterInput(input: string, fallbackRegion: Region): { region: Region; name: string } | null {
	const text = input.trim();
	if (!text) return null;
	const m = text.match(/lostark\.bible\/character\/([A-Za-z]+)\/([^/?#\s]+)/);
	if (m) {
		const region = m[1].toUpperCase();
		if (!(REGIONS as readonly string[]).includes(region)) return null;
		return { region: region as Region, name: normalizeName(decodeURIComponent(m[2])) };
	}
	if (/[/\s]/.test(text)) return null;
	return { region: fallbackRegion, name: normalizeName(text) };
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

/** Turns a parsed `__data.json` body into character data. Throws a player-readable message on bad input. */
export function decodeCharacterData(body: unknown, name: string, region: string): CharacterData {
	const b = body as { type?: string; nodes?: (DataNode | null)[] } | null;
	if (!b || b.type !== 'data' || !Array.isArray(b.nodes))
		throw new Error("That doesn't look like lostark.bible character data. Copy the whole page from the data link.");
	const nodes = b.nodes.filter((n): n is DataNode & { data: unknown[] } => n?.type === 'data' && Array.isArray(n.data));
	const pages = nodes.map((n) => unflatten(n.data) as Record<string, unknown>);
	const layout = pages.find((p) => 'header' in p) as { header?: CharacterData['header'] } | undefined;
	const page = pages.find((p) => 'loadouts' in p) as
		| { loadouts?: Loadout[]; combatPowerDistribution?: Record<string, Record<string, CpDigest>> }
		| undefined;
	if (!page) throw new Error('No character found in that data. Check the name and region, then copy it again.');
	return {
		name,
		region,
		header: layout?.header ?? null,
		loadout: page.loadouts?.find((l) => l.type === 'ark_passive' && l.battlePoint) ?? null,
		cpDistribution: distributionOf(page.combatPowerDistribution)
	};
}

function distributionOf(raw: Record<string, Record<string, CpDigest>> | undefined): CpDistribution | null {
	const [classId, digests] = Object.entries(raw ?? {})[0] ?? [];
	return classId && digests && typeof digests === 'object' ? { classId, digests } : null;
}

/** Parses what a player pasted (the raw text of the data link). */
export function parsePastedData(text: string, name: string, region: string): CharacterData {
	let body: unknown;
	try {
		body = JSON.parse(text.trim());
	} catch {
		throw new Error('The pasted text isn\'t complete. Open the data link, press Ctrl+A then Ctrl+C, and paste again.');
	}
	return decodeCharacterData(body, name, region);
}
