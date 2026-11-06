import type { BattlePointPart, Loadout } from './types';
import { HONING_TABLE, AEGIR_HONING_TABLE } from './honing-data';
import { SIDEREAL_ITEMS } from './sidereal-data';
import { readSidereal, siderealWeaponPower } from './sidereal';
import { bracerStats, readBracer } from './bracer';
import { BRACELET_EFFECTS } from './game-data';
import { supportWeaponCoreStats } from './tables';

// Battle point part types, as numbered in lostark.bible's `battlePoint.parts[].type`.
export const PartType = {
	BaseAttack: 1,
	BaseHealth: 2,
	Level: 3,
	WeaponQuality: 4,
	ArkPassiveEvolution: 5,
	ArkPassiveEnlightenment: 6,
	ArkPassiveLeap: 7,
	KarmaEvolutionRank: 8,
	KarmaLeapLevel: 9,
	Engraving: 10,
	EngravingDefense: 11,
	ElixirSet: 12,
	ElixirAttack: 13,
	ElixirDefense: 14,
	AccessoryGrinding: 15,
	AccessoryGrindingDefense: 16,
	AccessoryCombatEffect: 17,
	AccessoryCombatEffectDefense: 18,
	BraceletStatType: 19,
	BraceletEffect: 20,
	BraceletEffectDefense: 21,
	Gem: 22,
	EstherWeapon: 23,
	TranscendenceArmor: 24,
	TranscendenceAdditional: 25,
	CombatStats: 26,
	CardSet: 27,
	PetSpecialty: 28,
	ArkGridCore: 29,
	ArkGridCoreDefense: 30,
	ArkGridGem: 31,
	ArkGridGemDefense: 32,
	ParadiseOrb: 33,
	ParadiseOrbDefense: 34
} as const;

const DEFENSE_TYPES = new Set<number>([
	PartType.BaseHealth,
	PartType.EngravingDefense,
	PartType.ElixirDefense,
	PartType.AccessoryGrindingDefense,
	PartType.AccessoryCombatEffectDefense,
	PartType.BraceletEffectDefense,
	PartType.ArkGridCoreDefense,
	PartType.ArkGridGemDefense,
	PartType.ParadiseOrbDefense
]);

export const isDefensePart = (p: BattlePointPart) => DEFENSE_TYPES.has(p.type);
export const partLow = (p: BattlePointPart): number => p.value ?? p.min ?? 0;
export const partHigh = (p: BattlePointPart): number => p.value ?? p.max ?? 0;

/**
 * Dealer combat power, same as lostark.bible's client:
 * CP = base_attack_point / 1e4 × Π(1 + part / 1e4) over every non-defense part.
 * Ranged parts (pet specialty) produce [min, max]; the in-game score matches max.
 */
export function combatPower(parts: BattlePointPart[]): { min: number; max: number } {
	const base = parts.find((p) => p.type === PartType.BaseAttack);
	if (!base) throw new Error('No base attack point in battlePoint parts');
	let min = partLow(base) / 1e4;
	let max = partHigh(base) / 1e4;
	for (const p of parts) {
		if (p === base || isDefensePart(p)) continue;
		min *= 1 + partLow(p) / 1e4;
		max *= 1 + partHigh(p) / 1e4;
	}
	return { min, max };
}

/** CP multiplier from moving one part's value `from` → `to` (both in battle-point units, 1e4 = +100%). */
export const partRatio = (from: number, to: number) => (1e4 + to) / (1e4 + from);

/** Converts a CP multiplier into a percentage gain, e.g. 1.006 → 0.6. */
export const ratioToPct = (ratio: number) => (ratio - 1) * 100;

/**
 * Base attack battle point: 2.88 × √(mainStat × weaponPower ÷ 6) × (1 + attack% ÷ 100).
 * Matches bible's `baseAttackPower × 2.88` exactly.
 */
