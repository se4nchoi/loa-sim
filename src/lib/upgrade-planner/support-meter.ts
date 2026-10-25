// The support side of the DPS sim: a support's recorded run, re-scaled by their gear edits. LOA Logs credits each dealer's
// damage to the buffs that raised it, buff by buff (support-run in run-summary.ts), and each buff's added damage is linear
// in its strength (the dealer's damage with it minus without), so a change moves each buff by its strength's ratio:
//   - Attack Power buffs: the support's Attack Power × (1 + Ally Atk. Power Enhancement);
//   - damage buffs (identity, hyper, skill buffs): 1 + Ally Damage Enhancement;
//   - brand: 1 + Brand Power;
//   - the rest (evolution damage, set and bracelet effects): fixed.
// Enhancement comes from accessories, the bracelet, astrogem options and Order core lines. A core line can name one skill
// ("Paint: Dragon Engraving's Party Damage Enhancement +27%"): it moves that skill's buffs only. It can need a Destiny
// effect: it counts for the share of the run that effect was up (the support's own damage under it), and is unknown for a
// Destiny this run never had. Uptime otherwise stays as recorded: gems count for their base attack (the support's Attack
// Power) only, since a cooldown gem reshapes the whole rotation, which one run can't show.
import type { RunSummary, SupportKind } from '$lib/logs/protocol';
import { bracerStats } from './bracer';
import { baseAttackOf } from './dps-explain';
import { braceletEffects, braceletStats, initSimState, optionLevel, simCorePoints, simulate, type SimState } from './simulate';
import { decodeCore } from './tables';
import { SUPPORT_ASTROGEM_VALUES, SUPPORT_CHAOS_LINES, SUPPORT_CORE_LINES, type SupportChaosLine, type SupportCoreLine } from './support-buffs';
import { SUPPORT_ACCESSORY_LINES, swappedCoreId } from './support';
import { SUPPORT_BRACELET_EFFECTS } from './support-data';
import type { Loadout } from './types';

export interface SupportStats {
	/** The support's Attack Power (its buffs' base). */
	attackPower: number;
	/** Ally Atk. Power Enhancement, Ally Damage Enhancement, Brand Power from gear and astrogems: percent. */
	allyAtk: number;
	allyDmg: number;
	brand: number;
	/** The Order core lines in effect at the cores' points. */
	coreLines: SupportCoreLine[];
	/** Echoing Brand's "target takes +x% Damage" (percent), and the bracelet's target debuffs by effect family (1106
	 *  Corrosion: Defense, 1107 Crit Resistance, 1109 Detachment: crit damage), percent: the logs keep these as buffs. */
	takenDmg: number;
	debuffs: Record<number, number>;
}

/** A line's percent: accessory values are in hundredths of a percent (800 = 8%). */
const linePct = (key: string, state: SimState) =>
	Object.values(state.accessories).flat().reduce((sum, ln) => {
		const line = ln && 'tier' in ln && ln.key === key ? SUPPORT_ACCESSORY_LINES.find((x) => x.key === key) : undefined;
		return sum + (line && 'tier' in ln ? line.values[ln.tier] / 100 : 0);
	}, 0);
/** A bracelet effect's "Ally Atk. Power Enhancement +3%". */
const effectPct = (state: SimState, name: string) =>
	braceletEffects(state.bracelet).reduce((sum, key) => {
		const m = SUPPORT_BRACELET_EFFECTS.find((e) => e.key === key)?.text.match(new RegExp(`${name} \\+([\\d.]+)%`));
		return sum + (m ? Number(m[1]) : 0);
	}, 0);
/** An astrogem option's percent at its total level across the grid (2011 Ally Dmg, 2012 Brand, 2013 Ally Atk.). */
const astrogemPct = (state: SimState, id: number) => {
	const level = optionLevel(state.arkGrid, id);
	return level > 0 ? (SUPPORT_ASTROGEM_VALUES[id]?.[Math.min(level, 120) - 1] ?? 0) / 100 : 0;
};
const braceletPct = (state: SimState, type: number) =>
	braceletStats(state.bracelet).reduce((sum, s) => sum + (s.type === type ? s.value / 100 : 0), 0);

