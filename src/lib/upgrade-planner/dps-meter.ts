// DPS mode's meter: a recorded clear (or same-gear clears of one gate) replayed with the Simulator's current edits.
// Every skill keeps its recorded damage and the fight its recorded length; the edits scale that damage:
//   - stat edits (honing, quality, bracer, accessories, bracelet stats, skins): one multiplier for every skill, from
//     the stat model (dps-model.ts) with that clear's Crit Rate value;
//   - damage gems: their skills only (and a T4 gem's base attack, for every skill);
//   - cooldown gems: their skills cast more often, as far as the clear had them on cooldown (LOA Logs' time
//     available); skills without that record are listed, not counted;
//   - order Ark Grid cores (with the model loaded, see ark-grid-dps.ts): their skill group and Destiny damage;
//   - anything else (chaos cores, astrogem options, karma, engravings, Paradise) isn't valued yet: listed, not counted.
import type { RunSummary } from '$lib/logs/protocol';
import { critRates } from './dps-comparison';
import { baseAttackOf, gemMembers, planModel, skillEffect } from './dps-explain';
import { modelGain } from './dps-model';
import { gateSample } from './dps-gates';
import { statDeltasAtLeast } from './dps-stats';
import type { orderCoreEffect } from './ark-grid-dps';
import { simulate, type SimGem, type SimState } from './simulate';
import { gridStats } from './dealer-grid-stats';
import type { Loadout } from './types';
import { statGain, type DamageContext } from './dps-stat-engine';

export interface MeterSkill {
	id: number;
	/** Recorded damage, and with the edits (summed over the clears). */
	before: number;
	after: number;
}

export interface Meter {
	/** Recorded total damage, and with the edits. */
	before: number;
	after: number;
	/** Recorded fight time, ms (summed over the clears). */
	durationMs: number;
	skills: MeterSkill[];
	/** The stat edits' gain (damage-weighted over the clears), null when the stat values to value them are missing. */
	statPct: number | null;
	/** Edits the meter doesn't count yet, by card ("Ark Grid", "Karma", …). */
	notInMeter: string[];
	notes: string[];
}

/** Edited parts of the state the stat model covers (see dps-stats COVERED) or that are only log data. */
const STAT_KEYS = new Set<keyof SimState>(['bracer', 'sidereal', 'gear', 'quality', 'accessories', 'accessoryStats', 'skins', 'bracelet', 'skillShares', 'skillCooldownUse']);
const LABELS: Partial<Record<keyof SimState, string>> = { arkGrid: 'Ark Grid', karma: 'Karma', engravings: 'Engravings', paradise: 'Paradise' };
const DROPPED_EDITS = 'Some gear edits';
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * The parts of `state` that differ from `base` and that the meter doesn't value ("Karma"). On the Ark Grid, Order cores
 * (ark-grid-dps.ts), chaos cores and astrogem options (dealer-grid-stats.ts) are valued; only chaos lines with no damage
 * stat (Atk. Speed, Skill Cooldown, Burn, Weak Point) aren't.
 */
function unvaluedParts(loadout: Loadout, base: SimState, state: SimState, hasArkGrid: boolean): string[] {
	const out: string[] = [];
	for (const key of Object.keys(state) as (keyof SimState)[]) {
		if (STAT_KEYS.has(key) || key === 'gems' || same(state[key], base[key])) continue;
		if (key !== 'arkGrid' || !hasArkGrid) out.push(LABELS[key] ?? key);
		else if (!same(gridStats(loadout, state).unvalued, gridStats(loadout, base).unvalued)) out.push('Chaos core speed, cooldown and Burn lines');
	}
	return out;
}

