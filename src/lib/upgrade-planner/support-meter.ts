// The support side of the DPS sim: a support's recorded run, re-scaled by their gear edits. LOA Logs credits each dealer's
// damage to the buffs that raised it (support-run in run-summary.ts); each kind of buff scales with one of the support's
// stats, so a gear change moves that kind by the stat's ratio:
//   - Attack Power buffs: the support's Attack Power × (1 + Ally Atk. Power Enhancement);
//   - damage buffs (identity, hyper): 1 + Ally Damage Enhancement;
//   - brand: 1 + Brand Power;
//   - the rest (evolution damage, set and bracelet effects): fixed.
// A buff's added damage is linear in its strength (dealer damage with it minus without), so the ratio carries straight
// through. Uptime stays as recorded: gems and cores that would change it aren't valued yet.
import type { RunSummary, SupportKind } from '$lib/logs/protocol';
import { bracerStats } from './bracer';
import { baseAttackOf } from './dps-explain';
import { braceletEffects, braceletStats, optionLevel, simCorePoints, simulate, type SimState } from './simulate';
import { decodeCore } from './tables';
import { SUPPORT_ASTROGEM_VALUES, SUPPORT_CORE_LINES } from './support-buffs';
import { SUPPORT_ACCESSORY_LINES, swappedCoreId } from './support';
import { SUPPORT_BRACELET_EFFECTS } from './support-data';
import type { Loadout } from './types';

