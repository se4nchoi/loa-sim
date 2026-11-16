import { describe, expect, it } from 'vitest';
import { efficiencyBucket, lookupLevel, powerBucket, visitCharacters, visitUpgrades } from './fun-stats';

describe('fun-stats ranges', () => {
	it('buckets item level and CP, rejecting implausible values', () => {
		expect(lookupLevel(1765)).toBe('1760to1789');
		expect(lookupLevel(42)).toBeUndefined();
		expect(lookupLevel(undefined)).toBeUndefined();
		expect(powerBucket(6253.87)).toBe('6to7k');
		expect(powerBucket(1999)).toBe('under2k');
		expect(powerBucket(25661221)).toBeUndefined();
	});
	it('buckets gold per +1% CP only for a priced, positive gain', () => {
		expect(efficiencyBucket(0, 1)).toBe('free');
		expect(efficiencyBucket(30_000, 2)).toBe('10to25k');
		expect(efficiencyBucket(2e6, 1)).toBe('over1m');
		expect(efficiencyBucket(undefined, 1)).toBeUndefined();
		expect(efficiencyBucket(100, 0)).toBeUndefined();
	});
	it('buckets visit depth', () => {
		expect([0, 1, 3, 7, 12, 40].map(visitUpgrades)).toEqual(['0', '1', '2to4', '5to9', '10to24', '25plus']);
		expect([0, 1, 2, 4, 9].map(visitCharacters)).toEqual(['0', '1', '2', '3to5', '6plus']);
	});
});
