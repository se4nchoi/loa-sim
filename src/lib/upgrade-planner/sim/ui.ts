import { PartType, partHigh } from '../cp';
import type { BattlePointPart } from '../types';

export const selectClass = (changed: boolean) =>
	`rounded-xs border bg-surface-950 px-1.5 py-0.5 text-sm text-surface-100 focus:outline-none focus:border-accent-500 ${
		changed ? 'border-accent-500 bg-accent-500/10' : 'border-surface-700'
	}`;

export const linkButtonClass = 'text-surface-300 underline hover:text-surface-50';

export const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

export const SIM_GROUPS = {
	gear: [PartType.BaseAttack],
	accessories: [PartType.AccessoryGrinding, PartType.AccessoryCombatEffect],
	gems: [PartType.Gem],
	engravings: [PartType.Engraving],
	arkGrid: [PartType.ArkGridCore, PartType.ArkGridGem],
	karma: [PartType.KarmaEvolutionRank, PartType.KarmaLeapLevel]
} as const;
export type SimGroup = keyof typeof SIM_GROUPS;

const product = (parts: BattlePointPart[], types: readonly number[]) =>
	parts.reduce((r, p) => (types.includes(p.type) ? r * (p.type === PartType.BaseAttack ? partHigh(p) : 1 + partHigh(p) / 1e4) : r), 1);

/** CP change per group, in percent, between the original and simulated parts. */
export function groupDeltas(before: BattlePointPart[], after: BattlePointPart[]): Record<SimGroup, number> {
	const out = {} as Record<SimGroup, number>;
	for (const [g, types] of Object.entries(SIM_GROUPS) as [SimGroup, readonly number[]][])
		out[g] = (product(after, types) / product(before, types) - 1) * 100;
	return out;
}
