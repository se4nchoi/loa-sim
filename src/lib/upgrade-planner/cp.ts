import type { BattlePointPart } from './types';

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
export const partLow = (p: BattlePointPart) => ('value' in p ? p.value : p.min);
export const partHigh = (p: BattlePointPart) => ('value' in p ? p.value : p.max);

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
export const baseAttackPoint = (mainStat: number, weaponPower: number, attackPct: number) =>
	2.88 * Math.sqrt((mainStat * weaponPower) / 6) * (1 + attackPct / 100);
