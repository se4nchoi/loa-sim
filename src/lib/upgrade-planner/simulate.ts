// Combat power simulator: edit a character's gear and recompute CP.
//
// initSimState() reads the loadout into editable state; simulate() turns state back into
// battlePoint parts and a CP. With untouched state it returns the loadout's own parts, so the
// simulated CP starts exactly at lostark.bible's number. Every edit is applied as a delta on top
// of bible's values, which keeps unknown bonuses (titles, karma, etc.) intact.

import { PartType, baseAttackPoint, combatPower, partHigh } from './cp';
import { HONING_SLOTS, HONING_TABLE, type HoningSlot } from './honing-data';
import {
	ACCESSORY_LINES,
	ASTROGEM_COEFF,
	GEM_T3,
	GEM_T4,
	KARMA_EVOLUTION_PER_RANK,
	KARMA_LEAP_PER_LEVEL,
	TIERS,
	astrogemOptionValue,
	type AccessoryFamily,
	type AccessoryLine,
	type Tier
} from './tables';
import type { BattlePointPart, Loadout } from './types';
import { astrogemTotals, coreStates, coreValueAt, engravingStates, weaponPowerOf } from './upgrades';

/** Advanced honing level 30+ adds this much to the item's stats; fits bible's main stat to 0.05%. */
const ADVANCED_STAT_BONUS = 1.02;
const HONING_BASE_ILVL = 1675;
/** Every T4 1675 "Destined Tremor" piece has an id 134621xxx; the honing table only covers that set. */
const isTableGear = (itemId: number) => Math.floor(itemId / 1000) === 134621;

export const ACCESSORY_SLOTS = ['neck', 'ear1', 'ear2', 'finger1', 'finger2'] as const;
export type AccessorySlot = (typeof ACCESSORY_SLOTS)[number];
export const familyOf = (slot: AccessorySlot): AccessoryFamily =>
	slot === 'neck' ? 'neck' : slot.startsWith('ear') ? 'ear' : 'finger';

/** One accessory grinding line: a known DPS line at a tier, or a line with no DPS value. */
export type DpsLine = { key: string; tier: Tier };
export type OtherLine = { key: 'other'; label: string };
export type SimLine = DpsLine | OtherLine;
export const isOtherLine = (ln: SimLine): ln is OtherLine => ln.key === 'other';

export interface SimState {
	gear: Partial<Record<HoningSlot, { honing: number; advanced: number }>>;
	accessories: Partial<Record<AccessorySlot, SimLine[]>>;
	/** Level of each gem, in the order of the loadout's gem parts. */
	gems: number[];
	/** Per engraving id: relic book step (0–4 → 0/5/10/15/20 books) and ability stone level (0–4). */
	engravings: Record<number, { books: number; stone: number }>;
	/** Core points per ark grid core id. */
	cores: Record<number, number>;
	/** Total level per astrogem option id. */
	astrogems: Record<number, number>;
	karma: { evolution: number | null; leap: number | null };
}

const lineOf = (key: string) => ACCESSORY_LINES.find((l) => l.key === key);
const tierOf = (line: AccessoryLine, v: number): Tier | null => TIERS.find((t) => line.values[t] === v) ?? null;
const nearestTier = (line: AccessoryLine, v: number): Tier =>
	TIERS.reduce((best, t) => (Math.abs(line.values[t] - v) < Math.abs(line.values[best] - v) ? t : best), 'low' as Tier);

function readAccessoryLines(l: Loadout, slot: AccessorySlot): SimLine[] | undefined {
	const item = l.items?.find((i) => i.slot === slot);
	if (!item) return undefined;
	const family = familyOf(slot);
	return (item.data.stats ?? [])
		.filter((s) => !s.base)
		.map((s): SimLine => {
			const line = ACCESSORY_LINES.find((x) => x.slots.includes(family) && x.match(s));
			if (!line) return { key: 'other', label: 'Other (no DPS value)' };
			if (line.combatEffect) {
				// Combat effects carry no value in item stats; bible's battle point is the % × 100.
				const part = l.battlePoint.parts.find((p) => p.type === PartType.AccessoryCombatEffect && p.slot === slot);
				return { key: line.key, tier: nearestTier(line, part ? partHigh(part) : 0) };
			}
			return { key: line.key, tier: tierOf(line, s.value) ?? nearestTier(line, s.value) };
		});
}

