// DPS gain from the meter's own per-stat values (see $lib/logs/stat-values): a change's raw stat deltas times what
// LOA Logs worked out one more of each stat adds for this player. Covers what those values describe: main stat and
// Weapon Power (honing, bracer, Esther weapon, skins, accessory and bracelet main stat, Weapon Power lines),
// accessory Additional Damage / Atk. Power / Crit lines and weapon quality. Anything else (engravings, gems, Ark Grid,
// karma, bracelet effects, Paradise, Outgoing Damage lines) isn't in them, so those changes have no DPS figure.
// A straight-line estimate: fine for one upgrade, a little off for very large jumps.

import type { StatValues } from '$lib/logs/protocol';
import { bracerStats } from './bracer';
import { qualityStat } from './quality';
import { ACCESSORY_LINES } from './tables';
import { BRACELET_EFFECTS } from './game-data';
import { ACCESSORY_SLOTS, braceletStats, braceletEffects, isOtherLine, simulate, type SimState } from './simulate';
import type { Loadout } from './types';

export interface StatDeltas {
	mainStat: number;
	weaponPower: number;
	/** Percentage points. */
	additionalDamage: number;
	critRate: number;
	critDamage: number;
	attackPowerPct: number;
	/** Flat Atk. Power. */
	attackPower: number;
	/** Flat Basic Atk. Power, before the base-attack multiplier (vambraces stat 114). */
	baseAttackFlat?: number;
	/** T4 gem base-attack multiplier; separate from accessory Atk. Power %. */
	baseAttackPct?: number;
	/** Evolution-damage percentage points, used by the explicit per-hit model. */
	evolutionDamage?: number;
}

/** Fields whose changes the stat values cover; the rest of SimState either doesn't move stats or isn't covered. */
const COVERED = new Set<keyof SimState>(['bracer', 'sidereal', 'gear', 'quality', 'accessories', 'accessoryStats', 'skins', 'bracelet']);
/** Not about the character's gear: ignore when comparing. */
const IGNORED = new Set<keyof SimState>(['skillShares', 'skillCooldownUse']);
/** Accessory lines and the stat each feeds (values are 1/100 %, flat lines whole numbers). Weapon Power lines come
 * through the simulated Weapon Power instead. */
const LINE_STAT: Record<string, keyof StatDeltas> = {
	add_dmg: 'additionalDamage',
	atk_pct: 'attackPowerPct',
	crit_rate: 'critRate',
	crit_dmg: 'critDamage',
	atk_flat: 'attackPower'
};
const SCALE: Partial<Record<keyof StatDeltas, number>> = { additionalDamage: 100, attackPowerPct: 100, critRate: 100, critDamage: 100 };
/** Stat indexes of those lines (Additional Damage, Atk. Power %, Crit Rate, Crit Damage, Atk. Power), which bracelets can carry too. */
const BRACELET_LINE_INDEXES = [50, 49, 74, 76, 124];

function lineTotals(state: SimState): Partial<Record<keyof StatDeltas, number>> {
	const out: Partial<Record<keyof StatDeltas, number>> = {};
	for (const slot of ACCESSORY_SLOTS)
		for (const ln of state.accessories[slot] ?? []) {
			if (isOtherLine(ln)) continue;
			const stat = LINE_STAT[ln.key];
			const line = ACCESSORY_LINES.find((l) => l.key === ln.key);
			if (!stat || !line) continue;
			out[stat] = (out[stat] ?? 0) + line.values[ln.tier] / (SCALE[stat] ?? 1);
		}
	return out;
}

/** Equipment's absolute damage-stat lines, before passives, engravings and the Ark Grid. */
export function equipmentDamageStats(state: SimState, uptime?: BraceletUptime): Partial<Record<keyof StatDeltas, number>> {
	const out = lineTotals(state);
	for (const [key, value] of Object.entries(braceletTotals(state, true, uptime).stats) as [keyof StatDeltas, number][])
		out[key] = (out[key] ?? 0) + value;
	if (state.quality.weapon !== undefined) out.additionalDamage = (out.additionalDamage ?? 0) + qualityStat('weapon', state.quality.weapon) / 100;
	out.baseAttackFlat = bracerStats(state.bracer).attackFlat;
	return out;
}

