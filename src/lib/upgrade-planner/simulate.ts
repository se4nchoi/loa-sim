// Combat power simulator: edit a character's gear and recompute CP.
//
// initSimState() reads the loadout into editable state; simulate() turns state back into
// battlePoint parts and a CP. With untouched state it returns the loadout's own parts, so the
// simulated CP starts exactly at lostark.bible's number. Every edit is applied as a delta on top
// of bible's values, which keeps unknown bonuses (titles, karma, etc.) intact.

import { PartType, baseAttackPoint, combatPower, partHigh } from './cp';
import { BRACELET_EFFECTS, GEM_SKILL_ALIAS } from './game-data';
import { HONING_SLOTS, HONING_TABLE, type HoningSlot } from './honing-data';
import {
	ACCESSORY_LINES,
	ASTROGEM_COEFF,
	GEM_T3,
	GEM_T4,
	KARMA_ENLIGHTENMENT_WEAPON_PCT_PER_LEVEL,
	KARMA_EVOLUTION_PER_RANK,
	KARMA_LEAP_PER_LEVEL,
	karmaRank,
	TIERS,
	astrogemOptionValue,
	engravingTable,
	type AccessoryFamily,
	type AccessoryLine,
	type CoreGrade,
	type CoreInfo,
	type Tier
} from './tables';
import type { BattlePointPart, Loadout } from './types';
import { astrogemTotals, coreStates, coreValueAs, engravingStates, weaponPowerOf } from './upgrades';

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
	/** Each gem, in the order of the loadout's gem parts. Only `level` affects Combat Power. */
	gems: SimGem[];
	/** Optional damage share per skill id, in percent of total damage; enables the DPS estimate. */
	skillShares: Record<number, number>;
	/** Per engraving id: relic book step (0–4 → 0/5/10/15/20 books) and ability stone level (0–4). */
	engravings: Record<number, { books: number; stone: number; /** Swapped to another engraving (its id). */ as?: number }>;
	/** Main stat (Str/Dex/Int) on each accessory. */
	accessoryStats: Partial<Record<AccessorySlot, number>>;
	/** Ark grid cores with their astrogems; core points and option totals are derived from these. */
	arkGrid: SimCore[];
	bracelet: SimBracelet | null;
	/** Karma levels (0–30) per tree; null when the loadout has no karma data. */
	karma: { evolution: number | null; enlightenment: number | null; leap: number | null };
}

export type GemKind = 'damage' | 'cooldown';

export interface SimGem {
	level: number;
	kind: GemKind;
	/** Skill the gem applies to, or null when unknown. */
	skill: number | null;
}

/** Bible's gem effect types: 5 = skill damage, 27 = skill cooldown. */
// Gem effects: 5 / 27 name a skill; 34 / 35 name a skill group (Guardian Knight skills, Brawl King Twelve Forms).
const GEM_EFFECT_TYPE: Record<number, GemKind> = { 5: 'damage', 27: 'cooldown', 34: 'damage', 35: 'cooldown' };

function readGems(l: Loadout): SimGem[] {
	const pool = [...(l.gems ?? [])];
	return gemParts(l).map((g) => {
		// Gem parts follow the gems' slot order; fall back to the first unused gem with the same id.
		const at = pool.findIndex((x) => x.id === g.id);
		const gem = at >= 0 ? pool.splice(at, 1)[0] : undefined;
		const effect = gem?.effects?.find((e) => GEM_EFFECT_TYPE[e.type]);
		return {
			level: g.level,
			kind: effect ? GEM_EFFECT_TYPE[effect.type] : g.kind === 'cooldown' ? 'cooldown' : 'damage',
			skill: effect ? (GEM_SKILL_ALIAS[effect.id] ?? effect.id) : null
		};
	});
}

export interface SimAstrogem {
	/** Item id (kind and grade); kept when edited so the icon and allowed options stay right. */
	itemId: number;
	corePoints: number;
	/** Willpower discount; the gem needs its kind's base willpower minus this. */
	costReduc: number;
	opts: { id: number; level: number }[];
}

export interface SimCore {
	id: number;
	gems: SimAstrogem[];
	/** Swapped core type: another grade, or (chaos) another option (id variant digit). Unset = the equipped core. */
	grade?: CoreGrade;
	variant?: number;
}

