/** Explicit parameters from the player's versioned game data; no ability table is bundled here.
 * Rates are fractions: e.g. threshold .8, ratio 1.5, maximum evolution bonus .6. */
export interface CritConversion {
	threshold: number;
	ratio: number;
	maxBonus: number;
}

export function validCritConversion(c: CritConversion): boolean {
	return [c.threshold,c.ratio,c.maxBonus].every(Number.isFinite) && c.threshold >= 0 && c.threshold <= 1 && c.ratio >= 0 && c.maxBonus >= 0;
}

/** Decode the numeric fields of a caller-supplied blocky_thorn ability level (1/10,000 units). */
export function critConversionFromValues(values: unknown): CritConversion | null {
	if (!Array.isArray(values) || values.length < 3 || values.slice(0,3).some(v => typeof v !== 'number')) return null;
	const result = {threshold:values[0]/10000,ratio:values[1]/10000,maxBonus:values[2]/10000};
	return validCritConversion(result) ? result : null;
}

/** Overcap adds to the existing evolution-damage bucket, then saturates at the conversion's limit. */
export function critEvolutionBonus(uncappedCritRate: number, conversion: CritConversion): number {
	return Math.min(conversion.maxBonus,Math.max(0,uncappedCritRate-conversion.threshold)*conversion.ratio);
}