const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);

// These T4 families have one variable stat and an identical secondary bonus at every roll.
// Only within-family roll changes are covered; adding/removing/swapping a family needs its secondary effect too.
const BRACELET_ROLLS: Record<number, { stat: keyof StatDeltas; values: number[] }> = {
	1101: { stat: 'critRate', values: [5, 4.2, 3.4, 2.6] },
	1102: { stat: 'critDamage', values: [10, 8.4, 6.8, 5.2] },
	1104: { stat: 'additionalDamage', values: [3.5, 3, 2.5, 2] }
};
/** A current bracelet effect read for the DPS meter: stat lines, damage terms (percent) and what it can't value. */
export interface BraceletPart {
	stats: Partial<Record<keyof StatDeltas, number>>;
	/** Outgoing Damage, On Crit Hit damage, back / frontal attack damage, non-directional skill damage. */
	outgoing: number; critHit: number; back: number; front: number; nonDirectional: number;
	/** Species damage, additive with card-book bonuses; the meter resolves it per gate. */
	demon: number;
	unvalued: string[];
}
const EFFECT_TEXT = new Map(BRACELET_EFFECTS.filter((e) => e.t4).map((e) => [e.key, e.text]));
/** Sentences with nothing for a dealer's own damage: permanent Weapon Power (simulate() reads it), support lines, notes,
 *  and Skill cooldown (the logged casts already show it). */
const IGNORED_SENTENCE = /^(?:Weapon Power \+[\d,]+\.$|\(Max\. \d+ stacks\)|This effect is limited|Ally .*Enhancement|Awakening Skills do not apply|Skill cooldown \+[\d.]+%\.$)/;

/**
 * How much of the damage a timed bracelet effect was up for (0–1), by its buff family (LOA Logs buff id 6051000NN,
 * family NN / 10: 7 Weak Point, 9 Detachment, 10 stacking Weapon Power, 11 HP-gated Weapon Power, 12 Weapon Power
 * every 30s), and the average stacks of the last one. The meter passes its runs' own (braceletUptimeOf).
 */
export interface BraceletUptime { share(family: number): number; stacks(family: number): number }
/** [measured] Damage share under the timed effects on LOA Logs clears: 86–98% (300 encounters, 2026-11). */
export const TYPICAL_BRACELET_SHARE = 0.9;
/** [assumed] Average stacks of "Weapon Power every 30s": one more every 30s from the first hit (each refreshes them),
 *  up to `max`, averaged over a fight of `fightMs`. */
export function rampStacks(fightMs: number, max = 30): number {
	const steps = Math.max(1, fightMs / 30_000), whole = Math.floor(steps);
	let sum = 0;
	for (let i = 1; i <= whole; i++) sum += Math.min(max, i);
	return (sum + (steps - whole) * Math.min(max, whole + 1)) / steps;
}
/** [assumed] Fight length for the ramp when no run gives one. */
const TYPICAL_FIGHT_MS = 7 * 60_000;
export const TYPICAL_BRACELET_UPTIME: BraceletUptime = { share: () => TYPICAL_BRACELET_SHARE, stacks: () => rampStacks(TYPICAL_FIGHT_MS) };
/** Families the meter weights by uptime. */
const TIMED_FAMILIES = new Set([7, 9, 10, 11, 12]);
/**
 * The runs' pooled uptime (damage under each effect over all their damage), falling back to the typical one for
 * effects none of them had (`typical`: no run recorded any). `timed`: whether a state's bracelet has such an effect.
 */