/** The Order core lines in effect: each core the clear had in its slot (`as`), at the slot's grade and the core's points. */
function coreLinesOf(loadout: Loadout, state: SimState, base: SimState): SupportCoreLine[] {
	const out: SupportCoreLine[] = [];
	for (const core of state.arkGrid) {
		const id = core.as ?? core.id;
		const info = decodeCore(id), slot = decodeCore(core.id);
		if (!info || !slot || info.attr !== 'order') continue;
		const grade = core.grade ?? slot.grade;
		const points = simCorePoints(loadout, state, base, core.id);
		for (const line of SUPPORT_CORE_LINES[grade !== info.grade ? swappedCoreId(id, grade) : id] ?? []) if (points >= line.points) out.push(line);
	}
	return out;
}

/** The chaos core lines in effect (Faith / Fortitude Enhancement, Echoing Brand): as coreLinesOf, for chaos cores. */
function chaosLinesOf(loadout: Loadout, state: SimState, base: SimState): SupportChaosLine[] {
	const out: SupportChaosLine[] = [];
	for (const core of state.arkGrid) {
		const id = core.as ?? core.id;
		const info = decodeCore(id), slot = decodeCore(core.id);
		if (!info || !slot || info.attr !== 'chaos') continue;
		const grade = core.grade ?? slot.grade;
		const points = simCorePoints(loadout, state, base, core.id);
		for (const line of SUPPORT_CHAOS_LINES[grade !== info.grade ? swappedCoreId(id, grade) : id] ?? []) if (points >= line.points) out.push(line);
	}
	return out;
}