export function initSimState(l: Loadout): SimState {
	const gear: SimState['gear'] = {};
	for (const slot of HONING_SLOTS) {
		const item = l.items?.find((i) => i.slot === slot);
		const honing = item?.data.honing;
		if (item && isTableGear(item.id) && typeof honing === 'number')
			gear[slot] = { honing, advanced: typeof item?.data.advancedHoning === 'number' ? item.data.advancedHoning : 0 };
	}
	const accessories: SimState['accessories'] = {};
	for (const slot of ACCESSORY_SLOTS) {
		const lines = readAccessoryLines(l, slot);
		if (lines) accessories[slot] = lines;
	}
	const evo = l.battlePoint.parts.find((p) => p.type === PartType.KarmaEvolutionRank);
	const leap = l.battlePoint.parts.find((p) => p.type === PartType.KarmaLeapLevel);
	return {
		gear,
		accessories,
		gems: gemParts(l).map((g) => g.level),
		engravings: Object.fromEntries(engravingStates(l).map((e) => [e.id, { books: e.col, stone: e.stone }])),
		cores: Object.fromEntries(coreStates(l).map((c) => [c.id, c.points])),
		astrogems: { ...astrogemTotals(l).levels },
		karma: {
			evolution: evo ? Math.round(partHigh(evo) / KARMA_EVOLUTION_PER_RANK) : null,
			leap: leap ? Math.round(partHigh(leap) / KARMA_LEAP_PER_LEVEL) : null
		}
	};
}

export interface GemPart {
	part: BattlePointPart;
	id: number;
	level: number;
	table: number[] | null;
	tier: 'T4' | 'T3' | null;
	kind: 'damage' | 'cooldown' | 'other';
}

export function gemParts(l: Loadout): GemPart[] {
	return l.battlePoint.parts
		.filter((p) => p.type === PartType.Gem && typeof p.id === 'number')
		.map((part) => {
			const id = part.id as number;
			const level = Math.floor(id / 10) % 100;
			const v = partHigh(part);
			const table = GEM_T4[level - 1] === v ? GEM_T4 : GEM_T3[level - 1] === v ? GEM_T3 : null;
			const kindDigit = Math.floor(id / 1000) % 10; // 6503[1]xxx: 1 = damage (Doomfire), 2 = cooldown (Blazing)
			const tier = table === GEM_T4 ? 'T4' : table === GEM_T3 ? 'T3' : null;
			return { part, id, level, table, tier, kind: kindDigit === 1 ? 'damage' : kindDigit === 2 ? 'cooldown' : 'other' };
		});
}

const gearStat = (slot: HoningSlot, g: { honing: number; advanced: number }) =>
	HONING_TABLE[slot].honing[g.honing] + HONING_TABLE[slot].advanced[g.advanced];

/** Item level as bible shows it: the mean of the six pieces' honing item levels. */
export function itemLevel(state: SimState): number | null {
	const slots = HONING_SLOTS.filter((s) => state.gear[s]);
	if (slots.length !== HONING_SLOTS.length) return null;
	return slots.reduce((sum, s) => sum + HONING_BASE_ILVL + 5 * state.gear[s]!.honing, 0) / slots.length;
}

function linesTotal(lines: SimState['accessories'], weapon: 'percent' | 'flat') {
	let total = 0;
	for (const slot of ACCESSORY_SLOTS)
		for (const ln of lines[slot] ?? []) {
			if (isOtherLine(ln)) continue;
			const line = lineOf(ln.key);
			if (line?.weapon === weapon) total += line.values[ln.tier];
		}
	return total;
}

export interface SimResult {
	parts: BattlePointPart[];
	cp: number;
	mainStat: number;
	weaponPower: number;
}

