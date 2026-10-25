// A dealer's Ark Grid besides Order cores, as damage stats for the DPS meter: each chaos core's lines at its points (the
// core the clear had in the slot, at the slot's grade, as Order cores are read) and the astrogem options at their grid
// totals (Atk. Power %, Additional Damage, Damage to Boss).
import { CHAOS_CORE_LINES, DEALER_ASTROGEM_VALUES } from './dealer-grid';
import { orbPower, orbValue } from './paradise';
import { initSimState, optionLevel, simCorePoints, type SimState } from './simulate';
import { swappedCoreId } from './support';
import { decodeCore } from './tables';
import type { Loadout } from './types';

export interface GridStats {
	/** Percent: Damage to foes, On Crit Hit damage, Damage to Boss, Additional Damage, Crit Rate, Crit Damage, Atk. Power, Weapon Power. */
	damage: number; critHit: number; boss: number; addDmg: number; critRate: number; critDamage: number; atkPct: number; wpPct: number;
	/** Flat Atk. Power and Weapon Power. */
	atkFlat: number; wpFlat: number;
	/** Lines in effect with no damage stat to scale (Atk. Speed, Skill Cooldown, Burn, Weak Point, debuffs). */
	unvalued: string[];
}

const astrogemPct = (state: SimState, id: number) => {
	const level = optionLevel(state.arkGrid, id);
	return level > 0 ? (DEALER_ASTROGEM_VALUES[id]?.[Math.min(level, 120) - 1] ?? 0) / 100 : 0;
};

/** The loadout's own state: what core points are counted from (bible's points, then the gems' changes). */
const anchors = new WeakMap<Loadout, SimState>();
const anchorOf = (l: Loadout) => anchors.get(l) ?? (anchors.set(l, initSimState(l)), anchors.get(l)!);

export function gridStats(loadout: Loadout, state: SimState): GridStats {
	const base = anchorOf(loadout);
	const out: GridStats = { damage: 0, critHit: 0, boss: 0, addDmg: astrogemPct(state, 2002), critRate: 0, critDamage: 0,
		atkPct: astrogemPct(state, 2001), wpPct: 0, atkFlat: 0, wpFlat: 0, unvalued: [] };
	out.boss += astrogemPct(state, 2003);
	for (const core of state.arkGrid) {
		const id = core.as ?? core.id;
		const info = decodeCore(id), slot = decodeCore(core.id);
		if (!info || !slot || info.attr !== 'chaos') continue;
		const points = simCorePoints(loadout, state, base, core.id);
		for (const line of CHAOS_CORE_LINES[swappedCoreId(id, core.grade ?? slot.grade)] ?? []) {
			if (points < line.points) continue;
			out.damage += line.damage ?? 0; out.critHit += line.critHit ?? 0; out.boss += line.boss ?? 0; out.addDmg += line.addDmg ?? 0;
			out.critRate += line.critRate ?? 0; out.critDamage += line.critDamage ?? 0; out.atkPct += line.atkPct ?? 0; out.wpPct += line.wpPct ?? 0;
			out.atkFlat += line.atkFlat ?? 0; out.wpFlat += line.wpFlat ?? 0;
			if (line.unvalued) out.unvalued.push(line.unvalued);
		}
	}
	out.unvalued.sort();
	return out;
}

/**
 * The Paradise orb's proc (Thunder Charge, Broadwave, Sunlight Fragrance, …: its own skill in the logs, a few percent of
 * the damage) from `base` to `state`: its damage grows with Paradise power as the orb's value does,
 * k × (power / 1M + 2.5). Another orb is another proc the run never had: null (not valued).
 */
export function paradiseFactor(base: SimState, state: SimState): number | null {
	const a = base.paradise, b = state.paradise;
	if (!a || !b) return a === b ? 1 : null;
	if (a.orb !== b.orb) return null;
	const pa = Math.max(0, Number(orbPower(a)) || 0), pb = Math.max(0, Number(orbPower(b)) || 0);
	return orbValue(1, pb) / orbValue(1, pa);
}

/** Paradise orb procs in the logs: skill ids from 170,000,000 (Broadwave 170000706, Thunder Charge 171000907). */
export const isParadiseProc = (skillId: number) => skillId >= 170_000_000 && skillId < 172_000_000;
