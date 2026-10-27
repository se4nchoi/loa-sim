import { describe, expect, it } from 'vitest';
import { evolutionValue } from './evolution-value';

const nodes = [{id: 1040100, lv: 2}];
const pair = (actual: number, maximum: number) => ({damageDoneByStat: actual, damageDoneByStatPlusValue: maximum});
describe('Evolution value from passive efficiency', () => {
	it('uses maximum BONUS contribution, even when the conversion is not at its cap', () => {
		const split = {damageDoneWithoutUltimateAwakening: 1000, bluntThornEfficiency: pair(75, 300)};
		expect(evolutionValue(split, nodes, 1000)).toBe(.5);
		// A zero actual bonus does not mean the Evolution bucket is unknown.
		expect(evolutionValue({...split, bluntThornEfficiency: pair(0, 300)}, nodes, 1000)).toBe(.5);
	});
	it('reconstructs damage-weighted marginals across different evolution windows', () => {
		const damage = [100, 300], evolution = [50, 200], cap = 45;
		const maximum = damage.reduce((sum, d, i) => sum + d * cap / (100 + evolution[i]), 0);
		const split = {damageDoneWithoutUltimateAwakening: 400, bluntThornEfficiency: pair(1, maximum)};
		expect(evolutionValue(split, [{id: 1040100, lv: 1}], 400)).toBeCloseTo((100 / 150 + 300 / 300) / 400 * 100, 12);
	});
	it('also supports Supersonic and refuses contradictory records', () => {
		const split = {damageDoneWithoutUltimateAwakening: 1000, supersonicBreakthroughEfficiency: pair(50, 120), bluntThornEfficiency: pair(100, 300)};
		expect(evolutionValue(split, [{id: 1040200, lv: 2}], 1000)).toBe(.5);
		expect(evolutionValue(split, [...nodes, {id: 1040200, lv: 2}], 1000)).toBe(.5);
		expect(evolutionValue({...split, bluntThornEfficiency: pair(100, 400)}, [...nodes, {id: 1040200, lv: 2}], 1000)).toBeUndefined();
	});
	it('requires the matching ordinary-damage denominator, selected node and valid record', () => {
		const split = {damageDoneWithoutUltimateAwakening: 1000, bluntThornEfficiency: pair(100, 300)};
		for (const damage of [0, 500, 1500, NaN]) expect(evolutionValue(split, nodes, damage)).toBeUndefined();
		for (const selected of [undefined, [], [{id: 1040100, lv: 3}]]) expect(evolutionValue(split, selected, 1000)).toBeUndefined();
		for (const value of [pair(-1, 300), pair(400, 300), pair(0, 0), pair(0, NaN), pair(0, 1000)])
			expect(evolutionValue({...split, bluntThornEfficiency: value}, nodes, 1000)).toBeUndefined();
		expect(evolutionValue({...split, damageDoneWithoutUltimateAwakening: NaN}, nodes, 1000)).toBeUndefined();
	});
});
