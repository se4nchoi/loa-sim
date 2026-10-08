import type { Loadout } from './types';

export interface SimSkins {
	/** Total % from weapon, head, chest and pants (0–8). Null when not imported. */
	bonus: number | null;
	/** Player-supplied starting bonus for snapshots missing the stat multipliers. */
	currentBonus: number | null;
	/** Per-piece choices, when explicitly selected. Imported totals need not identify individual grades. */
	parts?: (number | null)[];
}

export function skinParts(skins: SimSkins): (number | null)[] {
	return skins.parts ?? Array.from({ length: 4 }, () => skins.bonus === 8 ? 2 : skins.bonus === 0 ? 0 : null);
}

export function setSkinPart(skins: SimSkins, index: number, bonus: number): SimSkins {
	const parts = [...skinParts(skins)];
	parts[index] = bonus;
	return { ...skins, parts, bonus: parts.every((p) => p !== null) ? parts.reduce<number>((sum, p) => sum + p!, 0) : skins.bonus };
}

/** Cosmetic bonuses to every main stat (e.g. instruments) are shared by the two off-stats.
 * The extra multiplier on the class's main stat is the four main skin slots' bonus.
 * Reading totals also handles legendary skins worn underneath cosmetic overrides.
 */
export function readSkinBonus(l: Loadout, mainStat: number): number | null {
	const multipliers = [3, 4, 5].map((index) => l.stats?.find((s) => s.type === index + 4)?.value);
	if (multipliers.some((v) => v === undefined || !Number.isFinite(v) || v < 10000)) return null;
	const others = multipliers.filter((_, i) => i !== mainStat - 3) as number[];
	if (others[0] !== others[1]) return null;
	const bonus = (multipliers[mainStat - 3]! - others[0]) / 100;
	return bonus >= 0 && bonus <= 8 && Number.isInteger(bonus * 2) ? bonus : null;
}

export function skinStatRatio(skins: SimSkins, base: SimSkins, importedMultiplier?: number): number {
	const from = base.bonus ?? skins.currentBonus;
	const to = skins.bonus ?? from;
	if (from === null || to === null) return 1;
	const multiplier = importedMultiplier && importedMultiplier > 0 ? importedMultiplier : 10000 + from * 100;
	return (multiplier + (to - from) * 100) / multiplier;
}
