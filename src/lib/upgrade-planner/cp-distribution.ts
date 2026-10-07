// Where a Combat Power score stands among a class, from the distribution lostark.bible ships with each
// character page (`combatPowerDistribution`): a t-digest per 10-item-level bracket ("1-1780") and one for
// every character of the class ("1-all").

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

export interface CpStanding {
	/** Digest key ("1-1780", "1-all"). */
	key: string;
	/** "1780–1789" or "All item levels". */
	label: string;
	count: number;
	/** Percent of characters at or above the score ("top 12%"). */
	top: (cp: number) => number;
}

/** Every item-level bracket with data, highest first, then the whole class. */
export function cpStandings(dist: CpDistribution): CpStanding[] {
	const entries = Object.entries(dist.digests).filter(([, d]) => d?.count);
	const bracketOf = (k: string) => Number(k.split('-').at(-1));
	const brackets = entries.filter(([k]) => !Number.isNaN(bracketOf(k))).sort(([a], [b]) => bracketOf(b) - bracketOf(a));
	const all = entries.filter(([k]) => k.endsWith('-all'));
	return [...brackets, ...all].map(([key, d]) => ({
		key,
		label: key.endsWith('-all') ? 'All item levels' : `${bracketOf(key)}–${bracketOf(key) + 9}`,
		count: d.count,
		top: (cp) => (1 - digestCdf(d, cp)) * 100
	}));
}

/** The character's own bracket, or the whole class when its bracket has no data. */
export function defaultStanding(list: CpStanding[], itemLevel: number | null): CpStanding | undefined {
	const bracket = itemLevel ? Math.floor(itemLevel / 10) * 10 : null;
	return list.find((s) => bracket !== null && s.key.endsWith(`-${bracket}`)) ?? list.find((s) => s.key.endsWith('-all')) ?? list[0];
}

/** "Top 12%", "Top 3.1%", "Top 0.85%": two significant digits near the top. */
export const formatTop = (top: number) =>
	`Top ${top < 0.1 ? '<0.1' : top < 10 ? Number(top.toPrecision(2)) : top.toFixed(0)}%`;
