import { describe, expect, it } from 'vitest';
import type { RunSummary } from '$lib/logs/protocol';
import brushann from './fixtures/na-brushann.json';
import { initSimState } from './simulate';
import { supportMeter, supportStats } from './support-meter';
import type { Loadout } from './types';

const loadout = brushann as unknown as Loadout;
const base = initSimState(loadout);
const run = {
	id: 1, start: 1, boss: 'Corvus Tul Rak', difficulty: 'Hard', cleared: true, player: 'Brushann', duration: 600_000, damage: 1e9, skills: [],
	combatPower: null, itemLevel: null, spec: null, engravings: [], statValues: null, critConversion: false, meterVersion: null,
	support: {
		kinds: { attack: 400, damage: 270, brand: 170, other: 160 },
		dealers: [{ cls: 'Souleater', damage: 5000, kinds: { attack: 200, damage: 135, brand: 85, other: 80 } }, { cls: 'Breaker', damage: 5000, kinds: { attack: 200, damage: 135, brand: 85, other: 80 } }],
		uptime: { attack: 0.98, brand: 0.99, identity: 0.77, hyper: 0.52 }
	}
} as unknown as RunSummary;

describe('support meter', () => {
	it('reads the buff stats off the gear', () => {
		const s = supportStats(loadout, base, base);
		expect(s.attackPower).toBeGreaterThan(0);
		expect(s.allyAtk + s.allyDmg + s.brand).toBeGreaterThan(0);
	});

	it('shows the recorded run unchanged without edits', () => {
		const m = supportMeter(loadout, base, base, run)!;
		expect(m.after).toBeCloseTo(m.before);
		expect(m.before).toBe(1000);
		expect(m.notInMeter).toEqual([]);
	});

	it('a weapon honing step grows only the Attack Power buffs, for every dealer alike', () => {
		const state = structuredClone(base);
		const slot = state.gear.weapon ? 'weapon' : (Object.keys(state.gear)[0] as keyof typeof state.gear);
		state.gear[slot]!.honing = Math.min(25, state.gear[slot]!.honing + 1);
		const m = supportMeter(loadout, base, state, run)!;
		const kind = (k: string) => m.kinds.find((x) => x.kind === k)!;
		expect(kind('attack').after).toBeGreaterThan(kind('attack').before);
		for (const k of ['damage', 'brand', 'other']) expect(kind(k).after).toBeCloseTo(kind(k).before);
		expect(m.dealers[0].after / m.dealers[0].before).toBeCloseTo(m.dealers[1].after / m.dealers[1].before);
	});

	it("counts a gem's base attack (the support's Attack Power) but lists its cooldown (buff uptime) as not valued", () => {
		const state = structuredClone(base);
		state.gems[0].level = Math.max(1, state.gems[0].level - 1);
		const m = supportMeter(loadout, base, state, run)!;
		expect(m.notInMeter).toContain('Gem cooldowns');
		const kind = (k: string) => m.kinds.find((x) => x.kind === k)!;
		expect(kind('attack').after).toBeLessThanOrEqual(kind('attack').before);
		expect(kind('damage').after).toBeCloseTo(kind('damage').before);
	});
});
