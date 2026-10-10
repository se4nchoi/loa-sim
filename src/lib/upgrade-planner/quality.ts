import { PartType } from './cp';
import { HONING_SLOTS, type HoningSlot } from './honing-data';
import { QUALITY_CURVES } from './quality-data';
import type { Loadout } from './types';

export type SimQuality = Partial<Record<HoningSlot, number>>;
// Per-band roll weights, uniform within each band; match Smilegate's published cumulative probabilities.
// https://lostark.game.onstove.com/News/Notice/Views/1301
// In-game measurements: https://www.inven.co.kr/board/lostark/4821/78633
const QUALITY_BANDS = [25.19, 21.41, 17.63, 13.86, 10.07, 6.30, 2.52, 1.26, 1.00, 0.76];
export function qualityChance(target: number): number {
 const to = Math.ceil(target);
 if (to <= 0) return 1;
 if (to > 100) return 0;
 let chance = 0;
 for (let q = to; q <= 100; q++) {
  const band = q <= 10 ? 0 : Math.floor((q - 1) / 10);
  chance += QUALITY_BANDS[band] / (band === 0 ? 11 : 10) / 100;
 }
 return chance;
}
/** Stop on any roll at or above target; intermediate upgrades do not change the target probability. */
export function qualityCost(slot: HoningSlot, from: number, target: number) {
 const chance = qualityChance(target), fee = slot === 'weapon' ? 800 : 300;
 const taps = target <= from ? 0 : 1 / chance;
 return { chance, fee, taps, gold: fee * taps };
}
const clamp = (quality: number) => Math.min(100, Math.max(0, Math.round(quality)));
/** Game quality curves; armor's Vigor rounds up, weapon Additional Damage rounds down. */
export function qualityStat(slot: HoningSlot, quality: number): number {
 const curve = QUALITY_CURVES[slot === 'weapon' ? 'weapon' : 'armor'];
 const value = curve.max - curve.deviation + curve.deviation * (clamp(quality) / 100) ** curve.exponent;
 return slot === 'weapon' ? Math.floor(value + 1e-9) : Math.ceil(value - 1e-9);
}
export function readQuality(loadout: Loadout): SimQuality {
 const quality: SimQuality = {};
 for (const slot of HONING_SLOTS) {
  const item = loadout.items?.find((item) => item.slot === slot);
  if (!item) continue;
  const explicit = slot === 'weapon' ? loadout.battlePoint.parts.find((p) => p.type === PartType.WeaponQuality)?.quality : item.data.quality;
  if (typeof explicit === 'number' && explicit >= 0 && explicit <= 100) { quality[slot] = clamp(explicit); continue; }
  const stat = item.data.stats?.find((s) => s.type === 2 && s.index === (slot === 'weapon' ? 50 : 137) && s.base)?.value;
  if (stat === undefined) continue;
  const matches = Array.from({ length: 101 }, (_, q) => q).filter((q) => qualityStat(slot, q) === stat);
  if (matches.length === 1) quality[slot] = matches[0];
 }
 return quality;
}