export function braceletEffectsUptime(runs: { damage: number; duration: number; braceletUptime?: Record<number, { damage: number; stacks?: number }> }[]): BraceletUptime & { typical: boolean; timed(s: SimState): boolean } {
	const recorded = runs.filter((r) => r.braceletUptime && r.damage > 0);
	const total = recorded.reduce((sum, r) => sum + r.damage, 0);
	const fightMs = runs.length ? runs.reduce((sum, r) => sum + r.duration, 0) / runs.length : TYPICAL_FIGHT_MS;
	const share = (family: number) => {
		const under = recorded.reduce((sum, r) => sum + (r.braceletUptime![family]?.damage ?? 0), 0);
		return under > 0 ? Math.min(1, under / total) : TYPICAL_BRACELET_SHARE;
	};
	const stacks = (family: number) => {
		let weighted = 0, damage = 0;
		for (const r of recorded) {
			const u = r.braceletUptime![family];
			if (u?.stacks !== undefined) { weighted += u.stacks * u.damage; damage += u.damage; }
		}
		return damage > 0 ? weighted / damage : rampStacks(fightMs);
	};
	return { share, stacks, typical: !recorded.length, timed: (s) => braceletEffects(s.bracelet).some((key) => TIMED_FAMILIES.has(braceletFamily(key) ?? -1)) };
}
/** An effect's buff family: "3:11061" (ability) and "4:605100061" (combat effect) are both 6. */
export function braceletFamily(key: string): number | null {
	const [kind, id] = key.split(':').map(Number);
	const buff = kind === 3 && id > 11000 && id < 12000 ? 605100000 + id - 11000 : kind === 4 ? id : NaN;
	return buff > 605100000 && buff < 605101000 ? Math.floor((buff - 605100000) / 10) : null;
}

/**
 * A current (T4) bracelet effect sentence by sentence: Crit Rate / Crit Damage / Additional Damage as stats; timed
 * Weapon Power and the boss's Crit Resistance / Crit Damage debuffs as stats times their uptime (`uptime`); Outgoing /
 * Crit Hit / back / frontal / non-directional damage as damage terms; Demon / Archdemon damage as a separate term;
 * the rest listed (the boss's Defense and stagger state aren't in the logs). null for older effects.
 */
