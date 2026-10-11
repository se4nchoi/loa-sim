// How a Combat Power number is made up. The score is a product (see cp.ts / support.ts):
//   power = base / 1e4 × Π(1 + part / 1e4)
// so each section is a multiplier on the base, not an amount. To still say "Bracelet is worth 700 CP", the gain
// above the base (power − base) is split between sections in proportion to ln(multiplier): the shares add up
// exactly, and the order the multipliers are applied in doesn't matter.

import { PartType, isDefensePart, partHigh } from './cp';
import { decodeCore, ASTROGEM_OPTION_NAMES, ENGRAVING_NAMES } from './tables';
import { orbName } from './paradise';
import type { BattlePointPart } from './types';

export type BreakdownGroup =
	| 'level'
	| 'arkPassive'
	| 'equipment'
	| 'karma'
	| 'engravings'
	| 'accessories'
	| 'bracelet'
	| 'gems'
	| 'combatStats'
	| 'cards'
	| 'pet'
	| 'arkGrid'
	| 'paradise';

const GROUP_OF: Record<number, BreakdownGroup> = {
	[PartType.Level]: 'level',
	[PartType.WeaponQuality]: 'equipment',
	[PartType.EstherWeapon]: 'equipment',
	[PartType.ElixirSet]: 'equipment',
	[PartType.ElixirAttack]: 'equipment',
	[PartType.ElixirDefense]: 'equipment',
	[PartType.TranscendenceArmor]: 'equipment',
	[PartType.TranscendenceAdditional]: 'equipment',
	[PartType.ArkPassiveEvolution]: 'arkPassive',
	[PartType.ArkPassiveEnlightenment]: 'arkPassive',
	[PartType.ArkPassiveLeap]: 'arkPassive',
	[PartType.KarmaEvolutionRank]: 'karma',
	[PartType.KarmaLeapLevel]: 'karma',
	[PartType.Engraving]: 'engravings',
	[PartType.EngravingDefense]: 'engravings',
	[PartType.AccessoryGrinding]: 'accessories',
	[PartType.AccessoryGrindingDefense]: 'accessories',
	[PartType.AccessoryCombatEffect]: 'accessories',
	[PartType.AccessoryCombatEffectDefense]: 'accessories',
	[PartType.BraceletStatType]: 'bracelet',
	[PartType.BraceletEffect]: 'bracelet',
	[PartType.BraceletEffectDefense]: 'bracelet',
	[PartType.Gem]: 'gems',
	[PartType.CombatStats]: 'combatStats',
	[PartType.CardSet]: 'cards',
	[PartType.PetSpecialty]: 'pet',
	[PartType.ArkGridCore]: 'arkGrid',
	[PartType.ArkGridCoreDefense]: 'arkGrid',
	[PartType.ArkGridGem]: 'arkGrid',
	[PartType.ArkGridGemDefense]: 'arkGrid',
	[PartType.ParadiseOrb]: 'paradise',
	[PartType.ParadiseOrbDefense]: 'paradise'
};

export const GROUP_LABELS: Record<BreakdownGroup, string> = {
	level: 'Character level',
	arkPassive: 'Ark Passive',
	equipment: 'Equipment',
	karma: 'Karma',
	engravings: 'Engravings',
	accessories: 'Accessories',
	bracelet: 'Bracelet',
	gems: 'Gems',
	combatStats: 'Combat stats',
	cards: 'Card set',
	pet: 'Pet ranch',
	arkGrid: 'Ark Grid',
	paradise: 'Paradise'
};

/** Sections grouped for the breakdown dialog, in display order. */
export const CATEGORIES = [
	{ key: 'character', label: 'Character', groups: ['arkPassive', 'level', 'combatStats', 'karma', 'cards', 'pet'] },
	{ key: 'gear', label: 'Gear', groups: ['engravings', 'gems', 'equipment', 'bracelet', 'accessories'] },
	{ key: 'systems', label: 'Systems', groups: ['arkGrid', 'paradise'] }
] as const satisfies readonly { key: string; label: string; groups: readonly BreakdownGroup[] }[];
export type BreakdownCategory = (typeof CATEGORIES)[number]['key'];

