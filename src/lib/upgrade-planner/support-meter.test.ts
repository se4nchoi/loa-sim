import { describe, expect, it } from 'vitest';
import type { RunSummary } from '$lib/logs/protocol';
import brushann from './fixtures/na-brushann.json';
import { initSimState } from './simulate';
import { buffStrength, destinyUptime, supportGain, supportMeter, supportStats } from './support-meter';
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

	it('values a step as its gain in party DPS added, and calls a step it cannot see unknown', () => {
		const next = structuredClone(base);
		next.gear.weapon!.honing = Math.min(25, next.gear.weapon!.honing + 1);
		const m = supportMeter(loadout, base, next, run)!;
		expect(supportGain(loadout, base, base, next, run)).toBeCloseTo((m.after / m.before - 1) * 100, 9);
		const karma = structuredClone(base);
		karma.karma.leap = Math.min(30, (karma.karma.leap ?? 0) + 1);
		expect(supportGain(loadout, base, base, karma, run)).toBeNull();
	});

	it('values support astrogem options: Ally Damage Enhancement raises only the damage buffs', () => {
		const state = structuredClone(base);
		const gem = state.arkGrid.flatMap((c) => c.gems).find((g) => !g.removed && g.opts.some((o) => o.id === 2011));
		expect(gem).toBeDefined();
		if (!gem) return;
		const opt = gem.opts.find((o) => o.id === 2011)!;
		opt.level = Math.min(5, opt.level + 1);
		const m = supportMeter(loadout, base, state, run)!;
		const kind = (k: string) => m.kinds.find((x) => x.kind === k)!;
		expect(m.notInMeter).not.toContain('Ark Grid');
		expect(kind('damage').after).toBeGreaterThan(kind('damage').before);
		expect(kind('attack').after).toBeCloseTo(kind('attack').before);
	});

	it("counts a gem's base attack (the support's Attack Power) but lists its cooldown (buff uptime) as not valued", () => {
		const state = structuredClone(base);
		state.gems[0].level = Math.max(1, state.gems[0].level - 1);
		const m = supportMeter(loadout, base, state, run)!;
		expect(m.notInMeter).toContain('Gem cooldowns (their base attack counts)');
		const kind = (k: string) => m.kinds.find((x) => x.kind === k)!;
		expect(kind('attack').after).toBeLessThanOrEqual(kind('attack').before);
		expect(kind('damage').after).toBeCloseTo(kind('damage').before);
	});
});

describe('support core lines, buff by buff', () => {
	const stats = { attackPower: 100, allyAtk: 10, allyDmg: 10, brand: 5, coreLines: [
		{ points: 10, stat: 'dmg' as const, pct: 1.5 },
		{ points: 17, stat: 'dmg' as const, pct: 27, skill: 'Paint: Dragon Engraving' },
		{ points: 17, stat: 'atk' as const, pct: 5.6, destiny: "Destiny: Sun's Embrace" }
	] };
	it("a line naming a skill moves that skill's buffs only", () => {
		expect(buffStrength(stats, 'damage', 'Paint: Dragon Engraving', {})).toBeCloseTo(1 + (10 + 1.5 + 27) / 100);
		expect(buffStrength(stats, 'damage', 'Paint: Sun Well', {})).toBeCloseTo(1 + (10 + 1.5) / 100);
	});
	it('a Destiny line counts at the share of the run that Destiny was up, and is unknown for one the run never had', () => {
		expect(buffStrength(stats, 'attack', undefined, { "Destiny: Sun's Embrace": 0.5 })).toBeCloseTo(100 * (1 + (10 + 5.6 * 0.5) / 100));
		expect(buffStrength(stats, 'attack', undefined, {})).toBeNull();
		expect(buffStrength(stats, 'brand', undefined, {})).toBeCloseTo(1.05);
	});
	it("reads a Destiny's uptime off the support's own skills, casts-weighted, leaving Hyper Awakening out", () => {
		const r = { ...run, buffNames: { 900: "Destiny: Sun's Embrace" }, skills: [
			{ id: 1, damage: 100, critDamage: 0, hits: 1, crits: 0, casts: 3, buffs: { 900: 100 } },
			{ id: 2, damage: 100, critDamage: 0, hits: 1, crits: 0, casts: 1, buffs: { 900: 0 } },
			{ id: 3, damage: 1e9, critDamage: 0, hits: 1, crits: 0, casts: 1, hyper: true, buffs: { 900: 0 } }
		] } as unknown as RunSummary;
		expect(destinyUptime(r)["Destiny: Sun's Embrace"]).toBeCloseTo(0.75);
	});
});