export function braceletPart(key: string, uptime: BraceletUptime = TYPICAL_BRACELET_UPTIME): BraceletPart | null {
	const text = EFFECT_TEXT.get(key);
	if (!text) return null;
	const out: BraceletPart = { stats: {}, outgoing: 0, critHit: 0, back: 0, front: 0, nonDirectional: 0, demon: 0, unvalued: [] };
	const stacks = Number(text.match(/\(Max\. (\d+) stacks\)/)?.[1] ?? 1);
	const num = (v: string) => Number(v.replace(/,/g, ''));
	const family = braceletFamily(key) ?? -1;
	const share = uptime.share(family);
	const add = (k: keyof StatDeltas, v: number) => { out.stats[k] = (out.stats[k] ?? 0) + v; };
	// Sentences end at a period, but not "Bonus vs. Demon" or "Ally Atk. Power".
	for (const sentence of text.split(/(?<=\.)(?<!vs\.|Atk\.)\s+(?=[A-Z(])/)) {
		let m;
		if (IGNORED_SENTENCE.test(sentence)) continue;
		if ((m = sentence.match(/^Crit Rate \+([\d.]+)%\.$/))) out.stats.critRate = (out.stats.critRate ?? 0) + num(m[1]);
		else if ((m = sentence.match(/^Crit Damage \+([\d.]+)%\.$/))) out.stats.critDamage = (out.stats.critDamage ?? 0) + num(m[1]);
		else if ((m = sentence.match(/^Additional Damage \+([\d.]+)%\.$/))) out.stats.additionalDamage = (out.stats.additionalDamage ?? 0) + num(m[1]);
		else if ((m = sentence.match(/^Crit Hit Damage \+([\d.]+)%\.$/))) out.critHit += num(m[1]);
		else if ((m = sentence.match(/^Outgoing Damage \+([\d.]+)%\.$/))) out.outgoing += num(m[1]);
		else if ((m = sentence.match(/^Back Attack Damage \+([\d.]+)%\.$/))) out.back += num(m[1]);
		else if ((m = sentence.match(/^Frontal Attack Damage \+([\d.]+)%\.$/))) out.front += num(m[1]);
		else if ((m = sentence.match(/^Non-directional Skill Damage \+([\d.]+)%\.$/))) out.nonDirectional += num(m[1]);
		else if ((m = sentence.match(/^Bonus vs\. Demon\/Archdemon \+([\d.]+)%\.$/))) out.demon += num(m[1]);
		else if ((m = sentence.match(/^On hit, Weapon Power \+([\d,]+), (.+?) for \d+s\.$/))) {
			// Full stacks while it's up: hits keep it refreshed.
			add('weaponPower', num(m[1]) * stacks * share);
			out.unvalued.push(m[2]);
		} else if ((m = sentence.match(/^When your HP is 50% or higher, upon hit, Weapon Power \+([\d,]+) for \d+s\.$/))) add('weaponPower', num(m[1]) * share);
		else if ((m = sentence.match(/^Upon hit, Weapon Power \+([\d,]+) for \d+s every 30s\.$/))) add('weaponPower', num(m[1]) * Math.min(stacks, uptime.stacks(family)) * share);
		// Debuffs on the boss, on this player's damage (not the party's): Crit Resistance as Crit Rate, its Crit Damage
		// as Crit Damage.
		else if ((m = sentence.match(/^On hit, target's Crit Resistance -([\d.]+)% for \d+s\.$/))) add('critRate', num(m[1]) * share);
		else if ((m = sentence.match(/^On hit, target's Crit Damage -([\d.]+)% for \d+s\.$/))) add('critDamage', num(m[1]) * share);
		else if ((m = sentence.match(/^On hit, target's Defense -([\d.]+)% for \d+s\.$/))) out.unvalued.push(`Boss Defense -${m[1]}% (boss Defense unknown)`);
		else if ((m = sentence.match(/^Outgoing Damage \+([\d.]+)% to Staggered foes\.$/))) out.unvalued.push(`Outgoing Damage +${m[1]}% to Staggered foes (stagger isn't logged)`);
		else out.unvalued.push(sentence.replace(/\.$/, ''));
	}
	return out;
}

/** The bracelet's effects for the meter: their damage terms summed, and the texts it can't value. */
export function braceletDamage(s: SimState, uptime?: BraceletUptime): Omit<BraceletPart, 'stats'> {
	const out = { outgoing: 0, critHit: 0, back: 0, front: 0, nonDirectional: 0, demon: 0, unvalued: [] as string[] };
	for (const key of braceletEffects(s.bracelet)) {
		const p = braceletPart(key, uptime);
		if (!p) continue;
		out.outgoing += p.outgoing; out.critHit += p.critHit; out.back += p.back; out.front += p.front; out.nonDirectional += p.nonDirectional;
		out.demon += p.demon;
		out.unvalued.push(...p.unvalued);
	}
	for (const x of braceletStats(s.bracelet)) if ((x.type ?? 2) === 2 && COMBAT_STATS[x.index]) out.unvalued.push(`${COMBAT_STATS[x.index]} +${x.value}`);
	out.unvalued.sort();
	return out;
}

/** [game] Crit Rate per point of Crit: 1 / 27.944 %. */
const CRIT_RATE_PER_CRIT = 1 / 27.944;
const CRIT_STAT = 15;
/** Bracelet combat stats with no damage stat the meter can scale (Specialization's identity, Swiftness's speed, …). */
const COMBAT_STATS: Record<number, string> = { 16: 'Specialization', 17: 'Domination', 18: 'Swiftness', 19: 'Endurance', 20: 'Expertise' };

/** `meter`: the DPS meter values every current effect itself (braceletPart); otherwise only the three stat families. */
function braceletTotals(s: SimState, meter = false, uptime?: BraceletUptime) {
	const stats: Partial<Record<keyof StatDeltas, number>> = {};
	const signature: string[] = [];
	for (const key of braceletEffects(s.bracelet)) {
		const part = meter ? braceletPart(key, uptime) : null;
		if (part) {
			for (const [k, v] of Object.entries(part.stats) as [keyof StatDeltas, number][]) stats[k] = (stats[k] ?? 0) + v;
			continue;
		}
		const [kind, id] = key.split(':').map(Number);
		const family = Math.floor(id / 10), roll = id % 10 - 1;
		const entry = kind === 3 ? BRACELET_ROLLS[family] : undefined;
		if (!entry || roll < 0 || roll >= entry.values.length) { signature.push(key); continue; }
		signature.push(`family:${family}`);
		stats[entry.stat] = (stats[entry.stat] ?? 0) + entry.values[roll];
	}
	// Main stat and flat Weapon Power are read by simulate(); other combat stats need separate models. The meter reads Crit
	// as Crit Rate and lists the rest (braceletDamage).
	if (meter) for (const x of braceletStats(s.bracelet)) if ((x.type ?? 2) === 2 && x.index === CRIT_STAT) stats.critRate = (stats.critRate ?? 0) + x.value * CRIT_RATE_PER_CRIT;
	// Damage stats some bracelets carry as plain lines ("Crit Damage +10%", "Additional Damage +4%"), at the accessory
	// lines' indexes and scale.
	for (const x of braceletStats(s.bracelet)) {
		const line = (x.type ?? 2) === 2 ? ACCESSORY_LINES.find((l) => LINE_STAT[l.key] && l.match({ type: 2, index: x.index })) : undefined;
		if (line) stats[LINE_STAT[line.key]] = (stats[LINE_STAT[line.key]] ?? 0) + x.value / (SCALE[LINE_STAT[line.key]] ?? 1);
	}
	const lineIndexes = BRACELET_LINE_INDEXES;
	const known = meter ? [3, 4, 5, 11, 151, CRIT_STAT, ...lineIndexes, ...Object.keys(COMBAT_STATS).map(Number)] : [3, 4, 5, 11, 151, ...lineIndexes];
	const unknownStats = braceletStats(s.bracelet).filter(x => !known.includes(x.index) || (x.type ?? 2) !== 2);
	return { stats, signature: signature.sort(), unknownStats };
}

/** Damage lines the stat values don't describe (Outgoing Damage), as total line value per line name; `own`: lines the
 *  caller values itself (the DPS meter's Outgoing Damage), left out. */
function unvaluedLines(s: SimState, own: readonly string[] = []): Record<string, number> {
	const out: Record<string, number> = {};
	for (const slot of ACCESSORY_SLOTS)
		for (const ln of s.accessories[slot] ?? []) {
			if (isOtherLine(ln) || LINE_STAT[ln.key] || ln.key.startsWith('weapon_') || own.includes(ln.key)) continue;
			const line = ACCESSORY_LINES.find((l) => l.key === ln.key);
			if (line) out[line.name] = (out[line.name] ?? 0) + line.values[ln.tier];
		}
	return out;
}

/** The stat change, assuming only covered fields moved and the bracelet's effects match (checked by the callers). */
function rawDeltas(l: Loadout, from: SimState, to: SimState, base: SimState, meter = false, uptime?: BraceletUptime): StatDeltas {
	const ba = braceletTotals(from, meter, uptime), bb = braceletTotals(to, meter, uptime);
	const a = simulate(l, from, base), b = simulate(l, to, base);
	const la = lineTotals(from), lb = lineTotals(to);
	const line = (k: keyof StatDeltas) => (lb[k] ?? 0) - (la[k] ?? 0) + (bb.stats[k] ?? 0) - (ba.stats[k] ?? 0);
	const weaponQuality = (s: SimState) => (s.quality.weapon === undefined ? 0 : qualityStat('weapon', s.quality.weapon) / 100);
	return {
		mainStat: b.mainStat - a.mainStat,
		weaponPower: b.weaponPower - a.weaponPower + (bb.stats.weaponPower ?? 0) - (ba.stats.weaponPower ?? 0),
		additionalDamage: line('additionalDamage') + weaponQuality(to) - weaponQuality(from),
		critRate: line('critRate'),
		critDamage: line('critDamage'),
		attackPowerPct: line('attackPowerPct'),
		attackPower: line('attackPower'),
		...(bracerStats(to.bracer).attackFlat !== bracerStats(from.bracer).attackFlat ? { baseAttackFlat: bracerStats(to.bracer).attackFlat - bracerStats(from.bracer).attackFlat } : {}),
		...(bracerStats(to.bracer).attackPercent !== bracerStats(from.bracer).attackPercent ? { baseAttackPct: bracerStats(to.bracer).attackPercent - bracerStats(from.bracer).attackPercent } : {})
	};
}

/** Whether every changed field and bracelet effect is one the stat values describe (accessory lines aside). */
function coveredChange(from: SimState, to: SimState, meter = false, uptime?: BraceletUptime) {
	for (const key of Object.keys(to) as (keyof SimState)[]) {
		if (IGNORED.has(key) || !changed(from[key], to[key])) continue;
		if (!COVERED.has(key)) return false;
	}
	const ba = braceletTotals(from, meter, uptime), bb = braceletTotals(to, meter, uptime);
	return !changed(ba.signature, bb.signature) && !changed(ba.unknownStats, bb.unknownStats);
}

/**
 * Raw stat change from `from` to `to`, or null when something changed that the stat values don't describe (an
 * engraving, a gem, an Outgoing Damage line, …).
 */
export function statDeltas(l: Loadout, from: SimState, to: SimState, base: SimState, own: readonly string[] = [], uptime?: BraceletUptime): StatDeltas | null {
	const meter = own.includes('bracelet');
	if (!coveredChange(from, to, meter, uptime)) return null;
	// Outgoing Damage and other lines aren't in the stat values (unless the caller values them: `own`).
	const uncoveredLines = (s: SimState) =>
		ACCESSORY_SLOTS.map((slot) => (s.accessories[slot] ?? []).filter((ln) => isOtherLine(ln) || !LINE_STAT[ln.key] && !ln.key.startsWith('weapon_') && !own.includes(ln.key)));
	if (changed(uncoveredLines(from), uncoveredLines(to))) return null;
	return rawDeltas(l, from, to, base, meter, uptime);
}

/**
 * Like statDeltas, but an upgrade that also adds or raises a damage line the values don't describe (Outgoing Damage)
 * still gets its covered part, with that line named in `unvalued`: the real gain is at least what the covered part
 * gives. Losing such a line makes the covered part an overestimate, so that stays null. Lines with no damage value
 * ("other" lines) don't matter here.
 */
export function statDeltasAtLeast(l: Loadout, from: SimState, to: SimState, base: SimState, own: readonly string[] = [], uptime?: BraceletUptime): { delta: StatDeltas; unvalued: string[] } | null {
	const exact = statDeltas(l, from, to, base, own, uptime);
	if (exact) return { delta: exact, unvalued: [] };
	const meter = own.includes('bracelet');
	if (!coveredChange(from, to, meter, uptime)) return null;
	const before = unvaluedLines(from, own), after = unvaluedLines(to, own);
	const names = [...new Set([...Object.keys(before), ...Object.keys(after)])];
	if (names.some((n) => (after[n] ?? 0) < (before[n] ?? 0))) return null;
	return { delta: rawDeltas(l, from, to, base, meter, uptime), unvalued: names.filter((n) => (after[n] ?? 0) > (before[n] ?? 0)) };
}

/** DPS change in percent: each stat delta times its value (per point, or per 1,000 for flat stats). */
export function dpsGainPct(d: StatDeltas, v: StatValues, baseAttackPct = 0): number {
	return (
		(d.mainStat / 1000) * v.mainStat +
		(d.weaponPower / 1000) * v.weaponPower +
		(d.attackPower / 1000) * v.attackPower +
		((d.baseAttackFlat ?? 0) * (1 + baseAttackPct / 100) / 1000) * v.attackPower +
		d.additionalDamage * v.additionalDamage +
		d.critRate * v.critRate +
		d.critDamage * v.critDamage +
		d.attackPowerPct * v.attackPowerPct
		+ (d.evolutionDamage ?? 0) * v.evoDamage
	);
}