const SLOT_NAMES: Record<string, string> = { neck: 'Necklace', ear1: 'Earring 1', ear2: 'Earring 2', finger1: 'Ring 1', finger2: 'Ring 2' };
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** What a part is called inside its section; parts with the same name are combined. */
function itemLabel(p: BattlePointPart): string {
	switch (p.type) {
		case PartType.Level:
			return `Level ${p.level ?? ''}`.trim();
		case PartType.WeaponQuality:
			return `Weapon quality${p.quality !== undefined ? ` ${p.quality}` : ''}`;
		case PartType.EstherWeapon:
			return 'Esther weapon';
		case PartType.ElixirSet:
		case PartType.ElixirAttack:
		case PartType.ElixirDefense:
			return 'Elixirs';
		case PartType.TranscendenceArmor:
		case PartType.TranscendenceAdditional:
			return 'Transcendence';
		case PartType.ArkPassiveEvolution:
			return 'Evolution';
		case PartType.ArkPassiveEnlightenment:
			return 'Enlightenment';
		case PartType.ArkPassiveLeap:
			return 'Leap';
		case PartType.KarmaEvolutionRank:
			return 'Evolution karma';
		case PartType.KarmaLeapLevel:
			return 'Leap karma';
		case PartType.Engraving:
		case PartType.EngravingDefense:
			return ENGRAVING_NAMES[Number(p.id)] ?? 'Engraving';
		case PartType.AccessoryGrinding:
		case PartType.AccessoryGrindingDefense:
		case PartType.AccessoryCombatEffect:
		case PartType.AccessoryCombatEffectDefense:
			return SLOT_NAMES[String(p.slot)] ?? 'Accessory';
		case PartType.BraceletStatType:
			return 'Stat lines';
		case PartType.BraceletEffect:
		case PartType.BraceletEffectDefense:
			return 'Effects';
		case PartType.Gem:
			return 'Gems';
		case PartType.PetSpecialty:
			// The ranch collection: +1% main stat, +1% outgoing damage, +0.5% damage against enemy types, +1% max HP. Bible
			// sends it as a 0–77 range (the enemy-type part is conditional); the in-game score counts the top. How those
			// effects add up to 77 is still open.
			return 'Collection bonus';
		case PartType.ArkGridCore:
		case PartType.ArkGridCoreDefense: {
			const info = decodeCore(Number(p.id));
			return info ? `${cap(info.attr)} ${cap(info.shape)} core` : 'Core';
		}
		case PartType.ArkGridGem:
		case PartType.ArkGridGemDefense:
			return `Astrogems: ${ASTROGEM_OPTION_NAMES[Number(p.id)] ?? 'option'}`;
		case PartType.ParadiseOrb:
		case PartType.ParadiseOrbDefense:
			return orbName(Number(p.id));
		default:
			return GROUP_LABELS[GROUP_OF[p.type]] ?? `Part ${p.type}`;
	}
}

export interface BreakdownItem {
	label: string;
	/** Parts combined under this name. */
	count: number;
	/** Bonus in percent: (multiplier − 1) × 100. */
	pct: number;
}

export interface BreakdownRow {
	group: BreakdownGroup;
	label: string;
	pct: number;
	/** This section's share of the score (shares plus the base and adjustment add up to the total). */
	cp: number;
	/** Change of this section's own multiplier vs `before`, in percent of its power (0 when unchanged). */
	change: number;
	items: BreakdownItem[];
}

export interface BreakdownSide {
	/** "Combat Power", or a support's "Buff Power" / "Shield & Heal Power". */
	label: string;
	/** The base the multipliers apply to (base attack, or base health for Shield & Heal). */
	base: { label: string; points: number; cp: number; /** Change vs `before`, in percent. */ change: number };
	rows: BreakdownRow[];
	/** This side's power from the formula, scaled to the in-game score. */
	total: number;
}

export interface CpBreakdown {
	sides: BreakdownSide[];
	/** Final score shown (anchored on the in-game score). */
	total: number;
	/** In-game score ÷ formula score: the small gap bible's formula leaves, applied evenly. */
	anchor: number;
}

