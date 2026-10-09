import { describe, expect, it } from 'vitest';
import { HONING_COSTS } from './honing-cost-data';
import { SHARDS, honingCost, tapsFor } from './honing-cost';

const free = (tap: ReturnType<typeof tapsFor>) => Object.fromEntries([...Object.keys(tap!.mats), SHARDS].map((id) => [id, 0]));

describe('honing cost', () => {
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
		expect(withShards.expected - base.expected).toBeCloseTo(tap.shards * 0.1 * base.taps, 6);
	});

	it('uses breath only when it lowers the average cost', () => {
		const tap = tapsFor('serca', 'weapon', 20)!;
		const prices = { ...free(tap), [String(tap.breath.id)]: 0 };
		expect(honingCost(tap, { ...prices, ...{ [Object.keys(tap.mats)[0]]: 100 } })!.breath).toBe(true); // free breath helps
		expect(honingCost(tap, { ...prices, [String(tap.breath.id)]: 1e6 })!.breath).toBe(false); // absurdly priced breath doesn't
	});
});