export function dpsMeter(loadout: Loadout, base: SimState, state: SimState, buildRuns: RunSummary[], runs: RunSummary[], arkGrid?: typeof orderCoreEffect, context?: DamageContext): Meter | null {
	if (!runs.length) return null;
	const notes: string[] = [];
	const notInMeter: string[] = [];

	// Stat part: the edits on the cards the stat model covers; everything else put back to the snapshot.
	const statState = structuredClone(state);
	notInMeter.push(...unvaluedParts(loadout, base, state, !!arkGrid));
	for (const key of Object.keys(state) as (keyof SimState)[])
		if (!STAT_KEYS.has(key) && !same(state[key], base[key])) (statState as unknown as Record<string, unknown>)[key] = structuredClone(base[key]);
	const change = statDeltasAtLeast(loadout, base, statState, base);
	if (!change && !same(statState, base)) notes.push(`${DROPPED_EDITS} remove a damage line the model can't value, so they're left out.`);
	if (change?.unvalued.length) notes.push(`${change.unvalued.join(', ')} isn't valued yet: the real gain is a little higher.`);

	// Gems: damage gems scale their skills; a T4 gem's base attack joins the stat part. Cooldown gems add casts, by
	// how much of these clears their skills spent on cooldown.
	const gemEffects: { skills: Set<number>; pct: number }[] = [];
	const cooldownUse = gateSample(runs).skillCooldownUse;
	let cooldownGems = 0;
	// Each gem against the baseline's gem on the same skill and kind: a clear's snapshot can list its gems in another order
	// than the loadout, so pairing by position would read every gem as a swap. Same position first, then any free one.
	const used = new Set<number>();
	const pairs: (SimGem | undefined)[] = state.gems.map((gem, index) => {
		const b = base.gems[index];
		if (b && b.skill === gem.skill && b.kind === gem.kind) { used.add(index); return b; }
		return undefined;
	});
	state.gems.forEach((gem, index) => {
		if (pairs[index] || gem.skill === null) return;
		const j = base.gems.findIndex((b, k) => !used.has(k) && b.skill === gem.skill && b.kind === gem.kind);
		if (j >= 0) { used.add(j); pairs[index] = base.gems[j]; }
	});
	state.gems.forEach((gem, index) => {
		const was = pairs[index];
		if (was && same(gem, was)) return;
		if (!was && same(gem, base.gems[index])) return;
		if (!was || gem.skill === null || gem.tier !== was.tier) {
			notInMeter.push('Gem swaps');
			return;
		}
		const skills = [...new Set([...gemMembers(gem.skill), gem.skill])];
		if (gem.kind === 'cooldown' && !skills.some((id) => cooldownUse[id] !== undefined)) { cooldownGems++; return; }
		const kind = gem.kind === 'cooldown' ? 'cooldown' : 'damage';
		const { effectPct } = skillEffect(loadout, state, { index, skill: gem.skill, name: '', kind, from: was.level, to: gem.level, label: '' }, cooldownUse);
		gemEffects.push({ skills: new Set(skills), pct: effectPct });
	});
	if (cooldownGems) notInMeter.push(`Cooldown gems without cooldown data (${cooldownGems})`);
	const gemBaseAttack = baseAttackOf(loadout, state) - baseAttackOf(loadout, base);
	const delta = change ? { ...change.delta } : { mainStat: 0, weaponPower: 0, additionalDamage: 0, critRate: 0, critDamage: 0, attackPowerPct: 0, attackPower: 0 };
	if (gemBaseAttack) delta.baseAttackPct = (delta.baseAttackPct ?? 0) + gemBaseAttack;
	// Chaos cores and astrogem options: their stat lines join the stat part (percent Weapon Power as flat, on the build's
	// Weapon Power); Damage to foes and to Boss scale all damage, On Crit Hit damage the crit share of each skill.
	const [gridA, gridB] = arkGrid ? [gridStats(loadout, base), gridStats(loadout, state)] : [null, null];
	if (gridA && gridB) {
		delta.attackPower += gridB.atkFlat - gridA.atkFlat;
		delta.attackPowerPct += gridB.atkPct - gridA.atkPct;
		delta.critRate += gridB.critRate - gridA.critRate;
		delta.critDamage += gridB.critDamage - gridA.critDamage;
		delta.additionalDamage += gridB.addDmg - gridA.addDmg;
		delta.weaponPower += gridB.wpFlat - gridA.wpFlat + ((gridB.wpPct - gridA.wpPct) / 100) * simulate(loadout, state).weaponPower;
	}
	const ratio = (b: number, a: number) => (1 + b / 100) / (1 + a / 100);
	const gridDamage = gridA && gridB ? ratio(gridB.damage, gridA.damage) * ratio(gridB.boss, gridA.boss) : 1;
	const gridCrit = gridA && gridB ? ratio(gridB.critHit, gridA.critHit) - 1 : 0;
	/** A skill's chaos / astrogem multiplier: all damage by Damage to foes and Boss, its crits by On Crit Hit damage. */
	const gridOf = (skill: { damage: number; critDamage: number }) => gridDamage * (1 + (skill.damage > 0 ? skill.critDamage / skill.damage : 0) * gridCrit);
	const hasStats = Object.values(delta).some((v) => v);

	// Each clear on its own: the gear's buckets from the build's clears, Crit Rate from this clear (or the pooled one).
	const model = planModel(loadout, base, base, buildRuns, runs).input;
	const crit = critRates(runs);
	const bySkill = new Map<number, MeterSkill>();
	let before = 0, after = 0, durationMs = 0, statWeighted = 0, outsideDamage = 0, statKnown = true;
	const unvalued = new Set<string>();
	runs.forEach((run, i) => {
		const gain = hasStats ? context
			? run.critConversion && !context.critConversion && (delta.critRate || delta.critDamage || delta.evolutionDamage) ? null : statGain(context, delta)
			: modelGain(delta, { ...model, critRate: crit.perRun[i] }).gainPct : 0;
		if (gain === null) statKnown = false;
		const stat = 1 + (gain ?? 0) / 100;
		statWeighted += Math.max(0, run.damage - run.skills.filter((s) => s.hyper).reduce((sum, s) => sum + s.damage, 0)) * (gain ?? 0);
		outsideDamage += Math.max(0, run.damage - run.skills.reduce((sum, s) => sum + s.damage, 0)) * stat * gridDamage;
		durationMs += run.duration;
		const cores = arkGrid && !same(state.arkGrid, base.arkGrid) ? arkGrid(loadout, base, state, run) : null;
		for (const u of cores?.unvalued ?? []) unvalued.add(u);
		for (const skill of run.skills) {
			const gems = gemEffects.reduce((m, g) => (g.skills.has(skill.id) ? m * (1 + g.pct / 100) : m), 1) * (cores?.factor(skill) ?? 1);
			const row = bySkill.get(skill.id) ?? { id: skill.id, before: 0, after: 0 };
			row.before += skill.damage;
			row.after += skill.damage * (skill.hyper ? 1 : stat * gems * gridOf(skill));
			bySkill.set(skill.id, row);
		}
		before += run.damage;
	});
	for (const row of bySkill.values()) after += row.after;
	// Damage outside the per-skill list (if any) is scaled by the stat part alone.
	after += outsideDamage;
	notes.push(...unvalued);
	if (hasStats && !statKnown) notes.push(context ? 'Configured totals do not cover this run’s crit conversion; stat edits are left out.' : "Stat edits need a run recorded with LOA Logs' stat values, or configured combat totals; they're left out.");
	return {
		before, after, durationMs,
		skills: [...bySkill.values()].sort((a, b) => b.after - a.after),
		statPct: hasStats && statKnown ? statWeighted / Math.max(1, before) : hasStats ? null : 0,
		notInMeter: [...new Set(notInMeter)], notes
	};
}

