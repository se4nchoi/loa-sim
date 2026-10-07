import { PartType, partHigh, partRatio, ratioToPct } from './cp';
import {
	ACCESSORY_LINES,
	ASTROGEM_COEFF,
	ASTROGEM_OPTION_NAMES,
	CORE_BREAKPOINTS,
	ENGRAVING_BOOK_STEPS,
	ENGRAVING_NAMES,
	GEM_T3,
	GEM_T4,
	KARMA_EVOLUTION_MAX_RANK,
	KARMA_EVOLUTION_PER_RANK,
	KARMA_LEAP_MAX_LEVEL,
	KARMA_LEAP_PER_LEVEL,
	TIERS,
	astrogemOptionValue,
	coreValue,
	decodeCore,
	engravingTable,
	type AccessoryLine,
	type CoreInfo,
	type Tier
} from './tables';
import type { ArkGridGem, BattlePointPart, Loadout } from './types';

export type UpgradeCategory = 'gem' | 'core' | 'astrogem' | 'engraving' | 'accessory' | 'karma';

export interface Upgrade {
	/** Stable key, e.g. for remembering a user-entered gold cost. */
	key: string;
	category: UpgradeCategory;
	title: string;
	detail: string;
	/** Combat power gained, in percent of current CP. */
	gainPct: number;
	/** How many identical upgrades this row stands for (e.g. ten Lv. 9 gems). Gain is per one. */
	count: number;
	/** True when the value relies on an assumption rather than an exact table. */
	approximate: boolean;
	/** Alternatives that exclude each other (e.g. ability stone patterns) share a group. */
	group?: string;
}

/** Best row per group, for compact views like the sidebar card. */
export const topDistinct = (upgrades: Upgrade[], limit: number) => {
	const seen = new Set<string>();
	return upgrades
		.filter((u) => {
			const g = u.group ?? u.key;
			if (seen.has(g)) return false;
			seen.add(g);
			return true;
		})
		.slice(0, limit);
};

export const CATEGORY_LABELS: Record<UpgradeCategory, string> = {
	gem: 'Gems',
	core: 'Ark Grid Cores',
	astrogem: 'Astrogems',
	engraving: 'Engravings',
	accessory: 'Accessories',
	karma: 'Karma'
};

const num = (p: BattlePointPart, k: string) => (typeof p[k] === 'number' ? (p[k] as number) : undefined);
const partsOf = (l: Loadout, type: number) => l.battlePoint.parts.filter((p) => p.type === type);
const gain = (from: number, to: number) => ratioToPct(partRatio(from, to));

export function weaponPowerOf(l: Loadout): number {
	const base = l.battlePoint.parts.find((p) => p.type === PartType.BaseAttack);
	return (base && num(base, 'weaponPower')) ?? 0;
}

// --------------------------------------------------------------------------------------------- gems

function gemUpgrades(l: Loadout): Upgrade[] {
	const groups = new Map<string, Upgrade>();
	for (const p of partsOf(l, PartType.Gem)) {
		const id = num(p, 'id');
		if (!id) continue;
		const level = Math.floor(id / 10) % 100;
		const value = partHigh(p);
		const table = GEM_T4[level - 1] === value ? GEM_T4 : GEM_T3[level - 1] === value ? GEM_T3 : null;
		if (!table || level >= 10) continue;
		const tier = table === GEM_T4 ? 'T4' : 'T3';
		const key = `gem:${tier}:${level}`;
		const existing = groups.get(key);
		if (existing) {
			existing.count++;
			existing.detail = `${existing.count} gems at Lv. ${level}. Gain shown is per gem.`;
			continue;
		}
		groups.set(key, {
			key,
			category: 'gem',
			title: `${tier} gem Lv. ${level} → ${level + 1}`,
			detail: `1 gem at Lv. ${level}.`,
			gainPct: gain(value, table[level]),
			count: 1,
			approximate: false
		});
	}
	return [...groups.values()];
}

// --------------------------------------------------------------------------------------------- ark grid

export interface CoreState {
	index: number;
	id: number;
	info: CoreInfo;
	label: string;
	points: number;
	/** bible's current battle points for this core. */
	value: number;
	/** Our table's value at the current points, used to anchor deltas. */
	modelValue: number;
	gems: ArkGridGem[];
}