/** The id's option variant digit (chaos: sun 0 Flashy / 1 Stable / 2 Swift, moon 0 Smoldering / 1 Absorbing / 2 Crushing, star 0 Attack / 1 Weapon). */
export const coreVariant = (coreId: number) => Number(String(coreId)[5]);

/** The core type a simulated core has: the equipped one unless it was swapped. */
export function simCoreInfo(info: CoreInfo, core?: SimCore): CoreInfo {
	const grade = core?.grade ?? info.grade;
	// Both second-tier options of a sun / moon share one curve.
	const tier = core?.variant !== undefined ? (core.variant === 0 ? 0 : 1) : info.tier;
	if (grade === info.grade && tier === info.tier) return info;
	// The chaos star's second option is the Weapon core.
	return { ...info, grade, tier, weaponCore: info.attr === 'chaos' && info.shape === 'star' && tier === 1 };
}

/** Bracelet lines: plain stats (combat stats, main stat, ...) and effects from the battle point catalog. */
export interface SimBracelet {
	stats: { index: number; value: number }[];
	/** Catalog keys ("3:11041", "4:605100173"); unknown effects keep their key and score 0. */
	effects: string[];
}

/** Combat stats that count toward Combat Power (Crit, Specialization, Swiftness), x3 each. */
export const COMBAT_STAT_INDICES = [15, 16, 18];
const COMBAT_STAT_BP = 3;
/** Plain % stat lines on bracelets, scored as part 19 (game coefficients per 1e4). */
const BRACELET_STAT_COEFF: Record<number, number> = { 50: 7692, 74: 7000, 76: 3333 };
export const MAIN_STAT_INDICES = [3, 4, 5];
const braceletEffect = (key: string) => BRACELET_EFFECTS.find((e) => e.key === key);

/** Which of Str (3) / Dex (4) / Int (5) is this character's main stat. */
export function mainStatIndex(l: Loadout): number {
	const base = l.battlePoint.parts.find((p) => p.type === PartType.BaseAttack);
	const main = base?.mainStat as number | undefined;
	const stats = l.stats ?? [];
	const match = stats.find((s) => MAIN_STAT_INDICES.includes(s.type) && s.value === main);
	if (match) return match.type;
	const valueOf = (i: number) => stats.find((s) => s.type === i)?.value ?? 0;
	return MAIN_STAT_INDICES.reduce((best, i) => (valueOf(i) > valueOf(best) ? i : best));
}

const lineOf = (key: string) => ACCESSORY_LINES.find((l) => l.key === key);
const tierOf = (line: AccessoryLine, v: number): Tier | null => TIERS.find((t) => line.values[t] === v) ?? null;
const nearestTier = (line: AccessoryLine, v: number): Tier =>
	TIERS.reduce((best, t) => (Math.abs(line.values[t] - v) < Math.abs(line.values[best] - v) ? t : best), 'low' as Tier);

/** Names for accessory lines with no DPS value, keyed by stat type + index (index ignored when "*"). */
const OTHER_LINE_NAMES: Record<string, [name: string, percent: boolean]> = {
	'2:46': ['Brand Power', true],
	'2:27': ['Max HP', false],
	'2:28': ['Max MP', false],
	'2:34': ['HP Recovery in Combat', false],
	'51:*': ['Shield for Party Members', true],
	'54:*': ['Ally Atk. Power Enhancement Effect', true],
	'59:*': ['Ally Damage Enhancement Effect', true]
};

function otherLineLabel(s: { type: number; index: number; value: number }): string {
	const named = OTHER_LINE_NAMES[`${s.type}:${s.index}`] ?? OTHER_LINE_NAMES[`${s.type}:*`];
	if (!named) return 'Other (no DPS value)';
	const [name, percent] = named;
	return `${name} +${percent ? `${Number((s.value / 100).toFixed(2))}%` : s.value}`;
}

