import { COMBAT_STAT_BUFFS, KNOWN_STAT_BUFF_IDS } from './combat-stat-buffs';

export interface CombatStatWindow {
	damage: number;
	critDamage: number;
	/** Percentage points on this hit, excluding the engraving stacks assumed from gear. Missing = unresolved. */
	attackPowerPct?: number;
	critDamagePct?: number;
	states: number[];
}
export interface StatWindowHit { damage?: number; crit?: boolean; buffedBy?: number[] }
const known = new Set(KNOWN_STAT_BUFF_IDS);

/** Preserve actual buff intersections without retaining a hit trace or party names. No incomplete trace extrapolation. */
export function combatStatWindows(casts: { hits?: StatWindowHit[] }[] | undefined, damage: number, critDamage: number,
	sourceSkills: Record<number, number> = {}): CombatStatWindow[] | undefined {
	if (!Array.isArray(casts) || !Number.isFinite(damage) || !Number.isFinite(critDamage) || damage <= 0 || critDamage < 0 || critDamage > damage) return undefined;
	const groups = new Map<string, CombatStatWindow>();
	let tracked = 0, trackedCrit = 0;
	for (const cast of casts) {
		if (!cast || cast.hits !== undefined && !Array.isArray(cast.hits)) return undefined;
		for (const hit of cast.hits ?? []) {
			if (!hit || typeof hit !== 'object') return undefined;
			if (!(typeof hit.damage === 'number' && Number.isFinite(hit.damage) && hit.damage >= 0)) return undefined;
			if (!hit.damage) continue;
			if (typeof hit.crit !== 'boolean' || !Array.isArray(hit.buffedBy)) return undefined;
			let ap = 0, cd = 0, apKnown = true, cdKnown = true;
			const states = new Set<number>();
			const resolved = new Set<number>();
			for (const observed of hit.buffedBy) {
				const id = known.has(observed) ? observed : observed >= 1_000_000_000 && sourceSkills[observed] !== undefined
					? observed - 1_000_000_000 - sourceSkills[observed] : NaN;
				if (!known.has(id)) { apKnown = cdKnown = false; continue; }
				if (resolved.has(id)) continue;
				resolved.add(id);
				const effect = COMBAT_STAT_BUFFS[id];
				if (!effect) continue;
				if (effect.state) states.add(id);
				if (effect.fromGear) continue;
				if (effect.ap === null || effect.ap !== 0 && (effect.stacks ?? 1) > 1) apKnown = false;
				else ap += effect.ap;
				if (effect.cd === null || effect.cd !== 0 && (effect.stacks ?? 1) > 1) cdKnown = false;
				else cd += effect.cd;
			}
			const window: CombatStatWindow = { damage: 0, critDamage: 0, ...(apKnown ? { attackPowerPct: ap } : {}), ...(cdKnown ? { critDamagePct: cd } : {}), states: [...states].sort((a,b) => a-b) };
			const key = JSON.stringify([window.attackPowerPct ?? null, window.critDamagePct ?? null, window.states]);
			const group = groups.get(key) ?? window;
			group.damage += hit.damage;
			group.critDamage += hit.crit ? hit.damage : 0;
			groups.set(key, group);
			tracked += hit.damage;
			trackedCrit += hit.crit ? hit.damage : 0;
			if (groups.size > 128) return undefined;
		}
	}
	if (!(damage > 0) || Math.abs(tracked - damage) > 1 || Math.abs(trackedCrit - critDamage) > 1) return undefined;
	return [...groups.values()];
}
