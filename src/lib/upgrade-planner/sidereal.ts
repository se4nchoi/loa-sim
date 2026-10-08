import { SIDEREAL_ADVANCED, SIDEREAL_BATTLE_POINTS, SIDEREAL_ITEMS, SIDEREAL_STAGES } from './sidereal-data';
import type { Loadout } from './types';

export interface SimSidereal {
	infusion: number;
	evolution: number;
	advanced: number;
}

export const siderealMaxEvolution = (infusion: number) => Math.max(...Object.keys(SIDEREAL_STAGES[infusion] ?? {}).map(Number));
export const siderealMaxAdvanced = (infusion: number) => infusion >= 2 ? 40 : 20;

export function readSidereal(l: Loadout): SimSidereal | null {
	const item = l.items?.find((i) => i.slot === 'weapon');
	const weapon = item && SIDEREAL_ITEMS[item.id];
	const evolution = item?.data.honing;
	if (!weapon || typeof evolution !== 'number' || !SIDEREAL_STAGES[weapon.infusion]?.[evolution]) return null;
	return {
		infusion: weapon.infusion, evolution,
		advanced: typeof item.data.advancedHoning === 'number' ? item.data.advancedHoning : 0
	};
}

export function siderealItemLevel(s: SimSidereal): number {
	// Elgic III folds the previous 40 advanced levels into its progression, while the
	// snapshot still carries advancedHoning: 40 (verified against Mira's +8 = 1775).
	return SIDEREAL_STAGES[s.infusion][s.evolution].ilvl + (s.infusion === 3 ? 0 : s.advanced);
}

export function siderealWeaponPower(s: SimSidereal): number {
	const base = SIDEREAL_STAGES[s.infusion][s.evolution].weaponPower;
	if (s.infusion === 3) return base;
	const advanced = SIDEREAL_ADVANCED[s.infusion >= 2 ? 1 : 0][s.advanced] ?? 0;
	return base + advanced;
}

/** The weapon's own battle points (part 23): by Elgic level, stepping up at +6 and +8; none without Elgic. */
export function siderealBattlePoints(s: SimSidereal): number {
	const steps = Object.entries(SIDEREAL_BATTLE_POINTS[s.infusion] ?? {})
		.map(([evolution, value]) => [Number(evolution), value] as const)
		.filter(([evolution]) => s.evolution >= evolution);
	return steps.length ? Math.max(...steps.map(([, v]) => v)) : 0;
}

export function setSiderealInfusion(s: SimSidereal, infusion: number) {
	s.infusion = infusion;
	s.evolution = Math.max(infusion === 3 ? 7 : infusion > 0 ? 6 : 1, Math.min(s.evolution, siderealMaxEvolution(infusion)));
	s.advanced = infusion === 3 ? 40 : Math.min(s.advanced, siderealMaxAdvanced(infusion));
}
