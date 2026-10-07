import { describe, expect, it } from 'vitest';
import { lastReset, rangeOf } from './loa-logs';

const at = (iso: string) => Date.parse(iso);
const WEEK = 7 * 24 * 3600 * 1000;

describe('weekly reset (Wednesday 10:00 UTC)', () => {
	it('is the same Wednesday once 10:00 UTC has passed', () => {
		expect(lastReset(at('2026-10-07T14:15:00Z'))).toBe(at('2026-10-07T10:00:00Z'));
	});
	it('is the previous Wednesday just before 10:00 UTC', () => {
		expect(lastReset(at('2026-10-07T09:59:00Z'))).toBe(at('2026-09-30T10:00:00Z'));
	});
	it('works mid-week', () => {
		expect(lastReset(at('2026-10-05T23:00:00Z'))).toBe(at('2026-09-30T10:00:00Z'));
	});
});

describe('range presets', () => {
	const now = at('2026-10-09T12:00:00Z'); // Friday; reset was Wed 2026-10-07 10:00 UTC
	const reset = at('2026-10-07T10:00:00Z');

	it('this week / last week', () => {
		expect(rangeOf('this-week', now)).toEqual([reset, Infinity]);
		expect(rangeOf('last-week', now)).toEqual([reset - WEEK, reset]);
	});
	it('last N weeks include the current week', () => {
		expect(rangeOf('last-2-weeks', now)).toEqual([reset - WEEK, Infinity]);
		expect(rangeOf('last-3-weeks', now)).toEqual([reset - 2 * WEEK, Infinity]);
	});
	it('this month starts on the 1st (UTC)', () => {
		expect(rangeOf('this-month', now)).toEqual([at('2026-10-01T00:00:00Z'), Infinity]);
	});
});
