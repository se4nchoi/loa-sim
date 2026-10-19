// The DPS tab's skills table: LOA Logs' damage-table columns (D%, CDR%, casts, CPM, crit), added up over the selected
// clears, with the range across clears where it moves. Same measures as the meter: D% is the skill's share of the
// player's damage, CDR% the share of the fight it spent on cooldown (from its ready-but-unused time).

import type { RunSummary } from '$lib/logs/protocol';

export interface Range { low: number; high: number }

export interface SkillRow {
	id: number;
	/** Percent of the player's damage over all the clears together. */
	share: number;
	/** Lowest and highest share in a single clear. */
	shareRange: Range;
	/** Percent of fight time on cooldown, over the clears that recorded it; null when none did. */
	cooldown: number | null;
	cooldownRange: Range | null;
	casts: number;
	/** Casts per minute of fight. */
	cpm: number;
	/** Percent of hits that crit; null without hits. */
	crit: number | null;
	/** Clears the skill was used in. */
	clears: number;
}

const range = (values: number[]): Range | null => values.length ? { low: Math.min(...values), high: Math.max(...values) } : null;

export function skillTable(runs: RunSummary[]): SkillRow[] {
	const valid = runs.filter(r => r.damage > 0 && r.duration > 0);
	const damage = valid.reduce((sum, r) => sum + r.damage, 0);
	const minutes = valid.reduce((sum, r) => sum + r.duration, 0) / 60_000;
	const byId = new Map<number, { damage: number; casts: number; hits: number; crits: number; shares: number[]; ready: number; fight: number; uses: number[]; clears: number }>();
	for (const r of valid)
		for (const s of r.skills) {
			const row = byId.get(s.id) ?? { damage: 0, casts: 0, hits: 0, crits: 0, shares: [], ready: 0, fight: 0, uses: [], clears: 0 };
			row.damage += s.damage; row.casts += s.casts; row.hits += s.hits; row.crits += s.crits; row.clears++;
			row.shares.push(s.damage / r.damage * 100);
			if (s.timeAvailable !== undefined) {
				const ready = Math.min(s.timeAvailable, r.duration);
				row.ready += ready; row.fight += r.duration;
				row.uses.push((1 - ready / r.duration) * 100);
			}
			byId.set(s.id, row);
		}
	return [...byId].map(([id, row]): SkillRow => ({
		id,
		share: damage > 0 ? row.damage / damage * 100 : 0,
		// A clear the skill wasn't used in counts as 0% of that clear's damage.
		shareRange: range([...row.shares, ...(row.clears < valid.length ? [0] : [])])!,
		cooldown: row.fight > 0 ? (1 - row.ready / row.fight) * 100 : null,
		cooldownRange: range(row.uses),
		casts: row.casts,
		cpm: minutes > 0 ? row.casts / minutes : 0,
		crit: row.hits > 0 ? row.crits / row.hits * 100 : null,
		clears: row.clears
	})).sort((a, b) => b.share - a.share || b.casts - a.casts);
}
