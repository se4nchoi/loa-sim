import { describe, expect, it } from 'vitest';
import { decodeLoadoutSnapshot } from '$lib/loadout-snapshot';
import { clearState } from './clear-state';
import { gearDamageContext } from './gear-damage-context';
import { gearStatProjection, ZERO_DELTA } from './dps-stat-engine';
import type { Loadout } from './types';
import soulshan from './fixtures/na-soulshan.json';
import recorded from './fixtures/gear-context-soulshan.json';
import { engravingDamageStats } from './engraving-damage-stats';
import type { RunSkill } from '$lib/logs/protocol';
import { evolutionValue } from '$lib/logs/evolution-value';

const loadout = soulshan as unknown as Loadout;
const snapshot = () => decodeLoadoutSnapshot(structuredClone(recorded.snapshot));
const run = () => ({ arkPassives: structuredClone(recorded.passives) });
const derive = (snap = snapshot(), r = run(), l = loadout) => gearDamageContext(l, clearState(l, snap).state, r, snap);

describe('gear-derived damage buckets', () => {
	it('recovers the real run’s Evolution marginal without its measured stat values', () => {
		const damage = recorded.skills.filter(s => s.id < 170_000_000).reduce((sum, s) => sum + s.damage, 0);
		const value = evolutionValue(recorded.evolutionRecord, recorded.passives.evolution, damage)!;
		expect(value).toBeCloseTo(recorded.source.evolutionDamagePerPoint, 6);
	});
	it('reconstructs Atk. Power from actual gear stats and complete recorded buff intersections', () => {
		const snap = snapshot(), r = {...run(), skills: structuredClone(recorded.skills) as RunSkill[]};
		const result = gearDamageContext(loadout, clearState(loadout, snap).state, r, snap);
		const ordinary = r.skills.filter(s => !s.hyper && s.id < 170_000_000 && s.damage > 0);
		expect(ordinary.every(s => result.skills[s.id])).toBe(true);
		const predicted = ordinary.reduce((sum, s) => sum + s.damage * result.skills[s.id].attackPowerPct * 100, 0) / ordinary.reduce((sum, s) => sum + s.damage, 0);
		expect(Math.abs(predicted / recorded.source.attackPowerPctPerPoint - 1)).toBeLessThan(.003);
		const broken = structuredClone(r); delete broken.skills[0].statWindows;
		expect(gearDamageContext(loadout, clearState(loadout, snap).state, broken, snap).skills[broken.skills[0].id]).toBeUndefined();
		const roll = structuredClone(snap);
		roll.items!.find(i => i.slot === 'neck')!.data.stats!.push({type: 2, index: 49, value: 42});
		expect(gearDamageContext(loadout, clearState(loadout, roll).state, r, roll).skills).toEqual({});
	});
	it('uses engraving stat amounts instead of flattened CP multipliers', () => {
		const baseline = clearState(loadout, snapshot()).state;
		const stats = engravingDamageStats(baseline);
		expect(stats.attackPowerPct).toBeCloseTo(.9 * 6, 8); // Adrenaline's actual full-stack AP, independent of its crit/CP value.
		expect(stats.critDamage).toBe(52); // Keen Blunt Weapon, relic books with no stone bonus.
		baseline.engravings[999999] = {books: 0, stone: 0};
		expect(engravingDamageStats(baseline).attackPowerPct).toBeNull();
	});
	it('only projects Evolution with conversion and other variable damage buckets unchanged', () => {
		const d = {...ZERO_DELTA, evolutionDamage: 2, additionalDamage: 1};
		const p = gearStatProjection(d, {evolutionDamage: 100, additionalDamage: 50});
		expect(p.factor).toBeCloseTo(202 / 200 * 151 / 150, 12);
		expect(p.remaining).toMatchObject({evolutionDamage: 0, additionalDamage: 0});
		for (const change of [{critRate: 1}, {critDamage: 1}, {baseAttackFlat: 100}, {weaponPower: 1000}])
			expect(gearStatProjection({...d, ...change}, {evolutionDamage: 100}).evolution).toBe(false);
	});
	it('reconstructs an actual matching snapshot and agrees with its measured Additional Damage marginal', () => {
		const context = derive();
		expect(context.totals.additionalDamage).toBeCloseTo(48.88, 8);
		const projection = gearStatProjection({ ...ZERO_DELTA, additionalDamage: 1 }, context.totals);
		const predicted = (projection.factor - 1) * 100;
		expect(Math.abs(predicted / recorded.source.additionalDamagePerPoint - 1)).toBeLessThan(.002);
		expect(context.totals.supportAttack).toBeUndefined();
		expect(context.totals.critRate).toBeUndefined();
		expect(context.totals.evolutionDamage).toBeUndefined();
	});
	it('counts Master only when taken, at its explicit full-stack assumption', () => {
		const snap = snapshot(), r = run();
		snap.arkPassive!.evolution = snap.arkPassive!.evolution.filter(n => n.id !== 1032200);
		r.arkPassives!.evolution = r.arkPassives!.evolution.filter(n => n.id !== 1032200);
		const context = derive(snap, r);
		expect(context.totals.additionalDamage).toBeCloseTo(48.88 - 8.5, 8);
		expect(context.assumptions).not.toContain('Master at 5 stacks');
	});
	it('reads the actual equipped card set rather than assuming Light of Salvation', () => {
		const snap = snapshot();
		snap.cards = [3200016, 3200015, 3200035, 3200095, 3200104, 3200094].map(id => ({ id, level: 5 }));
		expect(derive(snap).totals.additionalDamage).toBeCloseTo(48.88 + 12, 8); // Deep Dive 30.
	});
	it('rejects a snapshot from another build, missing inputs and unknown passive levels', () => {
		const mismatch = run(); mismatch.arkPassives!.evolution[0].lv++;
		expect(derive(snapshot(), mismatch).totals.additionalDamage).toBeUndefined();
		const missingCards = snapshot(); delete missingCards.cards;
		expect(derive(missingCards).totals.additionalDamage).toBeUndefined();
		const incomplete = snapshot(); incomplete.items = incomplete.items!.filter(i => i.slot !== 'neck');
		expect(derive(incomplete).totals.additionalDamage).toBeUndefined();
		const unknown = run(); unknown.arkPassives!.leap.push({ id: 999999, lv: 1 });
		expect(derive(snapshot(), unknown).totals.additionalDamage).toBeUndefined();
		const noPet = structuredClone(loadout); noPet.battlePoint.parts = noPet.battlePoint.parts.filter(p => p.type !== 28);
		expect(derive(snapshot(), run(), noPet).totals.additionalDamage).toBeUndefined();
		const missingGrid = snapshot(); missingGrid.arkGridCores = [];
		expect(derive(missingGrid).totals.additionalDamage).toBeUndefined();
		const unknownRoll = snapshot();
		unknownRoll.items!.find(i => i.slot === 'neck')!.data.stats!.find(s => s.type === 2 && s.index === 50)!.value = 42;
		expect(derive(unknownRoll).totals.additionalDamage).toBeUndefined();
	});
	it('projects only known buckets and leaves attack/crit edits for their own model', () => {
		const delta = { ...ZERO_DELTA, additionalDamage: 2, weaponPower: 1000, critRate: 1 };
		const p = gearStatProjection(delta, { additionalDamage: 50 });
		expect(p.factor).toBeCloseTo(152 / 150, 10);
		expect(p.remaining).toEqual({ ...delta, additionalDamage: 0 });
		expect(gearStatProjection(delta, {}).remaining).toEqual(delta);
		expect(delta.additionalDamage).toBe(2);
	});
	it.each([NaN, Infinity, -1, 1001])('does not turn invalid totals into a gear gain: %s', additionalDamage => {
		expect(gearStatProjection({ ...ZERO_DELTA, additionalDamage: 1 }, { additionalDamage }).used).toBe(false);
	});
});
