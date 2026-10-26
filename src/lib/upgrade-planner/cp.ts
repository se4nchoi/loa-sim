import type { BattlePointPart, Loadout } from './types';

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

/**
 * Released Vambraces put flat Basic Attack Power in stat 114. Bible's October 2026 breakdown omits it even though
 * its recorded CP includes it (verified on Soulshann, Shanzkii and Ignishan). Repair only the identifiable old
 * formula; an upstream breakdown that already includes flat attack, or differs for another reason, stays intact.
 */
export function baselineParts(loadout: Loadout): BattlePointPart[] {
	const parts = loadout.battlePoint.parts;
	if (!loadout.items?.some((item) => item.slot === 'bracer' || item.slot === 'vambrace')) return parts;
	const flat = loadout.stats?.find((stat) => stat.type === 114)?.value;
	const attack = parts.find((part) => part.type === PartType.BaseAttack);
	if (!attack || typeof flat !== 'number' || !Number.isFinite(flat) || flat <= 0) return parts;
	const { mainStat, weaponPower, attackPowerMultiplier, baseAttackPower, value } = attack;
	if (typeof mainStat !== 'number' || typeof weaponPower !== 'number' || typeof attackPowerMultiplier !== 'number'
		|| typeof baseAttackPower !== 'number' || typeof value !== 'number' || mainStat <= 0 || weaponPower <= 0) return parts;
	const factor = 1 + attackPowerMultiplier / 100;
	const withoutFlat = Math.sqrt(mainStat * weaponPower / 6) * factor;
	const coefficient = loadout.battlePoint.isSupport ? 1.24 : 2.88;
	if (!Number.isFinite(withoutFlat) || Math.abs(baseAttackPower - withoutFlat) > 0.001
		|| Math.abs(value - withoutFlat * coefficient) > 0.001) return parts;
	const corrected = (Math.sqrt(mainStat * weaponPower / 6) + flat) * factor;
	return parts.map((part) => part === attack ? { ...part, baseAttackPower: corrected, value: corrected * coefficient } : part);
}
