import { describe, expect, it } from 'vitest';
import { classColor } from './class-colors';

describe('class colours', () => {
	it("use LOA Logs' defaults by bible class id", () => {
		expect(classColor('soul_eater')).toBe('#c16ed0');
		expect(classColor('dragon_knight')).toBe('#f4554b');
		expect(classColor('infighter_male')).toBe('#4de3d1');
		expect(classColor('not_a_class')).toBeUndefined();
	});
});