const SHAPE_LABEL = { sun: 'Sun', moon: 'Moon', star: 'Star' };
const ATTR_LABEL = { order: 'Order', chaos: 'Chaos' };
const GRADE_LABEL = { heroic: 'Heroic', legendary: 'Legendary', relic: 'Relic', ancient: 'Ancient' };

export const coreLabel = (info: CoreInfo) =>
	`${GRADE_LABEL[info.grade]} ${ATTR_LABEL[info.attr]} ${SHAPE_LABEL[info.shape]}`;

export function coreStates(l: Loadout): CoreState[] {
	const wp = weaponPowerOf(l);
	const parts = partsOf(l, PartType.ArkGridCore);
	return (l.arkGridCores ?? []).flatMap((core, index) => {
		let info = decodeCore(core.id);
		if (!info) return [];
		const part = parts.find((p) => num(p, 'id') === core.id);
		const points = (part && num(part, 'points')) ?? core.gems.reduce((s, g) => s + g.corePoints, 0);
		const value = part ? partHigh(part) : 0;
		// Chaos sun/moon option tier isn't recoverable from the id alone for every variant;
		// prefer whichever tier reproduces bible's value.
		if (info.attr === 'chaos' && info.shape !== 'star' && coreValue(info, points, wp) !== value) {
			const other = { ...info, tier: info.tier === 0 ? 1 : 0 };
			if (coreValue(other, points, wp) === value) info = other;
		}
		return [{ index, id: core.id, info, label: coreLabel(info), points, value, modelValue: coreValue(info, points, wp), gems: core.gems }];
	});
}

/** bible's value at the new point total, anchored on bible's current value. */
export function coreValueAt(state: CoreState, points: number, weaponPower: number) {
	return state.value + coreValue(state.info, points, weaponPower) - state.modelValue;
}

function coreUpgrades(l: Loadout): Upgrade[] {
	const wp = weaponPowerOf(l);
	return coreStates(l).flatMap((c) => {
		if (c.info.supportOnly) return [];
		const cap = c.info.grade === 'heroic' ? 10 : c.info.grade === 'legendary' ? 14 : 20;
		const next = CORE_BREAKPOINTS.find((bp) => bp > c.points && bp <= cap);
		if (!next) return [];
		const to = coreValueAt(c, next, wp);
		return [
			{
				key: `core:${c.id}:${next}`,
				category: 'core' as const,
				title: `${c.label} core → ${next}P`,
				detail: `Needs ${next - c.points} more core point${next - c.points > 1 ? 's' : ''} from its astrogems.`,
				gainPct: gain(c.value, to),
				count: 1,
				approximate: c.info.weaponCore || c.modelValue !== c.value
			}
		];
	});
}

export interface AstrogemTotals {
	/** option id → total level across all equipped astrogems */
	levels: Record<number, number>;
	/** option id → bible's current battle points */
	values: Record<number, number>;
}

export function astrogemTotals(l: Loadout): AstrogemTotals {
	const levels: Record<number, number> = {};
	const values: Record<number, number> = {};
	for (const id of Object.keys(ASTROGEM_COEFF).map(Number)) {
		const p = partsOf(l, PartType.ArkGridGem).find((x) => num(x, 'id') === id);
		levels[id] = (p && num(p, 'totalLevel')) ?? 0;
		values[id] = p ? partHigh(p) : 0;
	}
	return { levels, values };
}

/** CP % from adding `delta` levels to an astrogem option, anchored on bible's value. */
export function astrogemOptionGain(t: AstrogemTotals, optionId: number, delta: number) {
	if (!(optionId in ASTROGEM_COEFF)) return 0;
	const level = t.levels[optionId];
	const to = t.values[optionId] + astrogemOptionValue(optionId, level + delta) - astrogemOptionValue(optionId, level);
	return gain(t.values[optionId], to);
}

function astrogemUpgrades(l: Loadout): Upgrade[] {
	if (!l.arkGridCores?.some((c) => c.gems.length)) return [];
	const t = astrogemTotals(l);
	return Object.keys(ASTROGEM_COEFF).map((k) => {
		const id = Number(k);
		// Values are floored per total level, so a single level can round to 0. Average over 5.
		const per = astrogemOptionGain(t, id, 5) / 5;
		return {
			key: `astrogem:${id}`,
			category: 'astrogem' as const,
			title: `${ASTROGEM_OPTION_NAMES[id]} +1 level`,
			detail: `Total across astrogems: Lv. ${t.levels[id]}. Average of the next 5 levels.`,
			gainPct: per,
			count: 1,
			approximate: false
		};
	});
}

