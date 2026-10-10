// Combat power simulator: edit a character's gear and recompute CP.
//
// initSimState() reads the loadout into editable state; simulate() turns state back into
// battlePoint parts and a CP. With untouched state it returns the loadout's own parts, so the
// simulated CP starts exactly at lostark.bible's number. Every edit is applied as a delta on top
// of bible's values, which keeps unknown bonuses (titles, karma, etc.) intact.

import { PartType, baseAttackPoint, partHigh } from './cp';
import { bracerStats, readBracer, type SimBracer } from './bracer';
import { BRACELET_EFFECTS, GEM_BASE_ATTACK, GEM_REGULAR, GEM_SKILL_ALIAS } from './game-data';
import { HONING_SLOTS, HONING_TABLE, AEGIR_HONING_TABLE, type HoningSlot } from './honing-data';
import { roleOf } from './roles';
import { qualityStat, readQuality, type SimQuality } from './quality';
import { CLASS_HP_COEFFICIENT } from './quality-data';
import { readSkinBonus, skinStatRatio, type SimSkins } from './skins';
import { ORBS, orbValue, readParadise, type SimParadise } from './paradise';
import { SUPPORT_ACCESSORY_LINES, supportCoreValue, supportWeaponCoreStats, swappedCoreId, type SupportAccessoryLine } from './support';
import {
	ACCESSORY_LINES,
	CORE_BREAKPOINTS,
	KARMA_ENLIGHTENMENT_WEAPON_PCT_PER_LEVEL,
	KARMA_EVOLUTION_HP_PER_LEVEL,
	KARMA_LEAP_PER_LEVEL,
	karmaRank,
	TIERS,
	formatLineValue,
	type AccessoryFamily,
	type AccessoryLine,
	type CoreGrade,
	type CoreInfo,
	type Tier
} from './tables';
import type { BattlePointPart, Loadout } from './types';
import { readSidereal, siderealBattlePoints, siderealItemLevel, siderealWeaponPower, type SimSidereal } from './sidereal';
import { stoneAtkPct, stoneLevelNodes } from './stones';
import { astrogemTotals, coreStates, coreValueAs, engravingStates, weaponPowerOf, type CoreState } from './upgrades';

/** Advanced honing level 30+ adds this much to the item's stats; fits bible's main stat to 0.05%. */
const ADVANCED_STAT_BONUS = 1.02;
/** Omitted set retains compatibility with existing Serca simulation state. */
export type SimGear = { honing: number; advanced: number; set?: 'aegir' };
const gearSet = (itemId: number) => {
	const prefix = Math.floor(itemId / 1000);
	return prefix === 134621 ? 'serca' : prefix === 134611 || prefix === 134613 ? 'aegir' : null;
};
export const gearItemLevel = (g: SimGear) =>
	(g.set === 'aegir' ? 1590 + g.advanced : 1675) + 5 * g.honing;

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
	bracer: SimBracer | null;
	sidereal: SimSidereal | null;
	gear: Partial<Record<HoningSlot, SimGear>>;
	quality: SimQuality;
	accessories: Partial<Record<AccessorySlot, SimLine[]>>;
	/** Each gem, in the order of the loadout's gem parts. Only `level` affects Combat Power. */
	gems: SimGem[];
	/** Optional damage share per skill id, in percent of total damage; enables the DPS estimate. */
	skillShares: Record<number, number>;
	/** Optional share of the fight each skill spends on cooldown, in percent (blank = 100%); refines cooldown gems. */
	skillCooldownUse: Record<number, number>;
	/** Per engraving id: relic book step (0–4 → 0/5/10/15/20 books) and ability stone level (0–4). */
	engravings: Record<
		number,
		{
			books: number;
			stone: number;
			/** Swapped to another engraving (its id). */
			as?: number;
			/** Added in an empty slot (not on the character); keyed by its own id. */
			added?: boolean;
		}
	>;
	/** Main stat (Str/Dex/Int) on each accessory. */
	accessoryStats: Partial<Record<AccessorySlot, number>>;
	/** Ark grid cores with their astrogems; core points and option totals are derived from these. */
	arkGrid: SimCore[];
	bracelet: SimBracelet | null;
	skins: SimSkins;
	/** Paradise orb and the Paradise power it scales with; null without an orb. */
	paradise: SimParadise | null;
	/** Karma levels (0–30) per tree; null when the loadout has no karma data. */
	karma: { evolution: number | null; enlightenment: number | null; leap: number | null };
}