export function simulate(l: Loadout, state: SimState, base: SimState = initSimState(l)): SimResult {
	const parts = l.battlePoint.parts.map((p) => ({ ...p }));
	const set = (type: number, match: (p: BattlePointPart) => boolean, value: number, extra: Record<string, unknown> = {}) => {
		const existing = parts.find((p) => p.type === type && match(p));
		if (existing) existing.value = value;
		else parts.push({ type, value, ...extra });
	};

	// --- Base attack: honing changes main stat (armor) and Weapon Power (weapon); accessories can add Weapon Power.
	const basePart = parts.find((p) => p.type === PartType.BaseAttack)!;
	const mainStat0 = (basePart.mainStat as number | undefined) ?? 0;
	const weapon0 = weaponPowerOf(l);
	const atkPct = (basePart.attackPowerMultiplier as number | undefined) ?? 0;
	let mainStat = mainStat0;
	let weaponPower = weapon0;
	for (const slot of HONING_SLOTS) {
		const from = base.gear[slot];
		const to = state.gear[slot];
		if (!from || !to) continue;
		if (slot === 'weapon') weaponPower *= gearStat(slot, to) / gearStat(slot, from);
		else mainStat += (gearStat(slot, to) - gearStat(slot, from)) * ADVANCED_STAT_BONUS;
	}
	// Weapon Power % from accessories multiplies everything else; assume they're the only % source we can change.
	const pct0 = linesTotal(base.accessories, 'percent') / 100;
	const pct1 = linesTotal(state.accessories, 'percent') / 100;
	weaponPower += (linesTotal(state.accessories, 'flat') - linesTotal(base.accessories, 'flat')) * (1 + pct0 / 100);
	weaponPower *= (100 + pct1) / (100 + pct0);
	if (mainStat0 && weapon0)
		basePart.value =
			partHigh(basePart) * (baseAttackPoint(mainStat, weaponPower, atkPct) / baseAttackPoint(mainStat0, weapon0, atkPct));

	// --- Gems (gemParts keeps the loadout's part order, so the k-th gem part lines up with state.gems[k])
	const gemIndices = parts.flatMap((p, i) => (p.type === PartType.Gem && typeof p.id === 'number' ? [i] : []));
	gemParts(l).forEach((g, k) => {
		const level = state.gems[k];
		if (g.table && level && level !== g.level) parts[gemIndices[k]].value = g.table[level - 1];
	});

	// --- Engravings
	for (const e of engravingStates(l)) {
		const s = state.engravings[e.id];
		if (s && (s.stone !== e.stone || s.books !== e.col))
			set(PartType.Engraving, (p) => p.id === e.id, e.table[s.stone][s.books]);
	}

	// --- Accessories: rebuild the grinding (15) and combat effect (17) parts of every edited slot.
	for (const slot of ACCESSORY_SLOTS) {
		const lines = state.accessories[slot];
		if (!lines || JSON.stringify(lines) === JSON.stringify(base.accessories[slot])) continue;
		for (let i = parts.length - 1; i >= 0; i--) {
			const p = parts[i];
			if ((p.type === PartType.AccessoryGrinding || p.type === PartType.AccessoryCombatEffect) && p.slot === slot)
				parts.splice(i, 1);
		}
		for (const ln of lines) {
			if (isOtherLine(ln)) continue;
			const line = lineOf(ln.key);
			if (!line?.toBattlePoints) continue;
			parts.push({
				type: line.combatEffect ? PartType.AccessoryCombatEffect : PartType.AccessoryGrinding,
				value: line.toBattlePoints(line.values[ln.tier]),
				slot
			});
		}
	}

	// --- Ark grid cores and astrogem options
	const wp = weapon0;
	for (const c of coreStates(l)) {
		const points = state.cores[c.id];
		if (points !== undefined && points !== c.points) set(PartType.ArkGridCore, (p) => p.id === c.id, coreValueAt(c, points, wp), { id: c.id });
	}
	const t = astrogemTotals(l);
	for (const id of Object.keys(ASTROGEM_COEFF).map(Number)) {
		const level = state.astrogems[id];
		if (typeof level !== 'number' || level === t.levels[id]) continue; // empty input → unchanged
		const value = t.values[id] + astrogemOptionValue(id, level) - astrogemOptionValue(id, t.levels[id]);
		set(PartType.ArkGridGem, (p) => p.id === id, value, { id });
	}

	// --- Karma
	if (state.karma.evolution !== null && state.karma.evolution !== base.karma.evolution)
		set(PartType.KarmaEvolutionRank, () => true, state.karma.evolution * KARMA_EVOLUTION_PER_RANK);
	if (state.karma.leap !== null && state.karma.leap !== base.karma.leap)
		set(PartType.KarmaLeapLevel, () => true, state.karma.leap * KARMA_LEAP_PER_LEVEL);

	return { parts, cp: combatPower(parts).max, mainStat, weaponPower };
}