export const baseAttackPoint = (mainStat: number, weaponPower: number, attackPct: number, attackFlat = 0) =>
	2.88 * (Math.sqrt((mainStat * weaponPower) / 6) + attackFlat) * (1 + attackPct / 100);

export const MAIN_STAT_INDICES = [3, 4, 5];

/** Which of Str (3) / Dex (4) / Int (5) is this character's main stat. */
export function mainStatIndex(l: Loadout): number {
	const base = l.battlePoint?.parts?.find((p) => p.type === PartType.BaseAttack);
	const main = base?.mainStat as number | undefined;
	const stats = l.stats ?? [];
	const match = stats.find((s) => MAIN_STAT_INDICES.includes(s.type) && s.value === main);
	if (match) return match.type;
	const valueOf = (i: number) => stats.find((s) => s.type === i)?.value ?? 0;
	return MAIN_STAT_INDICES.reduce((best, i) => (valueOf(i) > valueOf(best) ? i : best));
}

/**
 * Sums permanent unscaled Weapon Power across equipped weapon, bracer, accessories, bracelet,
 * and Ark Grid weapon cores. Used to detect temporary consumable buffs (Stronghold Feast).
 */
export function permanentUnscaledWeaponPower(l: Loadout): number {
	let wp = 0;
	const weapon = l.items?.find((i) => i.slot === 'weapon');
	if (weapon) {
		const sidereal = SIDEREAL_ITEMS[weapon.id];
		if (sidereal) {
			const stage = readSidereal(l);
			if (!stage) return NaN;
			wp += siderealWeaponPower(stage);
		} else {
			const prefix = Math.floor(weapon.id / 1000);
			const isSerca = prefix === 134621;
			if (!isSerca && prefix !== 134611 && prefix !== 134613) return NaN;
			const table = (isSerca ? HONING_TABLE : AEGIR_HONING_TABLE).weapon;
			const h = weapon.data.honing;
			const rawAdvanced = weapon.data.advancedHoning;
			const adv = isSerca ? 40 : typeof rawAdvanced === 'number' ? rawAdvanced : 0;
			if (typeof h !== 'number' || !Number.isInteger(h) || !Number.isInteger(adv)
				|| table.honing[h] === undefined || table.advanced[adv] === undefined) return NaN;
			// Serca's baked absolute weapon stat already includes its inherited advanced honing.
			wp += table.honing[h] + (isSerca ? 0 : table.advanced[adv]);
		}
	}

	// Bracer / Vambrace
	wp += bracerStats(readBracer(l)).weaponPower;

	// Accessories
	for (const item of l.items ?? []) {
		if (item.slot === 'neck' || item.slot.startsWith('ear') || item.slot.startsWith('finger')) {
			for (const s of item.data?.stats ?? []) {
				if (s.type === 2 && s.index === 151) wp += s.value;
			}
		}
	}

	// Bracelet
	const bracelet = l.items?.find((i) => i.slot === 'bracelet');
	if (bracelet) {
		for (const s of bracelet.data?.stats ?? []) {
			if (s.type === 2 && s.index === 151) wp += s.value;
			else if (s.type === 3 || s.type === 4) {
				const m = BRACELET_EFFECTS.find((e) => e.key === `${s.type}:${s.index}`)?.text.match(/^Weapon Power \+([\d,]+)/);
				if (m) wp += Number(m[1].replaceAll(',', ''));
			}
		}
	}

	// Ark Grid Weapon Cores
	for (const core of l.arkGridCores ?? []) {
		const recordedPoints = l.battlePoint?.parts?.find((p) => p.id === core.id)?.points;
		const pts = typeof recordedPoints === 'number' ? recordedPoints
			: core.gems?.reduce((s, g) => s + g.corePoints, 0) ?? 0;
		wp += supportWeaponCoreStats(core.id, pts).flat;
	}

	return wp;
}