function readAccessoryLines(l: Loadout, slot: AccessorySlot): SimLine[] | undefined {
	const item = l.items?.find((i) => i.slot === slot);
	if (!item) return undefined;
	const family = familyOf(slot);
	return (item.data.stats ?? [])
		.filter((s) => !s.base)
		.map((s): SimLine => {
			const line = ACCESSORY_LINES.find((x) => x.slots.includes(family) && x.match(s));
			if (!line) return { key: 'other', label: otherLineLabel(s) };
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
	const msIndex = mainStatIndex(l);
	const accessoryStats: SimState['accessoryStats'] = {};
	for (const slot of ACCESSORY_SLOTS) {
		const stat = l.items
			?.find((i) => i.slot === slot)
			?.data.stats?.find((s) => s.base && s.type === 2 && s.index === msIndex);
		if (stat) accessoryStats[slot] = stat.value;
	}
	const braceletStats = l.items?.find((i) => i.slot === 'bracelet')?.data.stats;
	const bracelet: SimBracelet | null = braceletStats
		? {
				stats: braceletStats.filter((s) => s.type === 2).map((s) => ({ index: s.index, value: s.value })),
				effects: braceletStats.filter((s) => s.type === 3 || s.type === 4).map((s) => `${s.type}:${s.index}`)
			}
		: null;
	const leap = l.battlePoint.parts.find((p) => p.type === PartType.KarmaLeapLevel);
	return {
		gear,
		accessories,
		gems: readGems(l),
		skillShares: {},
		engravings: Object.fromEntries(engravingStates(l).map((e) => [e.id, { books: e.col, stone: e.stone }])),
		accessoryStats,
		arkGrid: (l.arkGridCores ?? []).map((c) => ({
			id: c.id,
			gems: c.gems
				.toSorted((a, b) => a.idx - b.idx)
				.map((g) => ({ itemId: g.id, corePoints: g.corePoints, costReduc: g.costReduc, opts: g.opts.map((o) => ({ ...o })) }))
		})),
		bracelet,
		karma: {
			evolution: l.karma?.evolution ?? null,
			enlightenment: l.karma?.enlightenment ?? null,
			leap: l.karma?.leap ?? (leap ? Math.round(partHigh(leap) / KARMA_LEAP_PER_LEVEL) : null)
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

const corePointsOf = (core: SimCore | undefined) => core?.gems.reduce((sum, g) => sum + g.corePoints, 0) ?? 0;

/** Total level of an astrogem option across every core. */
export const optionLevel = (arkGrid: SimCore[], optionId: number) =>
	arkGrid.reduce(
		(sum, c) => sum + c.gems.reduce((s, g) => s + g.opts.filter((o) => o.id === optionId).reduce((a, o) => a + o.level, 0), 0),
		0
	);

/** Core points a core has in this state (bible's points, moved by the astrogem edits). */
export function simCorePoints(l: Loadout, state: SimState, base: SimState, coreId: number): number {
	const bible = coreStates(l).find((c) => c.id === coreId)?.points ?? 0;
	const find = (s: SimState) => s.arkGrid.find((c) => c.id === coreId);
	return bible + corePointsOf(find(state)) - corePointsOf(find(base));
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
	for (const slot of ACCESSORY_SLOTS)
		mainStat += (Number(state.accessoryStats[slot]) || 0) - (base.accessoryStats[slot] ?? 0);
	const msIndex = mainStatIndex(l);
	const braceletStat = (b: SimBracelet | null, pick: (i: number) => boolean) =>
		(b?.stats ?? []).filter((s) => pick(s.index)).reduce((sum, s) => sum + (Number(s.value) || 0), 0);
	mainStat += braceletStat(state.bracelet, (i) => i === msIndex) - braceletStat(base.bracelet, (i) => i === msIndex);
	let weaponPower = weapon0;
	for (const slot of HONING_SLOTS) {
		const from = base.gear[slot];
		const to = state.gear[slot];
		if (!from || !to) continue;
		if (slot === 'weapon') weaponPower *= gearStat(slot, to) / gearStat(slot, from);
		else mainStat += (gearStat(slot, to) - gearStat(slot, from)) * ADVANCED_STAT_BONUS;
	}
	// Weapon Power % from accessories multiplies everything else; assume they're the only % source we can change.
	// Enlightenment karma adds Weapon Power % the same way.
	const karmaPct = (s: SimState) => (s.karma.enlightenment ?? 0) * KARMA_ENLIGHTENMENT_WEAPON_PCT_PER_LEVEL;
	const pct0 = linesTotal(base.accessories, 'percent') / 100 + karmaPct(base);
	const pct1 = linesTotal(state.accessories, 'percent') / 100 + karmaPct(state);
	weaponPower += (linesTotal(state.accessories, 'flat') - linesTotal(base.accessories, 'flat')) * (1 + pct0 / 100);
	weaponPower *= (100 + pct1) / (100 + pct0);
	if (mainStat0 && weapon0)
		basePart.value =
			partHigh(basePart) * (baseAttackPoint(mainStat, weaponPower, atkPct) / baseAttackPoint(mainStat0, weapon0, atkPct));

	// --- Gems (gemParts keeps the loadout's part order, so the k-th gem part lines up with state.gems[k])
	const gemIndices = parts.flatMap((p, i) => (p.type === PartType.Gem && typeof p.id === 'number' ? [i] : []));
	gemParts(l).forEach((g, k) => {
		const level = state.gems[k]?.level;
		if (g.table && level && level !== g.level) parts[gemIndices[k]].value = g.table[level - 1];
	});

	// --- Engravings
	for (const e of engravingStates(l)) {
		const s = state.engravings[e.id];
		const swapped = s?.as !== undefined && s.as !== e.id;
		const table = swapped ? (engravingTable(s.as!) ?? e.table) : e.table;
		if (s && (swapped || s.stone !== e.stone || s.books !== e.col))
			set(PartType.Engraving, (p) => p.id === e.id, table[s.stone][s.books]);
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

	// --- Ark grid: core points and option totals follow the edited astrogems, anchored on bible's values.
	for (const c of coreStates(l)) {
		const points = simCorePoints(l, state, base, c.id);
		const info = simCoreInfo(c.info, state.arkGrid.find((x) => x.id === c.id));
		if (points !== c.points || info !== c.info)
			set(PartType.ArkGridCore, (p) => p.id === c.id, coreValueAs(c, info, points, weapon0), { id: c.id });
	}
	const t = astrogemTotals(l);
	for (const id of Object.keys(ASTROGEM_COEFF).map(Number)) {
		const level = t.levels[id] + optionLevel(state.arkGrid, id) - optionLevel(base.arkGrid, id);
		if (level === t.levels[id]) continue;
		const value = t.values[id] + astrogemOptionValue(id, level) - astrogemOptionValue(id, t.levels[id]);
		set(PartType.ArkGridGem, (p) => p.id === id, value, { id });
	}

	// --- Bracelet: effects come straight from the game's battle point catalog; combat stats feed part 26.
	if (state.bracelet && JSON.stringify(state.bracelet) !== JSON.stringify(base.bracelet)) {
		for (let i = parts.length - 1; i >= 0; i--)
			if (parts[i].type === PartType.BraceletEffect || parts[i].type === PartType.BraceletStatType) parts.splice(i, 1);
		for (const key of state.bracelet.effects) {
			const effect = braceletEffect(key);
			if (effect) parts.push({ type: PartType.BraceletEffect, value: effect.value });
		}
		for (const st of state.bracelet.stats)
			if (BRACELET_STAT_COEFF[st.index])
				parts.push({ type: PartType.BraceletStatType, value: ((Number(st.value) || 0) * BRACELET_STAT_COEFF[st.index]) / 1e4 });
		const combat = (b: SimBracelet | null) => braceletStat(b, (i) => COMBAT_STAT_INDICES.includes(i));
		const dCombat = combat(state.bracelet) - combat(base.bracelet);
		const stats = parts.find((p) => p.type === PartType.CombatStats);
		if (dCombat && stats) stats.value = partHigh(stats) + dCombat * COMBAT_STAT_BP;
	}

	// --- Karma
	// Evolution karma scores by rank (derived from level), anchored on bible's value.
	if (state.karma.evolution !== null && base.karma.evolution !== null && state.karma.evolution !== base.karma.evolution) {
		const part = parts.find((p) => p.type === PartType.KarmaEvolutionRank);
		const rankDelta = karmaRank(state.karma.evolution) - karmaRank(base.karma.evolution);
		set(PartType.KarmaEvolutionRank, () => true, (part ? partHigh(part) : 0) + rankDelta * KARMA_EVOLUTION_PER_RANK);
	}
	if (state.karma.leap !== null && state.karma.leap !== base.karma.leap)
		set(PartType.KarmaLeapLevel, () => true, state.karma.leap * KARMA_LEAP_PER_LEVEL);

	return { parts, cp: combatPower(parts).max, mainStat, weaponPower };
}
