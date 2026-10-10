import { PartType, partHigh, partRatio, ratioToPct } from './cp';
import { ENGRAVING_ICONS, GEM_BASE_ATTACK, GEM_REGULAR } from './game-data';
import { engravingPartTypes, roleOf, type RoleTables } from './roles';
import { supportCombatPower, supportCoreValue, supportWeaponCoreStats } from './support';
import {
	ASTROGEM_OPTION_NAMES,
	CORE_BREAKPOINTS,
	ENGRAVING_BOOK_STEPS,
	ENGRAVING_NAMES,
	KARMA_EVOLUTION_MAX_RANK,
	KARMA_LEAP_MAX_LEVEL,
	KARMA_ENLIGHTENMENT_WEAPON_PCT_PER_LEVEL,
	TIERS,
	coreValue,
	decodeCore,
	type AccessoryLine,
	type CoreInfo,
	type Tier
} from './tables';
import type { ArkGridGem, BattlePointPart, Loadout } from './types';
import { STONE_LEVEL_NODES } from './stones';

export type UpgradeCategory = 'honing' | 'quality' | 'gem' | 'core' | 'astrogem' | 'engraving' | 'accessory' | 'karma';

export interface Upgrade {
	/** Stable key, e.g. for remembering a user-entered gold cost. */
	key: string;
	category: UpgradeCategory;
	title: string;
	detail: string;
	/** What the upgrade applies to, shown above the title (e.g. "Earring 2"). */
	subject?: string;
	/** Accessory roll change, shown in the roll colors (from: low / mid / none or a percent). */
	roll?: { from: string; to: string };
	/** A whole accessory's lines with their rolls, shown in the roll colors. */
	lines?: { name: string; tier: string; value?: string }[];
	/** Combat power gained, in percent of current CP. */
	gainPct: number;
	/** How many identical upgrades this row stands for (e.g. ten Lv. 9 gems). Gain is per one. */
	count: number;
	/** True when the value relies on an assumption rather than an exact table. */
	approximate: boolean;
	/** Relic engraving books this row reads: priced as the player's price per book × count. */
	books?: { engraving: number; name: string; count: number };
	/** Gold cost known without asking the player (e.g. 0 for a free drop); a typed cost still wins. */
	knownCost?: number;
	/** Expected quality tap gold, assuming unlimited Chaos Stones. */
	quality?: { chance: number; fee: number; taps: number };
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
	honing: 'Equipment',
	quality: 'Equipment Quality',
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

/**
 * CP % from one part moving `from` -> `to`. A dealer's score is a product, so that's the part's own ratio. A
 * support's score is Buff Power + Shield & Heal Power, so only the part's side moves.
 */
export function gainIn(l: Loadout): (from: number, to: number, defense?: boolean) => number {
	if (!l.battlePoint.isSupport) return gain;
	const cp = supportCombatPower(l.battlePoint.parts);
	return (from, to, defense = false) => (((defense ? cp.shieldHeal : cp.buff) * (partRatio(from, to) - 1)) / cp.total) * 100;
}

export function weaponPowerOf(l: Loadout): number {
	const base = l.battlePoint.parts.find((p) => p.type === PartType.BaseAttack);
	return (base && num(base, 'weaponPower')) ?? 0;
}

// --------------------------------------------------------------------------------------------- gems

function gemUpgrades(l: Loadout): Upgrade[] {
	const { gemT4, gemT3 } = roleOf(l);
	const g = gainIn(l);
	const groups = new Map<string, Upgrade>();
	const attackPct = Number(partsOf(l, PartType.BaseAttack)[0]?.attackPowerMultiplier ?? 0);
	for (const p of partsOf(l, PartType.Gem)) {
		const raw = num(p, 'id');
		if (!raw) continue;
		const id = GEM_REGULAR[raw] ?? raw; // event gems behave as a regular gem
		const level = Math.floor(id / 10) % 100;
		const value = partHigh(p);
		const table = gemT4[level - 1] === value ? gemT4 : gemT3[level - 1] === value ? gemT3 : null;
		if (!table || level >= 10) continue;
		const tier = table === gemT4 ? 'T4' : 'T3';
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
			gainPct: g(0, (partRatio(value, table[level]) * (tier === 'T4'
				? (100 + attackPct + GEM_BASE_ATTACK[level] - GEM_BASE_ATTACK[level - 1]) / (100 + attackPct)
				: 1) - 1) * 1e4),
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
	/** Scored with the support table (by exact core id). */
	support: boolean;
	/** Support cores that score Shield & Heal Power (part 30). */
	defense: boolean;
}

const SHAPE_LABEL = { sun: 'Sun', moon: 'Moon', star: 'Star' };
const ATTR_LABEL = { order: 'Order', chaos: 'Chaos' };
const GRADE_LABEL = { heroic: 'Epic', legendary: 'Legendary', relic: 'Relic', ancient: 'Ancient' };

export const coreLabel = (info: CoreInfo) =>
	`${GRADE_LABEL[info.grade]} ${ATTR_LABEL[info.attr]} ${SHAPE_LABEL[info.shape]}`;

export function coreStates(l: Loadout): CoreState[] {
	const wp = weaponPowerOf(l);
	const support = l.battlePoint.isSupport;
	const parts = [...partsOf(l, PartType.ArkGridCore), ...partsOf(l, PartType.ArkGridCoreDefense)];
	return (l.arkGridCores ?? []).flatMap((core, index): CoreState[] => {
		let info = decodeCore(core.id);
		if (!info) return [];
		const part = parts.find((p) => num(p, 'id') === core.id);
		const points = (part && num(part, 'points')) ?? core.gems.reduce((s, g) => s + g.corePoints, 0);
		const value = part ? partHigh(part) : 0;
		if (support) {
			const model = supportCoreValue(core.id, points);
			return [
				{ index, id: core.id, info, label: coreLabel(info), points, value, modelValue: model.value, gems: core.gems, support, defense: model.defense }
			];
		}
		// Chaos sun/moon option tier isn't recoverable from the id alone for every variant;
		// prefer whichever tier reproduces bible's value.
		if (info.attr === 'chaos' && info.shape !== 'star' && coreValue(info, points, wp) !== value) {
			const other = { ...info, tier: info.tier === 0 ? 1 : 0 };
			if (coreValue(other, points, wp) === value) info = other;
		}
		return [
			{ index, id: core.id, info, label: coreLabel(info), points, value, modelValue: coreValue(info, points, wp), gems: core.gems, support, defense: false }
		];
	});
}

/** bible's value at the new point total, anchored on bible's current value. */
export function coreValueAt(state: CoreState, points: number, weaponPower: number) {
	// Imported model corrections describe an active effect, never an inactive core.
	if (points < CORE_BREAKPOINTS[0]) return 0;
	if (state.info.weaponCore) return 0;
	const model = state.support ? supportCoreValue(state.id, points).value : coreValue(state.info, points, weaponPower);
	return state.value + model - state.modelValue;
}

/** Value as another core type (grade / chaos option tier) at `points`; still anchored on bible while it's the same type. */
export function coreValueAs(state: CoreState, info: CoreInfo, points: number, weaponPower: number) {
	if (points < CORE_BREAKPOINTS[0]) return 0;
	// Weapon cores score through base attack, never an additional core multiplier.
	if (info.weaponCore) return 0;
	return info.grade === state.info.grade && info.tier === state.info.tier
		? coreValueAt(state, points, weaponPower)
		: coreValue(info, points, weaponPower);
}

/** Base attack ratio after replacing one core's Weapon Power stats in the imported loadout. */
export function coreWeaponRatio(l: Loadout, core: CoreState, id: number, points: number): number {
	const wp = weaponPowerOf(l);
	if (wp <= 0) return 1;
	const from = supportWeaponCoreStats(core.id, core.points);
	const to = supportWeaponCoreStats(id, points);
	const pct = (l.karma?.enlightenment ?? 0) * KARMA_ENLIGHTENMENT_WEAPON_PCT_PER_LEVEL
		+ l.battlePoint.parts.reduce((sum, p) => {
			const stat = p.stat as { type?: number; index?: number; value?: number } | undefined;
			return sum + (stat?.type === 2 && stat.index === 152 ? (stat.value ?? 0) / 100 : 0);
		}, 0)
		+ coreStates(l).reduce((sum, c) => sum + supportWeaponCoreStats(c.id, c.points).percent, 0);
	const changed = (wp / (1 + pct / 100) - from.flat + to.flat)
		* (1 + (pct - from.percent + to.percent) / 100);
	return Math.sqrt(changed / wp);
}

function coreUpgrades(l: Loadout): Upgrade[] {
	const wp = weaponPowerOf(l);
	const g = gainIn(l);
	return coreStates(l).flatMap((c) => {
		if (!c.support && c.info.supportOnly) return [];
		const cap = c.info.grade === 'heroic' ? 10 : c.info.grade === 'legendary' ? 14 : 20;
		const next = CORE_BREAKPOINTS.find((bp) => bp > c.points && bp <= cap);
		if (!next) return [];
		const to = coreValueAt(c, next, wp);
		let gainPct = g(c.value, to, c.defense);
		if (c.info.weaponCore && wp > 0) {
			gainPct = g(0, (coreWeaponRatio(l, c, c.id, next) - 1) * 1e4);
		}
		return [
			{
				key: `core:${c.id}:${next}`,
				category: 'core' as const,
				title: `${c.label} core → ${next}P`,
				detail: '',
				gainPct,
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
	role: RoleTables;
	/** CP % for a part change (see gainIn). */
	gain: (from: number, to: number) => number;
}

export function astrogemTotals(l: Loadout): AstrogemTotals {
	const levels: Record<number, number> = {};
	const values: Record<number, number> = {};
	const role = roleOf(l);
	for (const id of role.astrogemOptions) {
		const p = partsOf(l, PartType.ArkGridGem).find((x) => num(x, 'id') === id);
		levels[id] = (p && num(p, 'totalLevel')) ?? 0;
		values[id] = p ? partHigh(p) : 0;
	}
	return { levels, values, role, gain: gainIn(l) };
}

/** CP % from adding `delta` levels to an astrogem option, anchored on bible's value. */
export function astrogemOptionGain(t: AstrogemTotals, optionId: number, delta: number) {
	if (!t.role.astrogemOptions.includes(optionId)) return 0;
	const level = t.levels[optionId];
	const value = t.role.astrogemValue;
	const to = t.values[optionId] + value(optionId, level + delta) - value(optionId, level);
	return t.gain(t.values[optionId], to);
}

function astrogemUpgrades(l: Loadout): Upgrade[] {
	if (!l.arkGridCores?.some((c) => c.gems.length)) return [];
	const t = astrogemTotals(l);
	const room = (id: number) =>
		l.arkGridCores!.reduce((n, c) => n + c.gems.filter((g) => g.opts.some((o) => o.id === id && o.level < 5)).length, 0);
	return t.role.astrogemOptions.map((id) => {
		// Values are floored per total level, so a single level can round to 0. Average over 5.
		const per = astrogemOptionGain(t, id, 5) / 5;
		const level = t.levels[id];
		return {
			key: `astrogem:${id}`,
			category: 'astrogem' as const,
			subject: 'Astrogems',
			title: `${ASTROGEM_OPTION_NAMES[id]} Lv. ${level} → ${level + 1}`,
			detail: `Total ${ASTROGEM_OPTION_NAMES[id]} level across your astrogems; ${room(id)} of them can still raise it (max Lv. 5 each). Gain is the average of the next 5 levels, since values round per level.`,
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
	const coreRatio = partRatio(core.value, coreValueAt(core, pointsAfter, wp))
		* coreWeaponRatio(l, core, core.id, pointsAfter);

	const t = astrogemTotals(l);
	let optionRatio = 1;
	for (const id of t.role.astrogemOptions) {
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
	/** Support engravings that score Shield & Heal Power (part 11). */
	defense: boolean;
}

export const engravingName = (id: number) => ENGRAVING_NAMES[id] ?? ENGRAVING_ICONS[id]?.[1] ?? `Engraving ${id}`;

export function engravingStates(l: Loadout): EngravingState[] {
	const role = roleOf(l);
	const scored = engravingPartTypes(role)
		.flatMap((type) => partsOf(l, type))
		.flatMap((p) => {
			const id = num(p, 'id');
			const t = id ? role.engraving(id) : undefined;
			if (!id || !t) return [];
			const stone = num(p, 'stonePoints') ?? 0;
			const value = partHigh(p);
			const col = t.table[stone]?.findIndex((v) => Math.abs(v - value) <= 2) ?? -1;
			if (col < 0) return [];
			return [{ id, name: engravingName(id), table: t.table, stone, col, value, defense: t.defense }];
		});
	// Utility engravings have no battle-point part, but still occupy a slot and can carry stone nodes.
	const stoneLines = l.items?.find((i) => i.slot === 'ability_stone')?.data.engravings as { id: number; nodes: number }[] | undefined;
	for (const e of l.engravings ?? []) {
		if (scored.some((s) => s.id === e.id)) continue;
		const t = role.engraving(e.id);
		if (!t || t.table.some((row) => row.some((v) => v !== 0))) continue;
		const nodes = stoneLines?.find((s) => s.id + 1000 === e.id)?.nodes ?? 0;
		const stone = STONE_LEVEL_NODES.findLastIndex((n) => nodes >= n);
		const col = e.grade === 'engrave_grade05' ? 4 : Math.min(4, Math.floor(e.progress / 5));
		scored.push({ id: e.id, name: engravingName(e.id), ...t, stone, col, value: 0 });
	}
	return scored;
}

function engravingUpgrades(l: Loadout): Upgrade[] {
	const g = gainIn(l);
	return engravingStates(l).flatMap((e) =>
		e.col < ENGRAVING_BOOK_STEPS.length - 1
			? [
					{
						key: `engraving:${e.id}:books:${ENGRAVING_BOOK_STEPS[e.col + 1]}`,
						category: 'engraving' as const,
						title: `${e.name} relic books ${ENGRAVING_BOOK_STEPS[e.col]} → ${ENGRAVING_BOOK_STEPS[e.col + 1]}`,
						detail: 'Read 5 more relic engraving books.',
						books: { engraving: e.id, name: e.name, count: ENGRAVING_BOOK_STEPS[e.col + 1] - ENGRAVING_BOOK_STEPS[e.col] },
						gainPct: g(e.value, e.table[e.stone][e.col + 1], e.defense),
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
	const role = roleOf(l);
	const g = gainIn(l);
	const accessoryWeaponPct =
		(l.items ?? [])
			.flatMap((i) => (SLOT_FAMILY[i.slot] ? (i.data.stats ?? []) : []))
			.filter((s) => s.type === 2 && s.index === 152)
			.reduce((sum, s) => sum + s.value, 0) / 100;
	// Support Weapon Power rolls affect base attack, including the existing karma/core bonuses.
	const weaponPctTotal = accessoryWeaponPct + (role.support
		? (l.karma?.enlightenment ?? 0) * KARMA_ENLIGHTENMENT_WEAPON_PCT_PER_LEVEL
			+ coreStates(l).reduce((sum, c) => sum + supportWeaponCoreStats(c.id, c.points).percent, 0)
		: 0);
	for (const item of l.items ?? []) {
		const family = SLOT_FAMILY[item.slot];
		if (!family) continue;
		const lines = (item.data.stats ?? []).filter((s) => !s.base);
		for (const line of role.accessoryLines.filter((x) =>
			(x.primary || (role.support && x.weapon === 'percent')) && x.slots.includes(family))) {
			let current = lines.find((s) => line.match(s))?.value ?? 0;
			if (line.combatEffect) {
				// Combat-effect lines carry no value in item stats; bible's battle point equals the % × 100.
				const part = partsOf(l, PartType.AccessoryCombatEffect).find((p) => p.slot === item.slot);
				current = part ? partHigh(part) : 0;
			}
			if (current >= line.values.high) continue;
			const tier = tierOf(line, current);
			const from = current === 0 ? 'none' : (tier ?? `${current / 100}%`);
			let gainPct: number;
			if (line.toBattlePoints) {
				gainPct = g(line.toBattlePoints(current), line.toBattlePoints(line.values.high), line.defense);
			} else {
				// Weapon Power % scales base attack by √(weapon power).
				const p = weaponPctTotal;
				const ratio = Math.sqrt((100 + p - current / 100 + line.values.high / 100) / (100 + p));
				gainPct = g(0, (ratio - 1) * 1e4);
			}
			out.push({
				key: `accessory:${item.slot}:${line.key}`,
				category: 'accessory',
				title: line.name,
				subject: SLOT_LABEL[item.slot],
				roll: { from, to: 'high' },
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
	const role = roleOf(l);
	const g = gainIn(l);
	const evo = partsOf(l, PartType.KarmaEvolutionRank)[0];
	const evoValue = evo ? partHigh(evo) : 0;
	const rank = Math.round(evoValue / role.evolutionKarmaPerRank);
	if (evo && rank < KARMA_EVOLUTION_MAX_RANK)
		out.push({
			key: `karma:evolution:${rank + 1}`,
			category: 'karma',
			title: `Evolution karma rank ${rank} → ${rank + 1}`,
			detail: 'From Evolution karma experience.',
			gainPct: g(evoValue, evoValue + role.evolutionKarmaPerRank),
			count: 1,
			approximate: false
		});
	const leap = partsOf(l, PartType.KarmaLeapLevel)[0];
	const leapValue = leap ? partHigh(leap) : 0;
	const level = role.leapKarmaPerLevel ? Math.round(leapValue / role.leapKarmaPerLevel) : 0;
	if (leap && role.leapKarmaPerLevel && level < KARMA_LEAP_MAX_LEVEL)
		out.push({
			key: `karma:leap:${level + 1}`,
			category: 'karma',
			title: `Leap karma level ${level} → ${level + 1}`,
			detail: 'From Leap karma experience.',
			gainPct: g(leapValue, leapValue + role.leapKarmaPerLevel),
			count: 1,
			approximate: false
		});
	return out;
}

// ---------------------------------------------------------------------------------------------

/**
 * Every one-step upgrade available to this loadout, best first (by dealer or support Combat Power). `extra` takes
 * suggestions scored elsewhere (equipment honing, see honing-upgrades.ts).
 */
export function buildUpgrades(l: Loadout, extra: Upgrade[] = []): Upgrade[] {
	return [
		...extra,
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