export interface AstrogemCandidate {
	corePoints: number;
	opts: { id: number; level: number }[];
}

export interface AstrogemSwapResult {
	gainPct: number;
	pointsBefore: number;
	pointsAfter: number;
	coreGainPct: number;
	optionGainPct: number;
}

/**
 * Value of placing `candidate` into core `coreIndex`, replacing the gem at `gemIdx`
 * (or filling an empty socket when `gemIdx` is null). Doesn't check willpower.
 */
export function evaluateAstrogemSwap(
	l: Loadout,
	coreIndex: number,
	gemIdx: number | null,
	candidate: AstrogemCandidate
): AstrogemSwapResult | null {
	const wp = weaponPowerOf(l);
	const core = coreStates(l).find((c) => c.index === coreIndex);
	if (!core) return null;
	const old = gemIdx === null ? undefined : core.gems.find((g) => g.idx === gemIdx);
	const pointsAfter = core.points - (old?.corePoints ?? 0) + candidate.corePoints;
	const coreRatio = partRatio(core.value, coreValueAt(core, pointsAfter, wp));

	const t = astrogemTotals(l);
	let optionRatio = 1;
	for (const id of Object.keys(ASTROGEM_COEFF).map(Number)) {
		const delta =
			candidate.opts.filter((o) => o.id === id).reduce((s, o) => s + o.level, 0) -
			(old?.opts ?? []).filter((o) => o.id === id).reduce((s, o) => s + o.level, 0);
		if (delta) optionRatio *= 1 + astrogemOptionGain(t, id, delta) / 100;
	}
	return {
		gainPct: ratioToPct(coreRatio * optionRatio),
		pointsBefore: core.points,
		pointsAfter,
		coreGainPct: ratioToPct(coreRatio),
		optionGainPct: ratioToPct(optionRatio)
	};
}

// --------------------------------------------------------------------------------------------- engravings

interface EngravingState {
	id: number;
	name: string;
	table: number[][];
	stone: number;
	/** Column in the table = relic books read (0/5/10/15/20). */
	col: number;
	value: number;
}

export function engravingStates(l: Loadout): EngravingState[] {
	return partsOf(l, PartType.Engraving).flatMap((p) => {
		const id = num(p, 'id');
		const table = id ? engravingTable(id) : undefined;
		if (!id || !table) return [];
		const stone = num(p, 'stonePoints') ?? 0;
		const value = partHigh(p);
		const col = table[stone]?.findIndex((v) => Math.abs(v - value) <= 2) ?? -1;
		if (col < 0) return [];
		return [{ id, name: ENGRAVING_NAMES[id] ?? `Engraving ${id}`, table, stone, col, value }];
	});
}

function engravingUpgrades(l: Loadout): Upgrade[] {
	return engravingStates(l).flatMap((e) =>
		e.col < ENGRAVING_BOOK_STEPS.length - 1
			? [
					{
						key: `engraving:${e.id}:books:${ENGRAVING_BOOK_STEPS[e.col + 1]}`,
						category: 'engraving' as const,
						title: `${e.name} relic books ${ENGRAVING_BOOK_STEPS[e.col]} → ${ENGRAVING_BOOK_STEPS[e.col + 1]}`,
						detail: 'Read 5 more relic engraving books.',
						gainPct: gain(e.value, e.table[e.stone][e.col + 1]),
						count: 1,
						approximate: false
					}
				]
			: []
	);
}

// --------------------------------------------------------------------------------------------- accessories

const SLOT_FAMILY: Record<string, 'neck' | 'ear' | 'finger'> = {
	neck: 'neck',
	ear1: 'ear',
	ear2: 'ear',
	finger1: 'finger',
	finger2: 'finger'
};
const SLOT_LABEL: Record<string, string> = {
	neck: 'Necklace',
	ear1: 'Earring 1',
	ear2: 'Earring 2',
	finger1: 'Ring 1',
	finger2: 'Ring 2'
};

const tierOf = (line: AccessoryLine, v: number): Tier | null => TIERS.find((t) => line.values[t] === v) ?? null;

