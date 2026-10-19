import { describe, expect, it } from 'vitest';
import type { RunSummary } from '$lib/logs/protocol';
import { skillTable } from './dps-skills';

const skill = (id: number, damage: number, extra: Partial<RunSummary['skills'][number]> = {}) =>
	({ id, damage, critDamage: 0, hits: 10, crits: 5, casts: 4, ...extra });
const run = (id: number, duration: number, skills: RunSummary['skills']): RunSummary => ({
	id, start: id, boss: 'Corvus Tul Rak', difficulty: 'Nightmare', cleared: true, player: 'Soulshan', duration, combatPower: 6500,
	itemLevel: 1784, spec: null, engravings: [], damage: skills.reduce((sum, s) => sum + s.damage, 0), skills, statValues: null,
	critConversion: false, meterVersion: null
});

describe('skills table', () => {
	it('adds up D%, CDR%, casts per minute and crit over the clears, with the range across clears', () => {
		const a = run(1, 60_000, [skill(1, 60, { timeAvailable: 15_000 }), skill(2, 40)]);
		const b = run(2, 120_000, [skill(1, 20, { timeAvailable: 90_000, crits: 10 }), skill(2, 80)]);
		const [first, second] = skillTable([a, b]);
		expect(first.id).toBe(2);
		expect(first.share).toBeCloseTo(120 / 200 * 100);
		expect(first.shareRange).toEqual({ low: 40, high: 80 });
		expect(first.cooldown).toBeNull();
		expect(second.share).toBeCloseTo(80 / 200 * 100);
		// 105 s ready over 180 s of fight; per clear 75% and 25%.
		expect(second.cooldown).toBeCloseTo((1 - 105 / 180) * 100);
		expect(second.cooldownRange).toEqual({ low: 25, high: 75 });
		expect(second.cpm).toBeCloseTo(8 / 3);
		expect(second.crit).toBeCloseTo(15 / 20 * 100);
	});
	it('counts a clear without the skill as 0% for its range', () => {
		const a = run(1, 60_000, [skill(1, 50), skill(2, 50)]);
		const b = run(2, 60_000, [skill(2, 100)]);
		const row = skillTable([a, b]).find(r => r.id === 1)!;
		expect(row.shareRange).toEqual({ low: 0, high: 50 });
		expect(row.clears).toBe(1);
	});
	it('matches LOA Logs on a real clear (#5944, Astaros)', () => {
		const r = run(5944, 419_944, [skill(1, 105.92e9, { timeAvailable: 419_944 * (1 - 0.635), casts: 42 }), skill(2, 550.36e9 - 105.92e9)]);
		const row = skillTable([r]).find(s => s.id === 1)!;
		expect(row.share).toBeCloseTo(19.2, 1);
		expect(row.cooldown).toBeCloseTo(63.5, 1);
		expect(row.casts).toBe(42);
	});
});
