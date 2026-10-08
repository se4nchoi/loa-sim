// Where a Combat Power score stands among a class, from the distribution lostark.bible ships with each
// character page (`combatPowerDistribution`): a t-digest per role and 10-item-level bracket ("1-1780") and one
// per role for every item level ("1-all"). The role prefix is the score's id: 1 = dealer, 2 = support.

/** Combat Power role: 1 = dealer score, 2 = support score. */
export type CpRole = 1 | 2;

export interface CpDigest {
	/** [mean, weight] pairs, sorted by mean. */
	centroids: [number, number][];
	count: number;
	min: number;
	max: number;
}

export interface CpDistribution {
	classId: string;
	digests: Record<string, CpDigest>;
}

/** Share of the digest's characters below `x` (0–1), interpolating between centroid centers. */
export function digestCdf(d: CpDigest, x: number): number {
	if (!d.count || x <= d.min) return 0;
	if (x >= d.max) return 1;
	const pts: [number, number][] = [[d.min, 0]];
	let cum = 0;
	for (const [mean, w] of d.centroids) {
		pts.push([mean, cum + w / 2]);
		cum += w;
	}
	pts.push([d.max, d.count]);
	for (let i = 1; i < pts.length; i++) {
		const [x1, c1] = pts[i];
		if (x > x1) continue;
		const [x0, c0] = pts[i - 1];
		const t = x1 > x0 ? (x - x0) / (x1 - x0) : 1;
		return (c0 + t * (c1 - c0)) / d.count;
	}
	return 1;
}

/** Item level range [from, to) in whole 10-level brackets; null = every item level. */
export type IlvlRange = { from: number; to: number } | null;

export interface CpStanding {
	count: number;
	/** Percent of characters at or above the score ("top 12%"). */
	top: (cp: number) => number;
}

const bracketOf = (key: string) => Number(key.split('-').at(-1));
/** This role's digests only (dealers and supports of a class are ranked separately). */
const roleEntries = (dist: CpDistribution, role: CpRole) =>
	Object.entries(dist.digests).filter(([k]) => k.startsWith(`${role}-`));

/** Brackets with data for a role (10-level steps: 1700, 1710, ...), ascending. */
export const cpBrackets = (dist: CpDistribution, role: CpRole) =>
	roleEntries(dist, role)
		.filter(([k, d]) => d?.count && !Number.isNaN(bracketOf(k)))
		.map(([k]) => bracketOf(k))
		.sort((a, b) => a - b);

/** Several digests as one: their centroids together, re-sorted. */
export function mergeDigests(list: CpDigest[]): CpDigest | null {
	const ds = list.filter((d) => d?.count);
	if (!ds.length) return null;
	return {
		centroids: ds.flatMap((d) => d.centroids).sort((a, b) => a[0] - b[0]),
		count: ds.reduce((a, d) => a + d.count, 0),
		min: Math.min(...ds.map((d) => d.min)),
		max: Math.max(...ds.map((d) => d.max))
	};
}

/** Standing within an item level range, or across the whole class, among characters of the same role. */
export function cpStanding(dist: CpDistribution, range: IlvlRange, role: CpRole): CpStanding | null {
	const entries = roleEntries(dist, role);
	const d = range
		? mergeDigests(entries.filter(([k]) => bracketOf(k) >= range.from && bracketOf(k) < range.to).map(([, d]) => d))
		: (entries.find(([k]) => k.endsWith('-all'))?.[1] ?? null);
	if (!d?.count) return null;
	return { count: d.count, top: (cp) => (1 - digestCdf(d, cp)) * 100 };
}

/** The character's own 10-level bracket. */
export const ownRange = (itemLevel: number | null | undefined): IlvlRange => {
	if (!itemLevel) return null;
	const from = Math.floor(itemLevel / 10) * 10;
	return { from, to: from + 10 };
};

/** "Top 12%", "Top 3.1%", "Top 0.85%": two significant digits near the top. */
export const formatTop = (top: number) =>
	`Top ${top < 0.1 ? '<0.1' : top < 10 ? Number(top.toPrecision(2)) : top.toFixed(0)}%`;