export interface SupportStats {
	/** The support's Attack Power (its buffs' base). */
	attackPower: number;
	/** Ally Atk. Power Enhancement, Ally Damage Enhancement, Brand Power: percent. */
	allyAtk: number;
	allyDmg: number;
	brand: number;
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
/**
 * Order cores' unconditional Ally Atk. Power / Ally Damage Enhancement lines at the core's points: the core the clear had
 * in the slot (`as`), at the slot's grade, as the dealer model reads it.
 */
function coreEnhancement(loadout: Loadout, state: SimState, base: SimState): { allyAtk: number; allyDmg: number } {
	const out = { allyAtk: 0, allyDmg: 0 };
	for (const core of state.arkGrid) {
		const id = core.as ?? core.id;
		const info = decodeCore(id), slot = decodeCore(core.id);
		if (!info || !slot || info.attr !== 'order') continue;
		const grade = core.grade ?? slot.grade;
		const points = simCorePoints(loadout, state, base, core.id);
		for (const [need, atk, dmg] of SUPPORT_CORE_LINES[grade !== info.grade ? swappedCoreId(id, grade) : id] ?? [])
			if (points >= need) { out.allyAtk += atk; out.allyDmg += dmg; }
	}
	return out;
}
const braceletPct = (state: SimState, type: number) =>
	braceletStats(state.bracelet).reduce((sum, s) => sum + (s.type === type ? s.value / 100 : 0), 0);

export function supportStats(loadout: Loadout, state: SimState, base: SimState): SupportStats {
	const r = simulate(loadout, state, base);
	const flat = bracerStats(state.bracer).attackFlat;
	const cores = coreEnhancement(loadout, state, base);
	return {
		attackPower: (Math.sqrt((r.mainStat * r.weaponPower) / 6) + flat) * (1 + baseAttackOf(loadout, state) / 100),
		allyAtk: linePct('s_ally_atk', state) + braceletPct(state, 54) + effectPct(state, 'Ally Atk\\. Power Enhancement') + astrogemPct(state, 2013) + cores.allyAtk,
		allyDmg: linePct('s_ally_dmg', state) + braceletPct(state, 59) + astrogemPct(state, 2011) + cores.allyDmg,
		brand: linePct('s_brand', state) + astrogemPct(state, 2012)
	};
}

/** How much each kind of buff grows from `from` to `to` (1 = unchanged). */
export function supportFactors(a: SupportStats, b: SupportStats): Record<SupportKind, number> {
	return {
		attack: (b.attackPower * (1 + b.allyAtk / 100)) / (a.attackPower * (1 + a.allyAtk / 100)),
		damage: (1 + b.allyDmg / 100) / (1 + a.allyDmg / 100),
		brand: (1 + b.brand / 100) / (1 + a.brand / 100),
		other: 1
	};
}

export interface SupportMeter {
	durationMs: number;
	/** Party damage the buffs added, recorded and with the edits. */
	before: number;
	after: number;
	kinds: { kind: SupportKind; before: number; after: number }[];
	dealers: { cls: string; damage: number; before: number; after: number }[];
	uptime: NonNullable<RunSummary['support']>['uptime'];
	/** Edited parts that don't move the buffs here (engravings, Karma, Ark Grid, Paradise; a gem's uptime, though its base attack counts). */
	notInMeter: string[];
}

const KINDS: SupportKind[] = ['attack', 'damage', 'brand', 'other'];
/** The parts whose effect on the buffs is the stats above (or nothing for them); the rest is listed, not valued. */
const VALUED = new Set<keyof SimState>(['bracer', 'sidereal', 'gear', 'quality', 'accessories', 'accessoryStats', 'skins', 'bracelet', 'skillShares', 'skillCooldownUse']);
const LABELS: Partial<Record<keyof SimState, string>> = { arkGrid: 'Ark Grid', karma: 'Karma', engravings: 'Engravings', paradise: 'Paradise', gems: 'Gem cooldowns' };
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** The Ark Grid without what the stats above value (the support options' levels, the gems' points and willpower): which cores, grades and other options. */
const SUPPORT_OPTIONS = new Set([2011, 2012, 2013]);
const gridRest = (s: SimState) => s.arkGrid.map((c) => ({ id: c.id, as: c.as, grade: c.grade, gems: c.gems.map((g) => g.opts.filter((o) => !SUPPORT_OPTIONS.has(o.id))) }));

/** The run's support contribution with `state`'s gear, against `baseline` (the gear it was played with). */
export function supportMeter(loadout: Loadout, baseline: SimState, state: SimState, run: RunSummary): SupportMeter | null {
	const s = run.support;
	if (!s) return null;
	const f = supportFactors(supportStats(loadout, baseline, baseline), supportStats(loadout, state, baseline));
	const scale = (k: Record<SupportKind, number>) => KINDS.reduce((sum, kind) => sum + k[kind] * f[kind], 0);
	const total = (k: Record<SupportKind, number>) => KINDS.reduce((sum, kind) => sum + k[kind], 0);
	return {
		durationMs: run.duration,
		before: total(s.kinds),
		after: scale(s.kinds),
		kinds: KINDS.map((kind) => ({ kind, before: s.kinds[kind], after: s.kinds[kind] * f[kind] })),
		dealers: s.dealers.map((d) => ({ cls: d.cls, damage: d.damage, before: total(d.kinds), after: scale(d.kinds) })),
		uptime: s.uptime,
		notInMeter: (Object.keys(state) as (keyof SimState)[]).filter((k) => !VALUED.has(k) && (k === 'arkGrid' ? !same(gridRest(state), gridRest(baseline)) : !same(state[k], baseline[k]))).map((k) => LABELS[k] ?? k)
	};
}

/**
 * One step's gain in party DPS added, percent (Next Upgrades for a support). null when the step only touches what the
 * meter doesn't value (it moves nothing there): unknown, not zero.
 */
export function supportGain(loadout: Loadout, baseline: SimState, from: SimState, to: SimState, run: RunSummary): number | null {
	const a = supportMeter(loadout, baseline, from, run), b = supportMeter(loadout, baseline, to, run);
	if (!a || !b || !(a.after > 0)) return null;
	const gain = (b.after / a.after - 1) * 100;
	return Math.abs(gain) < 1e-6 && !same(from, to) ? null : gain;
}