export type GemKind = 'damage' | 'cooldown';

export interface SimGem {
	tier?: 'T3' | 'T4';
	level: number;
	kind: GemKind;
	/** Skill the gem applies to, or null when unknown. */
	skill: number | null;
}

// Gem effects: 5 / 27 name a skill; 34 / 35 name a skill group (Guardian Knight skills, Brawl King Twelve Forms).
// Support damage gems also carry buff / shield / heal / Atk. Power amplify effects: 58 / 60 / 62 / 64 on a skill,
// 59 / 61 / 63 / 65 on a skill group (e.g. "Yin Yang Skill").
const GEM_EFFECT_TYPE: Record<number, GemKind> = {
	5: 'damage', 27: 'cooldown', 34: 'damage', 35: 'cooldown',
	58: 'damage', 59: 'damage', 60: 'damage', 61: 'damage', 62: 'damage', 63: 'damage', 64: 'damage', 65: 'damage'
};

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
	/** Unequipped in the simulator; retain its cuts so the slot can be restored. */
	removed?: boolean;
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

/**
 * A bracelet line: a plain stat (combat stat, main stat, Vitality, ...), an effect from the battle point catalog
 * ("3:11041", "4:605100173"; unknown effects keep their key and score 0), or an empty slot.
 */
export type BraceletLine =
	/** `type` 2 (default) = plain stat by index; 54 / 59 = Ally Atk. Power / Damage Enhancement % (supports). */
	| { kind: 'stat'; index: number; value: number; type?: number }
	| { kind: 'effect'; key: string }
	| { kind: 'empty' };

/** T4 bracelets have five lines; each can be a stat or an effect. */
export const BRACELET_LINES = 5;

export interface SimBracelet {
	lines: BraceletLine[];
}

export const braceletStats = (b: SimBracelet | null) =>
	(b?.lines ?? []).filter((x): x is Extract<BraceletLine, { kind: 'stat' }> => x.kind === 'stat');
export const braceletEffects = (b: SimBracelet | null) =>
	(b?.lines ?? []).filter((x): x is Extract<BraceletLine, { kind: 'effect' }> => x.kind === 'effect').map((x) => x.key);

/** Stat index for Strength, Dexterity and Intelligence together (bracelet main stat lines). */
const ALL_MAIN_STATS = 11;
/** Flat Weapon Power (accessory lines, the bracelet's Weapon Power effect). */
const WEAPON_POWER_FLAT = 151;
/**
 * Permanent Weapon Power from a bracelet special effect ("Weapon Power +9,000. When your HP is…"). The game counts
 * it in base attack, not in the effect's battle points; "On hit, Weapon Power +…" effects are only the latter.
 */
const effectWeaponPower = (key: string) => {
	const m = BRACELET_EFFECTS.find((e) => e.key === key)?.text.match(/^Weapon Power \+([\d,]+)/);
	return m ? Number(m[1].replaceAll(',', '')) : 0;
};

/** Combat stats that count toward a dealer's Combat Power (Crit, Specialization, Swiftness). */
export const COMBAT_STAT_INDICES = [15, 16, 18];
export const MAIN_STAT_INDICES = [3, 4, 5];

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

/** Every accessory line by key (dealer and support keys don't collide; shared Weapon Power lines are identical). */
const ALL_LINES: SupportAccessoryLine[] = [...ACCESSORY_LINES, ...SUPPORT_ACCESSORY_LINES];
export const lineOf = (key: string) => ALL_LINES.find((l) => l.key === key);
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