/** The bracelet's target debuffs ("On hit, target's Defense -2.5%"), percent by effect family. */
function braceletDebuffs(state: SimState): Record<number, number> {
	const out: Record<number, number> = {};
	for (const key of braceletEffects(state.bracelet)) {
		const family = Number(key.match(/^3:(110[6-9])\d$/)?.[1] ?? 0);
		const pct = family ? Number(SUPPORT_BRACELET_EFFECTS.find((e) => e.key === key)?.text.match(/target's [^.]*?-([\d.]+)%/)?.[1] ?? 0) : 0;
		if (pct) out[family] = (out[family] ?? 0) + pct;
	}
	return out;
}

/** The loadout's own state: what simulate and core points measure edits against (not the run's baseline). */
const anchors = new WeakMap<Loadout, SimState>();
const anchorOf = (l: Loadout) => anchors.get(l) ?? (anchors.set(l, initSimState(l)), anchors.get(l)!);

export function supportStats(loadout: Loadout, state: SimState, _base?: SimState): SupportStats {
	const base = anchorOf(loadout);
	const r = simulate(loadout, state, base);
	const flat = bracerStats(state.bracer).attackFlat;
	const chaos = chaosLinesOf(loadout, state, base);
	const sum = (k: 'allyAtk' | 'allyDmg' | 'brand' | 'takenDmg') => chaos.reduce((t, l) => t + (l[k] ?? 0), 0);
	return {
		attackPower: (Math.sqrt((r.mainStat * r.weaponPower) / 6) + flat) * (1 + baseAttackOf(loadout, state) / 100),
		allyAtk: linePct('s_ally_atk', state) + braceletPct(state, 54) + effectPct(state, 'Ally Atk\\. Power Enhancement') + astrogemPct(state, 2013) + sum('allyAtk'),
		allyDmg: linePct('s_ally_dmg', state) + braceletPct(state, 59) + astrogemPct(state, 2011) + sum('allyDmg'),
		brand: linePct('s_brand', state) + astrogemPct(state, 2012) + sum('brand'),
		coreLines: coreLinesOf(loadout, state, base),
		takenDmg: sum('takenDmg'),
		debuffs: braceletDebuffs(state)
	};
}

/**
 * How much of the run each Destiny effect was up, by name: the support's own skills' damage under it (casts-weighted per
 * skill, so one big Hyper Awakening hit doesn't decide it). Only Destiny effects the logs kept for this run.
 */
export function destinyUptime(run: RunSummary): Record<string, number> {
	const out: Record<string, number> = {};
	const names = run.buffNames ?? {};
	const skills = run.skills.filter((s) => s.buffs && !s.hyper && s.damage > 0 && s.casts > 0);
	const casts = skills.reduce((sum, s) => sum + s.casts, 0);
	if (!casts) return out;
	for (const [id, name] of Object.entries(names)) {
		if (!name.startsWith('Destiny: ')) continue;
		out[name] = Math.min(1, skills.reduce((sum, s) => sum + s.casts * ((s.buffs?.[Number(id)] ?? 0) / s.damage), 0) / casts);
	}
	return out;
}

/** A skill a core line names against a buff's source skill ("Aria" / "Aria", "Paint: Dragon Engraving" / "Paint: Dragon Engraving"). */
const sameSkill = (line: string, source: string | undefined) => !!source && (source === line || source.includes(line) || line.includes(source));

/**
 * A buff's strength under `stats`, for its kind and source skill. Destiny lines count at their uptime in the run; one this
 * run never had makes the strength unknown (null), as does nothing else.
 */
export function buffStrength(stats: SupportStats, kind: SupportKind, skill: string | undefined, destiny: Record<string, number>): number | null {
	if (kind === 'other') return 1;
	if (kind === 'brand') return 1 + stats.brand / 100;
	const stat = kind === 'attack' ? 'atk' : 'dmg';
	let extra = 0;
	for (const line of stats.coreLines) {
		if (line.stat !== stat || (line.skill && !sameSkill(line.skill, skill))) continue;
		if (line.destiny && destiny[line.destiny] === undefined) return null;
		extra += line.pct * (line.destiny ? destiny[line.destiny] : 1);
	}
	return kind === 'attack' ? stats.attackPower * (1 + (stats.allyAtk + extra) / 100) : 1 + (stats.allyDmg + extra) / 100;
}

/**
 * A logged "other" buff that is the support's own gear, from `a` to `b`: Echoing Brand's damage-taken debuff (buff ids
 * 60824xxxx) by the core's total, the bracelet's Corrosion / Detachment (6051000FR: effect family 11FF, roll R) by the
 * bracelet's effect of that family (0 when it's gone). Raid buffs and the rest: 1, as recorded.
 */
function gearDebuffFactor(a: SupportStats, b: SupportStats, id: number): number {
	if (Math.floor(id / 10_000) === 60_824) return a.takenDmg > 0 ? b.takenDmg / a.takenDmg : 1;
	if (id >= 605_100_000 && id < 605_101_000) {
		const family = 1100 + Math.floor((id - 605_100_000) / 10);
		return (a.debuffs[family] ?? 0) > 0 ? (b.debuffs[family] ?? 0) / a.debuffs[family] : 1;
	}
	return 1;
}

export interface SupportMeter {
	durationMs: number;
	/** Party damage the buffs added, recorded and with the edits. */
	before: number;
	after: number;
	kinds: { kind: SupportKind; before: number; after: number }[];
	dealers: { cls: string; damage: number; before: number; after: number; uptime?: NonNullable<RunSummary['support']>['uptime'] }[];
	uptime: NonNullable<RunSummary['support']>['uptime'];
	/** Edited parts that don't move the buffs here, or that move them in ways this run can't show. */
	notInMeter: string[];
}

const KINDS: SupportKind[] = ['attack', 'damage', 'brand', 'other'];
/** The parts whose effect on the buffs is the stats above (or nothing for them); the rest is listed, not valued. */
// Karma: Enlightenment's Weapon Power reaches Attack Power through the simulator; Evolution and Leap are a CP bonus only.
// Paradise: a support's orb adds no buff strength (a flat CP value), so it moves nothing here.
const VALUED = new Set<keyof SimState>(['bracer', 'sidereal', 'gear', 'quality', 'accessories', 'accessoryStats', 'skins', 'bracelet', 'skillShares', 'skillCooldownUse', 'arkGrid', 'gems', 'karma', 'paradise']);
const LABELS: Partial<Record<keyof SimState, string>> = { karma: 'Karma', engravings: 'Engravings', paradise: 'Paradise' };
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Astrogem options besides the support ones (Attack Power, Additional Damage, Boss Damage): not part of the buffs. */
const SUPPORT_OPTIONS = new Set([2011, 2012, 2013]);
const otherOptions = (s: SimState) => s.arkGrid.map((c) => c.gems.map((g) => g.opts.filter((o) => !SUPPORT_OPTIONS.has(o.id))));

/** The run's support contribution with `state`'s gear, against `baseline` (the gear it was played with). */
export function supportMeter(loadout: Loadout, baseline: SimState, state: SimState, run: RunSummary): SupportMeter | null {
	const s = run.support;
	if (!s) return null;
	const a = supportStats(loadout, baseline, baseline), b = supportStats(loadout, state, baseline);
	const destiny = destinyUptime(run);
	const notInMeter: string[] = (Object.keys(state) as (keyof SimState)[]).filter((k) => !VALUED.has(k) && !same(state[k], baseline[k])).map((k) => LABELS[k] ?? k);
	if (!same(otherOptions(state), otherOptions(baseline))) notInMeter.push('Other astrogem options');
	if (state.karma.evolution !== baseline.karma.evolution || state.karma.leap !== baseline.karma.leap) notInMeter.push('Evolution / Leap Karma');
	if (!same(state.gems, baseline.gems)) notInMeter.push('Gem cooldowns (their base attack counts)');

	/** A buff's factor from the baseline to the edits; 1 (left as recorded) when either side is unknown. */
	let unknownDestiny = false;
	const factor = (kind: SupportKind, skill: string | undefined, id?: number) => {
		if (kind === 'other') return id === undefined ? 1 : gearDebuffFactor(a, b, id);
		const x = buffStrength(a, kind, skill, destiny), y = buffStrength(b, kind, skill, destiny);
		if (x === null || y === null || !(x > 0)) { unknownDestiny ||= x !== y; return 1; }
		return y / x;
	};
	const kindsBefore = { attack: 0, damage: 0, brand: 0, other: 0 } as Record<SupportKind, number>;
	const kindsAfter = { ...kindsBefore };
	const dealers = s.dealers.map((d) => {
		// By buff when the import kept it (a core line can name one skill); by kind on older imports.
		const parts: [SupportKind, string | undefined, number, number | undefined][] = d.buffs && s.sources
			? Object.entries(d.buffs).map(([id, x]) => [s.sources![Number(id)]?.kind ?? 'other', s.sources![Number(id)]?.skill, x, Number(id)])
			: KINDS.map((k) => [k, undefined, d.kinds[k], undefined]);
		let before = 0, after = 0;
		for (const [kind, skill, x, id] of parts) {
			const y = x * factor(kind, skill, id);
			before += x; after += y;
			kindsBefore[kind] += x; kindsAfter[kind] += y;
		}
		return { cls: d.cls, damage: d.damage, before, after, ...(d.uptime ? { uptime: d.uptime } : {}) };
	});
	if (unknownDestiny) notInMeter.push("Destiny effects this run didn't have");
	return {
		durationMs: run.duration,
		before: dealers.reduce((sum, d) => sum + d.before, 0),
		after: dealers.reduce((sum, d) => sum + d.after, 0),
		kinds: KINDS.map((kind) => ({ kind, before: kindsBefore[kind], after: kindsAfter[kind] })),
		dealers,
		uptime: s.uptime,
		notInMeter
	};
}

/** How much each kind of buff grows from `a` to `b`, for every buff of the kind (no skill named; Destiny lines left out). */
export function supportFactors(a: SupportStats, b: SupportStats): Record<SupportKind, number> {
	const f = (k: SupportKind) => (buffStrength(b, k, undefined, {}) ?? 1) / (buffStrength(a, k, undefined, {}) ?? 1);
	return { attack: f('attack'), damage: f('damage'), brand: f('brand'), other: 1 };
}

/**
 * One step's gain in party DPS added, percent (Next Upgrades for a support). null when the step moves nothing: it only
 * touches what the meter doesn't value. Unknown, not zero.
 */
export function supportGain(loadout: Loadout, baseline: SimState, from: SimState, to: SimState, run: RunSummary): number | null {
	const a = supportMeter(loadout, baseline, from, run), b = supportMeter(loadout, baseline, to, run);
	if (!a || !b || !(a.after > 0)) return null;
	const gain = (b.after / a.after - 1) * 100;
	return Math.abs(gain) < 1e-6 && !same(from, to) ? null : gain;
}