type Side = { label: string; baseType: number; counts: (p: BattlePointPart) => boolean };
const DEALER_SIDES: Side[] = [{ label: 'Combat Power', baseType: PartType.BaseAttack, counts: (p) => !isDefensePart(p) }];
const SUPPORT_DEFENSE = new Set<number>([
	PartType.EngravingDefense,
	PartType.AccessoryGrindingDefense,
	PartType.AccessoryCombatEffectDefense,
	PartType.BraceletEffectDefense,
	PartType.ArkGridCoreDefense,
	PartType.ArkGridGemDefense,
	PartType.ParadiseOrbDefense
]);
const SUPPORT_SIDES: Side[] = [
	{ label: 'Buff Power', baseType: PartType.BaseAttack, counts: (p) => !SUPPORT_DEFENSE.has(p.type) },
	{ label: 'Shield & Heal Power', baseType: PartType.BaseHealth, counts: (p) => SUPPORT_DEFENSE.has(p.type) }
];

/** Per group: multiplier and its items' multipliers. */
function groupsOf(parts: BattlePointPart[], side: Side) {
	const out = new Map<BreakdownGroup, { mult: number; items: Map<string, { mult: number; count: number }> }>();
	for (const p of parts) {
		if (p.type === PartType.BaseAttack || p.type === PartType.BaseHealth || !side.counts(p)) continue;
		const group = GROUP_OF[p.type];
		if (!group) continue;
		const f = 1 + partHigh(p) / 1e4;
		const g = out.get(group) ?? { mult: 1, items: new Map() };
		g.mult *= f;
		const label = itemLabel(p);
		const item = g.items.get(label) ?? { mult: 1, count: 0 };
		item.mult *= f;
		item.count++;
		g.items.set(label, item);
		out.set(group, g);
	}
	return out;
}

/**
 * The score's breakdown for `parts`, scaled so it adds up to `score` (the in-game anchored number).
 * `before` (the starting parts) adds each section's change.
 */
export function cpBreakdown(parts: BattlePointPart[], isSupport: boolean, score: number, before?: BattlePointPart[]): CpBreakdown {
	const sides = isSupport ? SUPPORT_SIDES : DEALER_SIDES;
	const raw = sides.map((side) => {
		const basePart = parts.find((p) => p.type === side.baseType);
		const base = (basePart ? partHigh(basePart) : 0) / 1e4;
		const groups = groupsOf(parts, side);
		const prior = before ? groupsOf(before, side) : null;
		const priorBase = before?.find((p) => p.type === side.baseType);
		const baseWas = priorBase ? partHigh(priorBase) / 1e4 : base;
		const power = base * [...groups.values()].reduce((m, g) => m * g.mult, 1);
		return { side, base, baseWas, groups, prior, power };
	});
	const formula = raw.reduce((s, r) => s + r.power, 0);
	const anchor = formula > 0 ? score / formula : 1;
	return {
		total: score,
		anchor,
		sides: raw.map(({ side, base, baseWas, groups, prior, power }) => {
			const logSum = [...groups.values()].reduce((s, g) => s + Math.log(g.mult), 0);
			const gain = (power - base) * anchor;
			const total = power * anchor;
			const rows: BreakdownRow[] = [...groups].map(([group, g]) => {
				const was = prior?.get(group)?.mult ?? (prior ? 1 : g.mult);
				return {
					group,
					label: GROUP_LABELS[group],
					pct: (g.mult - 1) * 100,
					cp: logSum ? (gain * Math.log(g.mult)) / logSum : 0,
					change: (g.mult / was - 1) * 100,
					items: [...g.items].map(([label, it]) => ({ label, count: it.count, pct: (it.mult - 1) * 100 }))
				};
			});
			// Sections the edits removed entirely still show, as a loss.
			for (const [group, g] of prior ?? []) {
				if (groups.has(group)) continue;
				rows.push({ group, label: GROUP_LABELS[group], pct: 0, cp: 0, change: (1 / g.mult - 1) * 100, items: [] });
			}
			rows.sort((a, b) => b.cp - a.cp);
			return {
				label: side.label,
				base: { label: side.baseType === PartType.BaseHealth ? 'Base health' : 'Base attack', points: base * 1e4, cp: base * anchor, change: baseWas ? (base / baseWas - 1) * 100 : 0 },
				rows,
				total
			};
		})
	};
}