function otherLineLabel(s: { type: number; index: number; value: number }, support: boolean): string {
	// A line that scores for the other role (e.g. Crit Rate on a support) keeps its name.
	const line = ALL_LINES.find((x) => !x.combatEffect && x.match(s));
	if (line) return `${line.name} ${formatLineValue(line, s.value)}`;
	const named = OTHER_LINE_NAMES[`${s.type}:${s.index}`] ?? OTHER_LINE_NAMES[`${s.type}:*`];
	if (!named) return `Other (no ${support ? 'support' : 'DPS'} value)`;
	const [name, percent] = named;
	return `${name} +${percent ? `${Number((s.value / 100).toFixed(2))}%` : s.value}`;
}

function readAccessoryLines(l: Loadout, slot: AccessorySlot): SimLine[] | undefined {
	const item = l.items?.find((i) => i.slot === slot);
	if (!item) return undefined;
	const family = familyOf(slot);
	const lines = roleOf(l).accessoryLines;
	return (item.data.stats ?? [])
		.filter((s) => !s.base)
		.map((s): SimLine => {
			const line = lines.find((x) => x.slots.includes(family) && x.match(s));
			if (!line) return { key: 'other', label: otherLineLabel(s, l.battlePoint.isSupport) };
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
		if (item && gearSet(item.id) && typeof honing === 'number')
			gear[slot] = { ...(gearSet(item.id) === 'aegir' ? { set: 'aegir' as const } : {}), honing,
				advanced: gearSet(item.id) === 'serca' ? 40 : typeof item.data.advancedHoning === 'number' ? item.data.advancedHoning : 0 };
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
	const braceletData = l.items?.find((i) => i.slot === 'bracelet')?.data.stats;
	let bracelet: SimBracelet | null = null;
	if (braceletData) {
		// Bible lists the lines in game order: the fixed stat lines first, then the rolled ones.
		const lines: BraceletLine[] = braceletData.flatMap((st): BraceletLine[] =>
			st.type === 2
				? [{ kind: 'stat', index: st.index, value: st.value }]
				: st.type === 54 || st.type === 59
					? [{ kind: 'stat', type: st.type, index: st.index, value: st.value }]
					: st.type === 3 || st.type === 4
					? [{ kind: 'effect', key: `${st.type}:${st.index}` }]
					: []
		);
		while (lines.length < BRACELET_LINES) lines.push({ kind: 'empty' });
		bracelet = { lines };
	}
	const leap = l.battlePoint.parts.find((p) => p.type === PartType.KarmaLeapLevel);
	return {
		bracer: readBracer(l),
		sidereal: readSidereal(l),
		gear,
		quality: readQuality(l),
		accessories,
		gems: readGems(l),
		skillShares: {},
		skillCooldownUse: {},
		engravings: Object.fromEntries(engravingStates(l).map((e) => [e.id, { books: e.col, stone: e.stone }])),
		accessoryStats,
		arkGrid: (l.arkGridCores ?? []).map((c) => ({
			id: c.id,
			gems: c.gems
				.toSorted((a, b) => a.idx - b.idx)
				.map((g) => ({ itemId: g.id, corePoints: g.corePoints, costReduc: g.costReduc, opts: g.opts.map((o) => ({ ...o })) }))
		})),
		bracelet,
		skins: { bonus: readSkinBonus(l, msIndex), currentBonus: null },
		paradise: readParadise(l),
		karma: {
			evolution: l.karma?.evolution ?? null,
			enlightenment: l.karma?.enlightenment ?? null,
			leap: l.karma?.leap ?? (leap ? Math.round(partHigh(leap) / KARMA_LEAP_PER_LEVEL) : null)
		}
	};
}

export interface GemPart {
	part: BattlePointPart;
	/** The equipped gem's item id (what bible's gem list uses). */
	id: number;
	/** The regular gem id it behaves as: itself, or the regular gem an event gem stands for. */
	regular: number;
	level: number;
	table: number[] | null;
	tier: 'T4' | 'T3' | null;
	kind: 'damage' | 'cooldown' | 'other';
}

export function gemParts(l: Loadout): GemPart[] {
	const { gemT4, gemT3 } = roleOf(l);
	return l.battlePoint.parts
		.filter((p) => p.type === PartType.Gem && typeof p.id === 'number')
		.map((part) => {
			const id = part.id as number;
			// 650[tier][kind][level 2 digits][bound]; event gems (6509xxxx) name the regular gem they behave as.
			const regular = GEM_REGULAR[id] ?? id;
			const level = Math.floor(regular / 10) % 100;
			const v = partHigh(part);
			const table = gemT4[level - 1] === v ? gemT4 : gemT3[level - 1] === v ? gemT3 : null;
			const kindDigit = Math.floor(regular / 1000) % 10; // 6503[1]xxx: 1 = damage (Doomfire), 2 = cooldown (Blazing)
			const tier = table === gemT4 ? 'T4' : table === gemT3 ? 'T3' : null;
			return { part, id, regular, level, table, tier, kind: kindDigit === 1 ? 'damage' : kindDigit === 2 ? 'cooldown' : 'other' };
		});
}

const gearStat = (slot: HoningSlot, g: SimGear) => {
	const table = (g.set === 'aegir' ? AEGIR_HONING_TABLE : HONING_TABLE)[slot];
	return table.honing[g.honing] + table.advanced[g.set === 'aegir' ? g.advanced : 40];
};

/** Item level as bible shows it: the mean of the six pieces' honing item levels. */
export function itemLevel(state: SimState): number | null {
	const slots = HONING_SLOTS.filter((s) => state.gear[s] || (s === 'weapon' && state.sidereal));
	if (slots.length !== HONING_SLOTS.length) return null;
	return slots.reduce((sum, s) => sum + (s === 'weapon' && state.sidereal
		? siderealItemLevel(state.sidereal) : gearItemLevel(state.gear[s]!)), 0) / slots.length;
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

const corePointsOf = (core: SimCore | undefined) => core?.gems.reduce((sum, g) => sum + (g.removed ? 0 : g.corePoints), 0) ?? 0;

/** Total level of an astrogem option across every core. */
export const optionLevel = (arkGrid: SimCore[], optionId: number) =>
	arkGrid.reduce(
		(sum, c) => sum + c.gems.reduce((s, g) => s + (g.removed ? 0 : g.opts.filter((o) => o.id === optionId).reduce((a, o) => a + o.level, 0)), 0),
		0
	);

/** Core points a core has in this state (bible's points, moved by the astrogem edits). */
export function simCorePoints(l: Loadout, state: SimState, base: SimState, coreId: number): number {
	const bible = coreStates(l).find((c) => c.id === coreId)?.points ?? 0;
	const find = (s: SimState) => s.arkGrid.find((c) => c.id === coreId);
	return bible + corePointsOf(find(state)) - corePointsOf(find(base));
}

/**
 * A core's battle points in this state: its type (swapped grade / option) at `points`, anchored on bible while it
 * is still the equipped type. Supports score by exact core id; `defense` cores score Shield & Heal Power.
 */
export function simCoreValue(c: CoreState, core: SimCore | undefined, points: number, weaponPower: number): { value: number; defense: boolean } {
	if (!c.support) return { value: coreValueAs(c, simCoreInfo(c.info, core), points, weaponPower), defense: false };
	const id = core?.grade !== undefined || core?.variant !== undefined ? swappedCoreId(c.id, core.grade ?? c.info.grade, core.variant) : c.id;
	const model = supportCoreValue(id, points);
	if (points < CORE_BREAKPOINTS[0]) return model;
	return id === c.id ? { value: c.value + model.value - c.modelValue, defense: c.defense } : model;
}

export interface SimResult {
	parts: BattlePointPart[];
	cp: number;
	mainStat: number;
	weaponPower: number;
}

/** Node counts of the equipped ability stone's two engraving lines (the third is the penalty line). */
function stoneNodesOf(l: Loadout): number[] | null {
	const lines = l.items?.find((i) => i.slot === 'ability_stone')?.data.engravings as { nodes: number }[] | undefined;
	return lines?.length ? lines.slice(0, 2).map((e) => e.nodes) : null;
}

export function simulate(l: Loadout, state: SimState, base: SimState = initSimState(l)): SimResult {
	const role = roleOf(l);
	const parts = l.battlePoint.parts.map((p) => ({ ...p }));
	/** Replaces the part(s) of `types` matching `match` with one of `type` (a swap can move a part between sides). */
	const replace = (types: number[], match: (p: BattlePointPart) => boolean, type: number, value: number, extra: Record<string, unknown>) => {
		const at = parts.findIndex((p) => types.includes(p.type) && match(p));
		const old = at >= 0 ? parts.splice(at, 1)[0] : {};
		parts.push({ ...old, ...extra, type, value });
	};
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
	const bracer0 = bracerStats(base.bracer);
	const bracer1 = bracerStats(state.bracer);
	const statValue = (index: number, fallback = 0) => l.stats?.find((s) => s.type === index)?.value ?? fallback;
	mainStat += (bracer1.mainStat - bracer0.mainStat) * statValue(msIndex + 4, 10000) / 10000;
	const braceletStat = (b: SimBracelet | null, pick: (i: number) => boolean) =>
		braceletStats(b)
			.filter((s) => (s.type ?? 2) === 2 && pick(s.index))
			.reduce((sum, s) => sum + (Number(s.value) || 0), 0);
	// Bracelets roll main stat as index 11 (Strength, Dexterity and Intelligence at once) or as the class's own stat.
	const isMainStat = (i: number) => i === msIndex || i === ALL_MAIN_STATS;
	mainStat += braceletStat(state.bracelet, isMainStat) - braceletStat(base.bracelet, isMainStat);
	let weaponPower = weapon0;
	let weaponScale = 1;
	if (state.sidereal && base.sidereal) {
		weaponScale = siderealWeaponPower(state.sidereal) / siderealWeaponPower(base.sidereal);
		weaponPower *= weaponScale;
		// The weapon's own battle points (part 23), anchored on bible's value.
		const dBp = siderealBattlePoints(state.sidereal) - siderealBattlePoints(base.sidereal);
		if (dBp) {
			const part = parts.find((p) => p.type === PartType.EstherWeapon);
			set(PartType.EstherWeapon, () => true, (part ? partHigh(part) : 0) + dBp);
		}
	}
	for (const slot of HONING_SLOTS) {
		const from = base.gear[slot];
		const to = state.gear[slot];
		if (!from || !to) continue;
		if (slot === 'weapon') {
			const scale = gearStat(slot, to) / gearStat(slot, from);
			weaponPower *= scale;
			weaponScale *= scale;
		}
		else mainStat += (gearStat(slot, to) - gearStat(slot, from)) * ADVANCED_STAT_BONUS;
	}
	// Accessories, Enlightenment karma and Weapon cores contribute additive Weapon Power %.
	const karmaPct = (s: SimState) => (s.karma.enlightenment ?? 0) * KARMA_ENLIGHTENMENT_WEAPON_PCT_PER_LEVEL;
	const coreWeapon = (s: SimState) => coreStates(l).reduce((sum, c) => {
		const core = s.arkGrid.find((x) => x.id === c.id);
		const id = swappedCoreId(c.id, core?.grade ?? c.info.grade, core?.variant);
		const stats = supportWeaponCoreStats(id, simCorePoints(l, s, base, c.id));
		return { flat: sum.flat + stats.flat, percent: sum.percent + stats.percent };
	}, { flat: 0, percent: 0 });
	const core0 = coreWeapon(base);
	const core1 = coreWeapon(state);
	const pct0 = linesTotal(base.accessories, 'percent') / 100 + karmaPct(base) + core0.percent;
	const pct1 = linesTotal(state.accessories, 'percent') / 100 + karmaPct(state) + core1.percent;
	// Equipped bracer and core flat WP are independent of weapon honing / Sidereal evolution.
	weaponPower -= (bracer0.weaponPower + core0.flat) * (1 + pct0 / 100) * (weaponScale - 1);
	// Flat Weapon Power from accessories and the bracelet's Weapon Power effect (stat 151).
	const braceletWeapon = (b: SimBracelet | null) =>
		braceletStat(b, (i) => i === WEAPON_POWER_FLAT) + braceletEffects(b).reduce((sum, key) => sum + effectWeaponPower(key), 0);
	weaponPower +=
		(linesTotal(state.accessories, 'flat') - linesTotal(base.accessories, 'flat') + braceletWeapon(state.bracelet) - braceletWeapon(base.bracelet) + core1.flat - core0.flat + bracer1.weaponPower - bracer0.weaponPower) *
		(1 + pct0 / 100);
	weaponPower *= (100 + pct1) / (100 + pct0);
	// Ability stone: its two engraving lines reaching 16 nodes add Atk. Power, which follows the simulated stone levels.
	let atkPct1 = atkPct + bracer1.attackPercent - bracer0.attackPercent;
	gemParts(l).forEach((g, k) => {
		const from = base.gems[k]?.level ?? g.level;
		const to = state.gems[k]?.level ?? from;
		const fromBonus = (base.gems[k]?.tier ?? g.tier) === 'T4' ? (GEM_BASE_ATTACK[from - 1] ?? 0) : 0;
		const toBonus = (state.gems[k]?.tier ?? g.tier) === 'T4' ? (GEM_BASE_ATTACK[to - 1] ?? 0) : 0;
		atkPct1 += toBonus - fromBonus;
	});
	const stoneLevels = (s: SimState) => Object.values(s.engravings).map((e) => e.stone);
	if (stoneLevels(state).join() !== stoneLevels(base).join())
		atkPct1 += stoneAtkPct(stoneLevelNodes(stoneLevels(state))) - stoneAtkPct(stoneNodesOf(l) ?? stoneLevelNodes(stoneLevels(base)));
	// Skin % applies to main stat, including the other simulated equipment edits, before base attack.
	mainStat *= skinStatRatio(state.skins, base.skins, l.stats?.find((s) => s.type === msIndex + 4)?.value);
	if (mainStat0 && weapon0)
		basePart.value =
			partHigh(basePart) * (baseAttackPoint(mainStat, weaponPower, atkPct1, bracer1.attackFlat) / baseAttackPoint(mainStat0, weapon0, atkPct, bracer0.attackFlat));

	// Weapon quality scores dealer Additional Damage; supports have no weapon-quality CP contribution.
	const weaponQuality = parts.find((p) => p.type === PartType.WeaponQuality);
	if (weaponQuality && state.quality.weapon !== undefined && base.quality.weapon !== undefined && state.quality.weapon !== base.quality.weapon) {
		if (!role.support) weaponQuality.value = partHigh(weaponQuality) + qualityStat('weapon', state.quality.weapon) - qualityStat('weapon', base.quality.weapon);
		weaponQuality.quality = state.quality.weapon;
	}

	// Vitality adds HP before vigor (140 Vigor = 1% HP) and Max HP multipliers.
	const hp = parts.find((p) => p.type === PartType.BaseHealth);
	const hpCon = CLASS_HP_COEFFICIENT[l.classId.replaceAll('_', '').toLowerCase()];
	if (hp && hpCon) {
		const vigorDelta = HONING_SLOTS.filter((slot) => slot !== 'weapon').reduce((sum, slot) => {
			const from = base.quality[slot], to = state.quality[slot];
			return sum + (from === undefined || to === undefined ? 0 : qualityStat(slot, to) - qualityStat(slot, from));
		}, 0);
		const vigor = 1 + statValue(137) / 14000;
		const vitalityHp = ((bracer1.vitality - bracer0.vitality) * (vigor + vigorDelta / 14000) + statValue(6) * vigorDelta / 14000)
			* hpCon * statValue(10, 10000) / 10000;
		const karmaHp = ((state.karma.evolution ?? 0) - (base.karma.evolution ?? 0)) * KARMA_EVOLUTION_HP_PER_LEVEL;
		const gain = (vitalityHp + karmaHp) * statValue(29, 10000) / 10000 * statValue(31, 10000) / 10000;
		const maxHp = typeof hp.maxHp === 'number' ? hp.maxHp : 0;
		if (maxHp > 0) {
			hp.value = partHigh(hp) * (maxHp + gain) / maxHp;
			hp.maxHp = maxHp + gain;
		}
	}

	// --- Gems (gemParts keeps the loadout's part order, so the k-th gem part lines up with state.gems[k])
	const gemIndices = parts.flatMap((p, i) => (p.type === PartType.Gem && typeof p.id === 'number' ? [i] : []));
	gemParts(l).forEach((g, k) => {
		const level = state.gems[k]?.level;
		const tier = state.gems[k]?.tier ?? g.tier;
		const table = tier === 'T4' ? role.gemT4 : tier === 'T3' ? role.gemT3 : null;
		if (g.table && table && level && (level !== g.level || tier !== g.tier)) parts[gemIndices[k]].value = table[level - 1];
	});

	// --- Engravings
	const ENGRAVING_TYPES = [PartType.Engraving, PartType.EngravingDefense];
	for (const e of engravingStates(l)) {
		const s = state.engravings[e.id];
		const swapped = s?.as !== undefined && s.as !== e.id;
		const t = swapped ? (role.engraving(s.as!) ?? e) : e;
		if (s && (swapped || s.stone !== e.stone || s.books !== e.col))
			replace(ENGRAVING_TYPES, (p) => p.id === e.id, t.defense ? PartType.EngravingDefense : PartType.Engraving, t.table[s.stone][s.books], { id: e.id });
	}
	// Engravings added in empty slots score like any other.
	for (const [id, s] of Object.entries(state.engravings)) {
		const t = s.added ? role.engraving(Number(id)) : undefined;
		if (t) parts.push({ type: t.defense ? PartType.EngravingDefense : PartType.Engraving, value: t.table[s.stone][s.books], id: Number(id) });
	}

	// --- Accessories: rebuild the grinding (15 / 16) and combat effect (17) parts of every edited slot.
	const ACCESSORY_TYPES: number[] = [
		PartType.AccessoryGrinding,
		PartType.AccessoryGrindingDefense,
		PartType.AccessoryCombatEffect,
		PartType.AccessoryCombatEffectDefense
	];
	for (const slot of ACCESSORY_SLOTS) {
		const lines = state.accessories[slot];
		if (!lines || JSON.stringify(lines) === JSON.stringify(base.accessories[slot])) continue;
		for (let i = parts.length - 1; i >= 0; i--) if (ACCESSORY_TYPES.includes(parts[i].type) && parts[i].slot === slot) parts.splice(i, 1);
		for (const ln of lines) {
			if (isOtherLine(ln)) continue;
			const line = lineOf(ln.key);
			if (!line?.toBattlePoints) continue;
			parts.push({
				type: line.combatEffect ? PartType.AccessoryCombatEffect : line.defense ? PartType.AccessoryGrindingDefense : PartType.AccessoryGrinding,
				value: line.toBattlePoints(line.values[ln.tier]),
				slot
			});
		}
	}

	// --- Ark grid: core points and option totals follow the edited astrogems, anchored on bible's values.
	const CORE_TYPES = [PartType.ArkGridCore, PartType.ArkGridCoreDefense];
	for (const c of coreStates(l)) {
		const points = simCorePoints(l, state, base, c.id);
		const core = state.arkGrid.find((x) => x.id === c.id);
		if (points === c.points && core?.grade === undefined && core?.variant === undefined
			&& (!c.info.weaponCore || weaponPower === weapon0)) continue;
		const v = simCoreValue(c, core, points, weaponPower);
		replace(CORE_TYPES, (p) => p.id === c.id, v.defense ? PartType.ArkGridCoreDefense : PartType.ArkGridCore, v.value, { id: c.id, points });
	}
	const t = astrogemTotals(l);
	for (const id of role.astrogemOptions) {
		const level = t.levels[id] + optionLevel(state.arkGrid, id) - optionLevel(base.arkGrid, id);
		if (level === t.levels[id]) continue;
		const value = t.values[id] + role.astrogemValue(id, level) - role.astrogemValue(id, t.levels[id]);
		set(PartType.ArkGridGem, (p) => p.id === id, value, { id });
	}

	// --- Bracelet: effects come straight from the game's battle point catalog; combat stats feed part 26.
	if (state.bracelet && JSON.stringify(state.bracelet) !== JSON.stringify(base.bracelet)) {
		const BRACELET_TYPES: number[] = [PartType.BraceletEffect, PartType.BraceletEffectDefense, PartType.BraceletStatType];
		for (let i = parts.length - 1; i >= 0; i--) if (BRACELET_TYPES.includes(parts[i].type)) parts.splice(i, 1);
		for (const key of braceletEffects(state.bracelet)) {
			const effect = role.braceletEffect(key);
			if (effect) parts.push({ type: effect.defense ? PartType.BraceletEffectDefense : PartType.BraceletEffect, value: effect.value });
		}
		for (const st of braceletStats(state.bracelet)) {
			// Ally Enhancement lines (54 / 59) are matched by type; bible gives 59 with index 16000001.
			const c = role.braceletStatCoeff[`${st.type ?? 2}:${st.type === 54 || st.type === 59 ? 0 : st.index}`];
			if (c) parts.push({ type: PartType.BraceletStatType, value: ((Number(st.value) || 0) * c) / 1e4 });
		}
		// Combat stats feed part 26 at the role's battle points per point.
		const combat = (b: SimBracelet | null) =>
			braceletStats(b)
				.filter((s) => (s.type ?? 2) === 2)
				.reduce((sum, s) => sum + (Number(s.value) || 0) * (role.combatStatBp[s.index] ?? 0), 0);
		const dCombat = combat(state.bracelet) - combat(base.bracelet);
		const stats = parts.find((p) => p.type === PartType.CombatStats);
		if (dCombat && stats) stats.value = partHigh(stats) + dCombat;
	}

	// --- Karma
	// Evolution karma scores by rank (derived from level), anchored on bible's value.
	if (state.karma.evolution !== null && base.karma.evolution !== null && state.karma.evolution !== base.karma.evolution) {
		const part = parts.find((p) => p.type === PartType.KarmaEvolutionRank);
		const rankDelta = karmaRank(state.karma.evolution) - karmaRank(base.karma.evolution);
		set(PartType.KarmaEvolutionRank, () => true, (part ? partHigh(part) : 0) + rankDelta * role.evolutionKarmaPerRank);
	}
	if (role.leapKarmaPerLevel && state.karma.leap !== null && state.karma.leap !== base.karma.leap)
		set(PartType.KarmaLeapLevel, () => true, state.karma.leap * role.leapKarmaPerLevel);

	// --- Paradise orb (dealers): k × (power / 1M + 2.5), k from the orb.
	const orb = state.paradise;
	if (orb && !orb.flat && (orb.orb !== base.paradise?.orb || orb.power !== base.paradise?.power)) {
		const k = orb.orb === base.paradise?.orb ? base.paradise.k : (ORBS[orb.orb]?.k ?? orb.k);
		set(PartType.ParadiseOrb, () => true, orbValue(k, Math.max(0, Number(orb.power) || 0)), { id: orb.orb });
	}

	return { parts, cp: role.score(parts), mainStat, weaponPower };
}
