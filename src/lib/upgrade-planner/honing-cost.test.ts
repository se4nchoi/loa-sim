import { describe, expect, it } from 'vitest';
import { HONING_COSTS } from './honing-cost-data';
import { SHARDS, autoHoningCosts, honingCost, tapsFor } from './honing-cost';
import { BRACER_TAPS } from './bracer-cost-data';

const free = (tap: ReturnType<typeof tapsFor>) => Object.fromEntries([...Object.keys(tap!.mats), SHARDS].map((id) => [id, 0]));

describe('honing cost', () => {
	it('breaks down bound usage and market buys across outcomes, including one-time shards', () => {
		const tap = { ...tapsFor('serca', 'head', 1)!, growth: 10, shards: 2, mats: { 'test-material': 10 }, gold: 100, success: 5000, failBonus: 0, failMax: 0, meterPerFail: 10000, breath: { id: 0, rate: 0, max: 0 } };
		const c = honingCost(tap, { 'test-material': 3, shards: 2 }, { 'test-material': 15, shards: 13 });
		const average = c.breakdown!.average;
		const pity = c.breakdown!.pity;
		expect(average.materials.find((m) => m.id === 'test-material')).toMatchObject({ bound: 12.5, bought: 2.5, price: 3, gold: 7.5 });
		expect(average.materials.find((m) => m.id === 'shards')).toMatchObject({ bound: 12.5, bought: 0.5, gold: 1 });
		expect(pity.materials.find((m) => m.id === 'test-material')).toMatchObject({ bound: 15, bought: 5, gold: 15 });
		expect(pity.materials.find((m) => m.id === 'shards')).toMatchObject({ bound: 13, bought: 1, gold: 2 });
		expect(average.tapGold + average.materials.reduce((n, m) => n + m.gold, 0)).toBe(c.expected);
		expect(pity.tapGold + pity.materials.reduce((n, m) => n + m.gold, 0)).toBe(c.worst);
	});
	it('includes only the selected breaths and accounts for plenty of bound materials', () => {
		const tap = BRACER_TAPS[0];
		const owned = Object.fromEntries([...Object.keys(tap.mats), SHARDS, String(tap.breath.id), String(tap.moreBreath!.id)].map((id) => [id, 1e12]));
		const c = honingCost(tap, {}, owned);
		for (const view of [c.breakdown!.average, c.breakdown!.pity]) {
			expect(view.materials.find((m) => m.id === String(tap.breath.id))!.bound).toBeGreaterThan(0);
			expect(view.materials.find((m) => m.id === String(tap.moreBreath!.id))!.bound).toBeGreaterThan(0);
			expect(view.materials.every((m) => m.bought === 0 && m.gold === 0)).toBe(true);
		}
		const without = honingCost(tap, { [String(tap.breath.id)]: 1e9, [String(tap.moreBreath!.id)]: 1e9 });
		expect(without.breakdown!.average.materials.some((m) => m.id === String(tap.breath.id) || m.id === String(tap.moreBreath!.id))).toBe(false);
	});
	it('has 25 steps for weapon and armor in both sets', () => {
		for (const set of Object.values(HONING_COSTS)) for (const steps of Object.values(set)) expect(steps).toHaveLength(25);
	});

	it('a 100% tap costs exactly one tap', () => {
		const tap = { ...tapsFor('serca', 'weapon', 1)!, success: 10000 };
		const c = honingCost(tap, free(tap))!;
		expect(c.taps).toBe(1);
		expect(c.expected).toBe(tap.gold);
	});

	it('+25 (0.5%, growing to 1%) is forced by artisan’s energy after a couple hundred taps', () => {
		const tap = tapsFor('serca', 'weapon', 25)!;
		const c = honingCost(tap, { ...free(tap), [String(tap.breath.id)]: 1e9 })!; // no breath
		expect(c.breath).toBe(false);
		expect(c.maxTaps).toBeGreaterThan(200);
		expect(c.maxTaps).toBeLessThan(240);
		expect(c.taps).toBeLessThan(c.maxTaps);
		expect(c.worst).toBe(tap.gold * c.maxTaps);
	});

	it('prices materials and shards per unit; unpriced ones cost nothing', () => {
		const tap = tapsFor('serca', 'head', 10)!;
		expect(honingCost(tap, {}).expected).toBeCloseTo(honingCost(tap, free(tap)).expected, 6);
		const prices = { ...free(tap), [SHARDS]: 0.1 };
		const base = honingCost(tap, free(tap))!;
		const withShards = honingCost(tap, prices)!;
		expect(withShards.expected - base.expected).toBeCloseTo((tap.growth + tap.shards * base.taps) * 0.1, 6); // one-time growth + per tap
	});

	it('uses breath only when it lowers the average cost', () => {
		const tap = tapsFor('serca', 'weapon', 20)!;
		const prices = { ...free(tap), [String(tap.breath.id)]: 0 };
		expect(honingCost(tap, { ...prices, ...{ [Object.keys(tap.mats)[0]]: 100 } })!.breath).toBe(true); // free breath helps
		expect(honingCost(tap, { ...prices, [String(tap.breath.id)]: 1e6 })!.breath).toBe(false); // absurdly priced breath doesn't
	});

	it('uses owned materials first and buys the rest', () => {
		const tap = { ...tapsFor('serca', 'head', 1)!, success: 10000 }; // one certain tap
		const [id, n] = Object.entries(tap.mats)[0];
		const prices = { [id]: 10 };
		const breathOff = { [String(tap.breath.id)]: 1e9 };
		expect(honingCost(tap, { ...prices, ...breathOff }).expected).toBe(tap.gold + n * 10);
		expect(honingCost(tap, { ...prices, ...breathOff }, { [id]: n - 2 }).expected).toBe(tap.gold + 2 * 10);
		expect(honingCost(tap, { ...prices, ...breathOff }, { [id]: 1e12 }).expected).toBe(tap.gold);
	});

	it('owned materials cover the early taps of a long step, so the worst case costs more per tap later', () => {
		const tap = tapsFor('serca', 'weapon', 20)!;
		const prices = { ...Object.fromEntries(Object.keys(tap.mats).map((id) => [id, 1])), [String(tap.breath.id)]: 1e9 };
		const none = honingCost(tap, prices);
		const some = honingCost(tap, prices, Object.fromEntries(Object.entries(tap.mats).map(([id, n]) => [id, n * 5])));
		expect(some.expected).toBeLessThan(none.expected);
		expect(none.worst - some.worst).toBeCloseTo(Object.values(tap.mats).reduce((a, n) => a + n * 5, 0), 6);
	});

	it('counts the one-time growth shards once, not per tap', () => {
		const tap = tapsFor('serca', 'weapon', 1)!;
		expect(tap.growth).toBe(35000); // cumulative exp 35,000 at +1
		expect(tapsFor('serca', 'weapon', 2)!.growth).toBe(35000); // 70,000 − 35,000
		const certain = { ...tap, success: 10000 };
		const c = honingCost(certain, { [SHARDS]: 1, [String(tap.breath.id)]: 1e9 });
		expect(c.expected).toBe(certain.gold + certain.growth + certain.shards);
	});

	it('prices bracer honing steps from the KR table, but not the free first bracer or limit breaks', () => {
		expect(BRACER_TAPS).toHaveLength(25);
		const costs = autoHoningCosts(['bracer:epic:0', 'bracer:epic:5', 'bracer:legendary:10', 'bracer:legendary:11', 'bracer:ancient:25'], {}, {});
		expect(Object.keys(costs).sort()).toEqual(['bracer:ancient:25', 'bracer:epic:5', 'bracer:legendary:11']);
		expect(costs['bracer:epic:5'].taps).toBeGreaterThan(1);
		expect(costs['bracer:epic:5'].breathLabel).toBe("Lava's Breath + Glacier's Breath"); // free breath: both used
		expect(costs['bracer:ancient:25'].maxTaps).toBeGreaterThan(costs['bracer:epic:5'].maxTaps);
	});

	it('bracer breath: each type adds up to half the base chance, both double it', () => {
		const tap = BRACER_TAPS[0];
		expect(tap.breath.rate * tap.breath.max).toBe(tap.success / 2);
		expect(tap.moreBreath!.rate * tap.moreBreath!.max).toBe(tap.success / 2);
		const priced = { [String(tap.breath.id)]: 1e9 }; // Lava's priced out, Glacier's free
		const c = honingCost(tap, priced);
		expect(c.breathLabel).toBe("Glacier's Breath");
	});
});