function accessoryUpgrades(l: Loadout): Upgrade[] {
	const out: Upgrade[] = [];
	const weaponPctTotal =
		(l.items ?? [])
			.flatMap((i) => (SLOT_FAMILY[i.slot] ? (i.data.stats ?? []) : []))
			.filter((s) => s.type === 2 && s.index === 152)
			.reduce((sum, s) => sum + s.value, 0) / 100;
	for (const item of l.items ?? []) {
		const family = SLOT_FAMILY[item.slot];
		if (!family) continue;
		const lines = (item.data.stats ?? []).filter((s) => !s.base);
		for (const line of ACCESSORY_LINES.filter((x) => x.primary && x.slots.includes(family))) {
			let current = lines.find((s) => line.match(s))?.value ?? 0;
			if (line.key === 'outgoing_dmg') {
				// Combat-effect lines carry no value in item stats; bible's battle point equals the % × 100.
				const part = partsOf(l, PartType.AccessoryCombatEffect).find((p) => p.slot === item.slot);
				current = part ? partHigh(part) : 0;
			}
			if (current >= line.values.high) continue;
			const tier = tierOf(line, current);
			const from = current === 0 ? 'none' : (tier ?? `${current / 100}%`);
			let gainPct: number;
			if (line.toBattlePoints) {
				gainPct = gain(line.toBattlePoints(current), line.toBattlePoints(line.values.high));
			} else {
				// Weapon Power % scales base attack by √(weapon power).
				const p = weaponPctTotal;
				gainPct = (Math.sqrt((100 + p - current / 100 + line.values.high / 100) / (100 + p)) - 1) * 100;
			}
			out.push({
				key: `accessory:${item.slot}:${line.key}`,
				category: 'accessory',
				title: `${SLOT_LABEL[item.slot]}: ${line.name} ${from} → high`,
				group: `accessory:${item.slot}`,
				detail:
					current === 0
						? `Replace a non-damage line with ${line.name} +${line.values.high / 100}% (new accessory).`
						: `${line.name} +${current / 100}% → +${line.values.high / 100}% (new accessory).`,
				gainPct,
				count: 1,
				approximate: !line.toBattlePoints
			});
		}
	}
	return out;
}

// --------------------------------------------------------------------------------------------- karma

function karmaUpgrades(l: Loadout): Upgrade[] {
	const out: Upgrade[] = [];
	const evo = partsOf(l, PartType.KarmaEvolutionRank)[0];
	const evoValue = evo ? partHigh(evo) : 0;
	const rank = Math.round(evoValue / KARMA_EVOLUTION_PER_RANK);
	if (evo && rank < KARMA_EVOLUTION_MAX_RANK)
		out.push({
			key: `karma:evolution:${rank + 1}`,
			category: 'karma',
			title: `Evolution karma rank ${rank} → ${rank + 1}`,
			detail: 'From Evolution karma experience.',
			gainPct: gain(evoValue, evoValue + KARMA_EVOLUTION_PER_RANK),
			count: 1,
			approximate: false
		});
	const leap = partsOf(l, PartType.KarmaLeapLevel)[0];
	const leapValue = leap ? partHigh(leap) : 0;
	const level = Math.round(leapValue / KARMA_LEAP_PER_LEVEL);
	if (leap && level < KARMA_LEAP_MAX_LEVEL)
		out.push({
			key: `karma:leap:${level + 1}`,
			category: 'karma',
			title: `Leap karma level ${level} → ${level + 1}`,
			detail: 'From Leap karma experience.',
			gainPct: gain(leapValue, leapValue + KARMA_LEAP_PER_LEVEL),
			count: 1,
			approximate: false
		});
	return out;
}

// ---------------------------------------------------------------------------------------------

/** Every one-step upgrade available to this loadout, best first. Dealers only. */
export function buildUpgrades(l: Loadout): Upgrade[] {
	if (l.battlePoint.isSupport) return [];
	return [
		...gemUpgrades(l),
		...coreUpgrades(l),
		...astrogemUpgrades(l),
		...engravingUpgrades(l),
		...accessoryUpgrades(l),
		...karmaUpgrades(l)
	]
		.filter((u) => u.gainPct > 0.0005)
		.sort((a, b) => b.gainPct - a.gainPct);
}
