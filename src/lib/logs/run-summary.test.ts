import { describe, expect, it } from 'vitest';
import { runSummary, supportKindOf, supportRunOf } from './run-summary';

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
	it('preserves Order choices and passive nodes without confusing core choices with points', () => {
		const r = runSummary(row, { skills: { a: { id: 1, totalDamage: 5 } }, loadoutHash: 'build-1',
			arkPassiveData: JSON.stringify({ evolution: [{ id: 40, lv: 2 }, { id: 50, lv: -1 }], arkGridOrder: { sun: 3, moon: 2, star: 1, extra: 17 } }) }, null, {})!;
		expect(r.arkGridOrder).toEqual({ sun: 3, moon: 2, star: 1 });
		expect(r.arkPassives).toEqual({ evolution: [{ id: 40, lv: 2 }] });
		expect(r.loadoutHash).toBe('build-1');
		const old = runSummary(row, { skills: { a: { id: 1, totalDamage: 5 } }, arkPassiveData: '{broken' }, null, {})!;
		expect(old.arkGridOrder).toBeUndefined();
	});
	it('keeps the id LOA Logs synced the run under on lostark.bible, when it is one', () => {
		const skills = { a: { id: 1, totalDamage: 5 } };
		expect(runSummary(row, { skills, upstreamId: 'RpaQ0M8' }, null, {})!.upstreamId).toBe('RpaQ0M8');
		expect(runSummary(row, { skills, upstreamId: '../evil?x=1' }, null, {})!.upstreamId).toBeUndefined();
		expect(runSummary(row, { skills }, null, {})!.upstreamId).toBeUndefined();
	});
});

describe('Ark Grid and identity buffs', () => {
	it("keeps each skill's damage under the kept buffs only, and their names", () => {
		const row = { id: 1, start: 1, boss: 'Serca', difficulty: 'Nightmare', cleared: true, player: 'Soulshan', duration: 1000 };
		const kept = new Map([[3461200, 'Destiny: Footsteps of the Dead'], [460501, 'Deathlord Mode']]);
		const r = runSummary(row, { skills: { a: { id: 46430, totalDamage: 10, buffedBy: { '3461200': 6, '460501': 4, '210230': 9 } } }, keptBuffs: kept }, null, {})!;
		expect(r.skills[0].buffs).toEqual({ 3461200: 6, 460501: 4 });
		expect(r.buffNames?.[460501]).toBe('Deathlord Mode');
		expect(runSummary(row, { skills: { a: { id: 46430, totalDamage: 10 } } }, null, {})!.skills[0].buffs).toBeUndefined();
	});
});

describe('support contribution', () => {
	// Two dealers credit the support; their per-effect increases overlap (weights), the credited damage is the amount.
	const misc = { contributionSplits: {
		0: { name: 'Dealer', partyNumber: 0, damageSplitByName: { Sup: 100, Dealer: 300 },
			damageIncreaseByEntitySkillGroup: { Sup: { 'attack_power_addend_/$@[16,314184]': 60, 'skill_damage_sub_rate_2_/$@[16,310509]': 30, 'skill_damage_amplify_/$@[16,314260]': 30, 'evolution_damage_/$@[16,2000362]': 30 } } },
		1: { name: 'Other', partyNumber: 0, damageSplitByName: { Sup: 50, Other: 150 },
			damageIncreaseByEntitySkillGroup: { Sup: { 'ultimate_awakening_damage_rate_/$@[16,319506]': 10 } } },
		2: { name: 'Sup', partyNumber: 0, damageSplitByName: { Sup: 5 } },
		3: { name: 'Boss — encounter bonuses', partyNumber: -1, damageSplitByName: { Sup: 999 } }
	} };
	it("splits each dealer's credited damage by kind, in proportion to the effect weights", () => {
		const s = supportRunOf(misc, 'Sup', (n) => ({ Dealer: 'Souleater', Other: 'Breaker' })[n], { attack: 0.98, brand: 0.99, identity: 0.77, hyper: 0.52 })!;
		expect(s.dealers).toHaveLength(2);
		expect(s.dealers[0]).toEqual({ cls: 'Souleater', damage: 400, kinds: { attack: 40, damage: 20, brand: 20, other: 20 } });
		expect(s.dealers[1].kinds).toEqual({ attack: 0, damage: 50, brand: 0, other: 0 });
		expect(s.kinds).toEqual({ attack: 40, damage: 70, brand: 20, other: 20 });
		expect(s.uptime?.identity).toBe(0.77);
	});
	it('has nothing without contribution splits', () => {
		expect(supportRunOf({}, 'Sup', () => undefined)).toBeNull();
		expect(supportKindOf('physical_defense_break_/$@[16,605100063]')).toBe('other');
	});
});
