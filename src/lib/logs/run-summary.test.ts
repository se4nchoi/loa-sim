import { describe, expect, it } from 'vitest';
import { runSummary } from './run-summary';

const row = { id: 7, start: 1, boss: 'Kazeros', difficulty: 'Hard', cleared: true, player: 'Shanzkii', duration: 60_000 };
const pair = (a: number, b: number) => ({ damageDoneByStat: a, damageDoneByStatPlusValue: b });

describe('run summary', () => {
	it('keeps skill totals, gem levels and the meter values', () => {
		const names: Record<number, [string, string]> = {};
		const misc = { version: '1.51.2', contributionSplits: [{ name: 'shanzkii', criticalDamageRate1percentDamage: pair(100, 100.4), criticalHitRate1percentDamage: pair(100, 100.1), bluntThornEfficiency: { damageDoneByStat: 5 } }] };
		const r = runSummary(row, {
			skills: { a: { id: 47950, name: 'Falling Blossoms', icon: 'ifm_skill_01_26.png', totalDamage: 90, critDamage: 80, hits: 10, crits: 9, casts: 3, timeAvailable: 500, gemDamage: 10 }, b: { id: 1, totalDamage: 0 } },
			combatPower: 4385.8, itemLevel: 1750.83, spec: 'Brawl King Storm', engravings: '["Adrenaline","Grudge"]'
		}, misc, names)!;
		expect(r.damage).toBe(90);
		expect(r.skills).toEqual([{ id: 47950, damage: 90, critDamage: 80, hits: 10, crits: 9, casts: 3, timeAvailable: 500, damageGem: 10 }]);
		expect(names[47950]).toEqual(['Falling Blossoms', 'ifm_skill_01_26']);
		expect(r.engravings).toEqual(['Adrenaline', 'Grudge']);
		expect(r.statValues?.critDamage).toBeCloseTo(0.4);
		expect(r.critConversion).toBe(true);
		expect(r.meterVersion).toBe('1.51.2');
	});
	it('records no stat values in low performance mode', () => {
		const misc = { contributionSplits: [{ name: 'Shanzkii', criticalDamageRate1percentDamage: pair(0, 0) }] };
		const r = runSummary(row, { skills: { a: { id: 1, totalDamage: 5 } } }, misc, {})!;
		expect(r.statValues).toBeNull();
		expect(runSummary(row, { skills: {} }, null, {})).toBeNull();
	});
});
