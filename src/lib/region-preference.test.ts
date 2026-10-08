import { afterEach, describe, expect, it, vi } from 'vitest';
import { preferredRegion, saveRegion } from './region-preference';

afterEach(() => vi.unstubAllGlobals());
describe('region preference', () => {
	it('remembers CE across visits and gives explicit links precedence', () => {
		const values = new Map<string, string>();
		vi.stubGlobal('localStorage', { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) });
		expect(preferredRegion()).toBe('NA');
		saveRegion('CE');
		expect(preferredRegion()).toBe('CE');
		expect(preferredRegion('na')).toBe('NA');
		expect(preferredRegion('invalid')).toBe('CE');
		saveRegion('KR');
		expect(preferredRegion()).toBe('CE');
	});
	it('still loads with blocked storage', () => {
		vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } });
		expect(preferredRegion()).toBe('NA');
		expect(preferredRegion('CE')).toBe('CE');
		expect(() => saveRegion('CE')).not.toThrow();
	});
});
