import { SIDEREAL_ADVANCED, SIDEREAL_ITEMS, SIDEREAL_STAGES } from './sidereal-data';
import type { Loadout } from './types';

export const SIDEREALS = ['Thirain', 'Wei', 'Nineveh', 'Azena', 'Shandi', 'Balthorr', 'Inanna'] as const;
export type SiderealBond = (typeof SIDEREALS)[number] | 'unknown';
export interface SimSidereal {
	infusion: number;
	evolution: number;
	advanced: number;
	bond: SiderealBond;
	/** Fraction of damage dealt while the buffs are active, rather than wall-clock uptime. */
	bondUptime: number;
	/** User estimates for effects that need fight/rotation data; null means not modeled. */
	bondEstimates: Partial<Record<SiderealBond, number>>;
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
		advanced: typeof item.data.advancedHoning === 'number' ? item.data.advancedHoning : 0,
		bond: 'unknown', bondUptime: 100, bondEstimates: {}
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

export function setSiderealInfusion(s: SimSidereal, infusion: number) {
	s.infusion = infusion;
	s.evolution = Math.max(infusion === 3 ? 7 : infusion > 0 ? 6 : 1, Math.min(s.evolution, siderealMaxEvolution(infusion)));
	s.advanced = infusion === 3 ? 40 : Math.min(s.advanced, siderealMaxAdvanced(infusion));
}

/** Personal DPS against an otherwise identical character without the selected bond.
 * Thirain's buff amounts come from SkillBuff.json in snoww/loa-logs (game facts).
 * Direct-damage and rotation-dependent bonds require a user estimate, never a guessed constant.
 */
export function siderealBondDps(s: SimSidereal, mainStat: number, attackPower: number): number | null {
	if (s.evolution < 6) return 0;
	if (s.bond === 'unknown') return null;
	const entered = s.bondEstimates[s.bond];
	if (entered !== undefined && Number.isFinite(entered)) return Math.max(0, entered);
	if (s.bond === 'Balthorr' || s.bond === 'Inanna') return 0;
	if (s.bond !== 'Thirain' || mainStat <= 0 || attackPower <= 0) return null;
	const stat = [145983, 153282, 257503, 453359][s.infusion];
	const attack = s.evolution >= 8 ? [3946, 4305, 7250, 16450][s.infusion] : 0;
	const active = Math.sqrt((mainStat + stat) / mainStat) * (1 + attack / attackPower) - 1;
	return active * Math.max(0, Math.min(100, s.bondUptime));
}