/**
 * DPS change from one more edit (`from` → `to`), measured on the same meter as DPS mode shows: percent more total
 * damage on the picked clear. null when the edit touches something the meter doesn't value yet (it would read as 0).
 * `atLeast`: part of it isn't valued (an Outgoing Damage line), so the real gain is a little higher.
 */
export function meterGain(loadout: Loadout, baseline: SimState, from: SimState, to: SimState, buildRuns: RunSummary[], runs: RunSummary[], arkGrid?: typeof orderCoreEffect, fromMeter?: Meter | null, context?: DamageContext): { gainPct: number | null; atLeast: boolean } {
	const a = fromMeter ?? dpsMeter(loadout, baseline, from, buildRuns, runs, arkGrid, context);
	const b = dpsMeter(loadout, baseline, to, buildRuns, runs, arkGrid, context);
	if (!a || !b || !(a.after > 0)) return { gainPct: null, atLeast: false };
	const added = (x: string[], y: string[]) => y.filter((v) => !x.includes(v));
	if (added(a.notInMeter, b.notInMeter).length || b.statPct === null) return { gainPct: null, atLeast: false };
	const newNotes = added(a.notes, b.notes);
	if (newNotes.some((n) => n.startsWith(DROPPED_EDITS))) return { gainPct: null, atLeast: false };
	const gainPct = (b.after / a.after - 1) * 100;
	// A step the meter can't see moves nothing: an astrogem option, Karma (even when the clear's baseline already differed
	// there, so no new "not counted" shows), a core whose effect isn't parsed or was swapped since the clear. A real change
	// that moves nothing is unknown, not zero; one that moves something but touches an unvalued part is a floor.
	const unvalued = unvaluedParts(loadout, from, to, !!arkGrid).length > 0;
	if (Math.abs(gainPct) < 1e-6 && !same(from, to)) return { gainPct: null, atLeast: false };
	return { gainPct, atLeast: newNotes.length > 0 || unvalued };
}

/** A snapshot the Simulator can switch to, for matching a clear's gear. */
export interface SnapshotOption {
	id: string;
	label: string;
	cp: number | null;
	/** The snapshot being simulated now. */
	current: boolean;
	select: () => void;
}

/** The kept snapshot that matches a clear: its CP within `tolerance` (0.5%) of the clear's recorded CP, closest first. */
export function matchSnapshot<T extends { cp: number | null }>(clearCp: number | null, snapshots: T[], tolerance = 0.005): T | null {
	if (!clearCp) return null;
	const close = snapshots.filter((s) => s.cp && Math.abs(s.cp / clearCp - 1) <= tolerance);
	return close.sort((a, b) => Math.abs(a.cp! - clearCp) - Math.abs(b.cp! - clearCp))[0] ?? null;
}
