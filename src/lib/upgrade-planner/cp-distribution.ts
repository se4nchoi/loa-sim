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
	/** e.g. "1780+" or "all". */
	label: string;
	count: number;
	/** Percent of characters at or above the score ("top 12%"). */
	top: (cp: number) => number;
}

const digestKey = (digests: Record<string, CpDigest>, suffix: string) =>
	Object.keys(digests).find((k) => k.endsWith(`-${suffix}`));

/** Standings for a score: within the character's 10-item-level bracket, and across the whole class. */
export function cpStandings(dist: CpDistribution, itemLevel: number | null): CpStanding[] {
	const out: CpStanding[] = [];
	const add = (suffix: string, label: string) => {
		const key = digestKey(dist.digests, suffix);
		const d = key ? dist.digests[key] : undefined;
		if (d?.count) out.push({ label, count: d.count, top: (cp) => (1 - digestCdf(d, cp)) * 100 });
	};
	if (itemLevel) {
		const bracket = Math.floor(itemLevel / 10) * 10;
		add(String(bracket), `${bracket}–${bracket + 9}`);
	}
	add('all', 'all');
	return out;
}

/** "Top 12%", "Top 3.1%", "Top 0.85%": two significant digits near the top. */
export const formatTop = (top: number) =>
	`Top ${top < 0.1 ? '<0.1' : top < 10 ? Number(top.toPrecision(2)) : top.toFixed(0)}%`;