/**
 * Bible's breakdown constructs BaseAttack from live combat stats, which includes active temporary consumables
 * (Combat Food main stat in stat 11, and Stronghold Weapon Power Feast in stat 151), while omitting released
 * Vambraces flat Basic Attack Power (stat 114). The in-game combatPower score, however, ignores food and feast
 * while including flat Vambraces attack.
 *
 * Normalize the snapshot parts to the clean food-less, feast-less baseline with Vambraces flat attack,
 * matching in-game combatPower.score.
 */
export function baselineParts(loadout: Loadout): BattlePointPart[] {
	const parts = loadout.battlePoint.parts;
	const attack = parts?.find((part) => part.type === PartType.BaseAttack);
	if (!attack) return parts;
	const { mainStat, weaponPower, attackPowerMultiplier, baseAttackPower, value } = attack;
	if (typeof mainStat !== 'number' || typeof weaponPower !== 'number' || typeof attackPowerMultiplier !== 'number'
		|| typeof baseAttackPower !== 'number' || typeof value !== 'number' || mainStat <= 0 || weaponPower <= 0) return parts;
	const factor = 1 + attackPowerMultiplier / 100;
	const withoutFlat = Math.sqrt(mainStat * weaponPower / 6) * factor;
	const coefficient = loadout.battlePoint.isSupport ? 1.24 : 2.88;
	if (!Number.isFinite(withoutFlat) || Math.abs(baseAttackPower - withoutFlat) > 0.001
		|| Math.abs(value - withoutFlat * coefficient) > 0.001) return parts;

	let flat = 0;
	if (loadout.items?.some((item) => item.slot === 'bracer' || item.slot === 'vambrace')) {
		const rawFlat = loadout.stats?.find((stat) => stat.type === 114)?.value;
		if (typeof rawFlat === 'number' && Number.isFinite(rawFlat) && rawFlat > 0) {
			flat = rawFlat;
		}
	}

	let foodMain = 0;
	const stat11 = loadout.stats?.find((s) => s.type === 11)?.value;
	if (typeof stat11 === 'number' && stat11 > 0) {
		const bracelet = loadout.items?.find((i) => i.slot === 'bracelet');
		const bracelet11 = bracelet?.data?.stats?.find((s) => s.type === 2 && s.index === 11)?.value ?? 0;
		const foodStat = Math.max(0, stat11 - bracelet11);
		if (foodStat > 0) {
			const msIndex = mainStatIndex(loadout);
			const currentMs = loadout.stats?.find((s) => s.type === msIndex)?.value;
			if (currentMs === mainStat) {
				const msMult = loadout.stats?.find((s) => s.type === msIndex + 4)?.value ?? 10000;
				foodMain = Math.round((foodStat * msMult) / 10000);
			}
		}
	}

	let feastWp = 0;
	const stat151 = loadout.stats?.find((s) => s.type === 151)?.value;
	const stat152 = loadout.stats?.find((s) => s.type === 152)?.value;
	if (typeof stat151 === 'number' && typeof stat152 === 'number' && stat152 >= 10000
		&& stat151 === weaponPower && loadout.items?.some((i) => i.slot === 'weapon')) {
		const wpMult = stat152 / 10000;
		const permUnscaled = permanentUnscaledWeaponPower(loadout);
		const unscaledDiff = Math.round(weaponPower / wpMult) - permUnscaled;
		if (unscaledDiff >= 350) {
			const feastUnscaled = Math.round(unscaledDiff / 400) * 400;
			feastWp = Math.round(feastUnscaled * wpMult);
		}
	}

	if (flat === 0 && foodMain === 0 && feastWp === 0) return parts;

	const cleanMainStat = Math.max(1, mainStat - foodMain);
	const cleanWeaponPower = Math.max(1, weaponPower - feastWp);
	const corrected = (Math.sqrt((cleanMainStat * cleanWeaponPower) / 6) + flat) * factor;
	return parts.map((part) =>
		part === attack
			? {
					...part,
					mainStat: cleanMainStat,
					weaponPower: cleanWeaponPower,
					baseAttackPower: corrected,
					value: corrected * coefficient
				}
			: part
	);
}
