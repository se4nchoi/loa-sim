import { describe, expect, it } from 'vitest';
import soulshan from './fixtures/na-soulshan.json';
import brushann from './fixtures/na-brushann.json';
import type { Loadout } from './types';
import { PartType, partHigh } from './cp';
import { qualityStat, readQuality, qualityChance, qualityCost } from './quality';
import { liveUpgrades } from './live-upgrades';
import { applyUpgrade } from './apply-upgrade';
import { initSimState, simulate } from './simulate';
import { supportCombatPower } from './support';
import { maxEquipment } from './sim-max';
import { budgetChanges } from './sim-budget';
const dealer = soulshan as unknown as Loadout, support = brushann as unknown as Loadout;
const hp = (parts: ReturnType<typeof simulate>['parts']) => parts.find((p) => p.type === PartType.BaseHealth)!;

describe('equipment quality', () => {
 it('recovers armor quality from imported Vigor and keeps the baseline unchanged', () => {
  expect(readQuality(support)).toMatchObject({ weapon: 99, head: 99, upper_body: 92, lower_body: 91, hand: 100, shoulder: 99 });
  expect(readQuality(dealer).weapon).toBe(100);
  expect(readQuality(dealer).head).toBe(98);
  const missing = structuredClone(dealer);
  delete missing.items!.find((item) => item.slot === 'head')!.data.stats;
  expect(readQuality(missing).head).toBeUndefined();
  for (const l of [dealer, support]) expect(simulate(l, initSimState(l)).parts).toEqual(l.battlePoint.parts);
  expect(qualityStat('head', 98)).toBe(1345);
  expect(qualityStat('head', 100)).toBe(1400);
 });
 it('changes dealer quality CP without scaling base attack or Weapon Power', () => {
  const base = initSimState(dealer), s = structuredClone(base);
  s.quality.weapon = 50;
  const before = simulate(dealer, base), after = simulate(dealer, s, base);
  expect(partHigh(after.parts.find((p) => p.type === PartType.WeaponQuality)!)).toBe(1500);
  expect(after.parts.find((p) => p.type === PartType.BaseAttack)).toEqual(before.parts.find((p) => p.type === PartType.BaseAttack));
  expect(after.cp / before.cp).toBeCloseTo(1.15 / 1.3, 9);
 });
 it('raises support HP and Shield & Heal Power, leaving Buff Power unchanged', () => {
  const base = initSimState(support), s = structuredClone(base);
  s.quality.upper_body = 100;
  const before = simulate(support, base), after = simulate(support, s, base);
  const expectedGain = 94201 * 2 * (1400 - 1185) / 14000 * 1.29;
  expect(Number(hp(after.parts).maxHp) - Number(hp(before.parts).maxHp)).toBeCloseTo(expectedGain, 8);
  const a = supportCombatPower(before.parts), b = supportCombatPower(after.parts);
  expect(b.buff).toBe(a.buff);
  expect(b.shieldHeal).toBeGreaterThan(a.shieldHeal);
  s.quality.weapon = 0;
  expect(simulate(support, s, base).cp).toBe(after.cp);
 });
 it('combines quality with bracer vitality and karma without multiplying flat karma HP by Vigor', () => {
  const base = initSimState(support), s = structuredClone(base);
  s.quality.upper_body = 100;
  s.bracer = { grade: 'epic', honing: 0 };
  s.karma.evolution = base.karma.evolution! + 1;
  const after = simulate(support, s, base);
  const expectedGain = (94201 * 215 / 14000 * 2 + 900 * 2 * (1 + (6491 + 215) / 14000) + 400) * 1.29;
  expect(Number(hp(after.parts).maxHp) - Number(hp(support.battlePoint.parts).maxHp)).toBeCloseTo(expectedGain, 8);
 });
 it('maxes known qualities and prices Budget with the same unlimited-stone assumption', () => {
  const base = initSimState(support), s = structuredClone(base);
  maxEquipment(s);
  expect(Object.values(s.quality).every((q) => q === 100)).toBe(true);
  const rows = budgetChanges(support, base, s).filter((row) => row.title.includes('quality'));
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.every((row) => row.fixed === qualityCost(row.title.startsWith('Weapon') ? 'weapon' : 'head', 0, 100).gold && !row.status)).toBe(true);
 });
 it('matches published cumulative probabilities and geometric expected tap costs', () => {
  expect(qualityChance(10) * 100).toBeCloseTo(77.10, 2);
  expect(qualityChance(50) * 100).toBeCloseTo(12.85, 2);
  expect(qualityChance(70) * 100).toBeCloseTo(3.27, 2);
  expect(qualityChance(90) * 100).toBeCloseTo(0.86, 2);
  expect(qualityChance(100)).toBeCloseTo(0.00076, 9);
  expect(qualityCost('weapon', 99, 100).gold).toBeCloseTo(800 / 0.00076, 8);
  expect(qualityCost('head', 99, 100).gold).toBeCloseTo(300 / 0.00076, 8);
  expect(qualityCost('head', 92, 95).gold).toBe(qualityCost('head', 94, 95).gold);
 });
 it('offers only scoring quality targets with accurate Apply gains and fixed expected costs', () => {
  for (const l of [dealer, support]) {
   const base = initSimState(l), s = structuredClone(base);
   if (!l.battlePoint.isSupport) s.quality.weapon = 80;
   const upgrades = liveUpgrades(l, s, base).filter((u) => u.category === 'quality');
   expect(upgrades.length).toBeGreaterThan(0);
   for (const u of upgrades) {
    expect(u.subject === 'Weapon').toBe(!l.battlePoint.isSupport);
    const next = structuredClone(s);
    expect(applyUpgrade(l, next, base, u)).toBe(true);
    expect((simulate(l, next, base).cp / simulate(l, s, base).cp - 1) * 100).toBeCloseTo(u.gainPct, 9);
    expect(u.knownCost).toBeGreaterThan(0);
    expect(applyUpgrade(l, next, base, u)).toBe(false);
   }
  }
 });
});
