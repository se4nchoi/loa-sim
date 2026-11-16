// Bounded ranges for the "Fun facts" stats: who loads characters, how cheaply CP is bought, and how deep a visit goes.
// Only range keys leave the browser, never names, exact item levels, exact CP or exact gold.
import { LEVEL_BUCKETS, levelBucket } from './plan-stats';

export const POWER_BUCKETS = [
	['under2k', '<2,000'], ['2to3k', '2,000–2,999'], ['3to4k', '3,000–3,999'], ['4to5k', '4,000–4,999'],
	['5to6k', '5,000–5,999'], ['6to7k', '6,000–6,999'], ['over7k', '7,000+']
] as const;
/** Gold for +1% Combat Power, from the applied upgrade's priced cost and its CP gain. */
export const EFFICIENCY_BUCKETS = [
	['free', 'Free'], ['under10k', '<10k'], ['10to25k', '10k–25k'], ['25to50k', '25k–50k'], ['50to100k', '50k–100k'],
	['100to250k', '100k–250k'], ['250kto1m', '250k–1m'], ['over1m', '1m+']
] as const;
export const VISIT_UPGRADE_BUCKETS = [['0', 'None'], ['1', '1'], ['2to4', '2–4'], ['5to9', '5–9'], ['10to24', '10–24'], ['25plus', '25+']] as const;
export const VISIT_CHARACTER_BUCKETS = [['0', 'None'], ['1', '1'], ['2', '2'], ['3to5', '3–5'], ['6plus', '6+']] as const;

export type PowerBucket = typeof POWER_BUCKETS[number][0];
export type EfficiencyBucket = typeof EFFICIENCY_BUCKETS[number][0];
export type VisitUpgrades = typeof VISIT_UPGRADE_BUCKETS[number][0];
export type VisitCharacters = typeof VISIT_CHARACTER_BUCKETS[number][0];
export type LevelBucket = typeof LEVEL_BUCKETS[number][0];

export const isKey = <T extends readonly (readonly [string, string])[]>(list: T, v: unknown): v is T[number][0] =>
	typeof v === 'string' && list.some(([k]) => k === v);

export function lookupLevel(ilvl: unknown): LevelBucket | undefined {
	return typeof ilvl === 'number' && Number.isFinite(ilvl) && ilvl >= 1500 && ilvl <= 2000 ? levelBucket(ilvl) : undefined;
}
export function powerBucket(score: unknown): PowerBucket | undefined {
	if (typeof score !== 'number' || !Number.isFinite(score) || score <= 0 || score > 100_000) return;
	return score < 2000 ? 'under2k' : score < 3000 ? '2to3k' : score < 4000 ? '3to4k' : score < 5000 ? '4to5k'
		: score < 6000 ? '5to6k' : score < 7000 ? '6to7k' : 'over7k';
}
export function efficiencyBucket(gold: number | undefined, gainPct: number): EfficiencyBucket | undefined {
	if (gold === undefined || !Number.isFinite(gold) || gold < 0 || !Number.isFinite(gainPct) || gainPct <= 0) return;
	const per = gold / gainPct;
	return per === 0 ? 'free' : per < 1e4 ? 'under10k' : per < 2.5e4 ? '10to25k' : per < 5e4 ? '25to50k' : per < 1e5 ? '50to100k'
		: per < 2.5e5 ? '100to250k' : per < 1e6 ? '250kto1m' : 'over1m';
}
export const visitUpgrades = (n: number): VisitUpgrades =>
	n <= 0 ? '0' : n === 1 ? '1' : n < 5 ? '2to4' : n < 10 ? '5to9' : n < 25 ? '10to24' : '25plus';
export const visitCharacters = (n: number): VisitCharacters => n <= 0 ? '0' : n === 1 ? '1' : n === 2 ? '2' : n < 6 ? '3to5' : '6plus';
