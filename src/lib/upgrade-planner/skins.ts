import type { Loadout } from './types';

/** Market purchase price for one piece of the selected grade. */
export const skinPriceKey = (index: number, bonus: number) =>
	`skin:${['head', 'chest', 'pants', 'weapon'][index]}:${bonus}`;

export interface SimSkins {
	/** Total % from weapon, head, chest and pants (0–8). Null when not imported. */
	bonus: number | null;
	/** Player-supplied starting bonus for snapshots missing the stat multipliers. */
	currentBonus: number | null;
	/** Per-piece choices, when explicitly selected. Imported totals need not identify individual grades. */
	parts?: (number | null)[];
	/** Corrected baseline slot assignment; changing an assumption isn't a purchase. */
	startingParts?: number[];
}

export function skinParts(skins: SimSkins): (number | null)[] {
	return skins.parts ?? skinCombinations(skins.bonus)[0] ?? [null, null, null, null];
}

/** Exact totals, preferring all slots equipped, then Epic pieces and fewer mixed grades. */
export function skinCombinations(total: number | null): number[][] {
	if (total === null) return [];
	const combinations: number[][] = [];
	for (const head of [1, 2, 0.5, 0]) for (const chest of [1, 2, 0.5, 0])
		for (const pants of [1, 2, 0.5, 0]) for (const weapon of [1, 2, 0.5, 0]) {
			const parts = [head, chest, pants, weapon];
			if (parts.reduce((sum, n) => sum + n, 0) === total) combinations.push(parts);
		}
	const score = (parts: number[]) => parts.filter((p) => p > 0).length * 100 + parts.filter((p) => p === 1).length * 10 - new Set(parts).size;
	return combinations.sort((a, b) => score(b) - score(a) || a.reduce((order, n, i) => order || b[i] - n, 0));
}

/** Move the assumed grades between slots while preserving the imported total. */
export function adjustSkinSetup(skins: SimSkins, index: number, bonus: number): number[] | null {
	const current = skinParts(skins);
	const matches = skinCombinations(skins.bonus).filter((parts) => parts[index] === bonus);
	const changes = (parts: number[]) => parts.reduce((sum, p, i) => sum + Number(p !== current[i]), 0);
	return matches.sort((a, b) => changes(a) - changes(b))[0] ?? null;
}

export const skinGrade = (bonus: number | null) => bonus === 2 ? 'Legendary' : bonus === 1 ? 'Epic' : bonus === 0.5 ? 'Rare' : bonus === 0 ? 'None' : 'Unknown';

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
