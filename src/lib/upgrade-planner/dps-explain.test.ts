import { describe, expect, it } from 'vitest';
import soulshan from './fixtures/na-soulshan.json';
import type { RunSummary } from '$lib/logs/protocol';
import type { Loadout } from './types';
import { initSimState } from './simulate';
import { estimateDps } from './dps-estimate';
import { explainGem, gemChoices, gemMembers, planModel, runGains, statExplanations } from './dps-explain';

const loadout = soulshan as unknown as Loadout;

describe('DPS tab gem explanation', () => {
	const state = initSimState(loadout);
	const choices = gemChoices(loadout, state);
	const damage = choices.find(c => c.kind === 'damage')!;
	const cooldown = choices.find(c => c.kind === 'cooldown')!;
	const none = planModel(loadout, state, state, [], []).input;
	const meter = { runs: 1, additionalDamage: 0.73, evoDamage: 0.56, attackPowerPct: 0.85, weaponPowerPct: 0.33, critRate: 0.15, critDamage: 0.36, mainStat: 0.055, weaponPower: 0.16, attackPower: 0.4 };
	const valued = [{ id: 1, start: 1, boss: 'Kazeros', difficulty: 'Hard', combatPower: 6000, statValues: meter }] as unknown as RunSummary[];
	const model = planModel(loadout, state, state, valued, valued).input;

	it('offers one level up per skill gem below 10', () => {
		expect(choices.length).toBeGreaterThan(0);
		for (const c of choices) {
			expect(c.to).toBe(c.from + 1);
			expect(state.gems[c.index].skill).toBe(c.skill);
		}
	});

	it('splits a damage gem by skill share and keeps the Next Upgrades total', () => {
		const shares = Object.fromEntries(gemMembers(damage.skill).map(id => [id, 20]));
		const e = explainGem(loadout, state, state, damage, shares, {}, none);
		expect(e.parts.length).toBe(gemMembers(damage.skill).length);
		for (const p of e.parts) expect(p.gainPct).toBeCloseTo(0.2 * e.effectPct, 10);
		const after = structuredClone(state);
		after.gems[damage.index].level++;
		const withShares = { ...state, skillShares: { [damage.skill]: 20 * gemMembers(damage.skill).length } };
		const total = explainGem(loadout, withShares, state, damage, shares, {}, none).gainPct!;
		expect(total).toBeCloseTo(estimateDps(loadout, withShares, { ...after, skillShares: withShares.skillShares }, state, null).gainPct!, 10);
		expect(total).toBeCloseTo(e.parts.reduce((s, p) => s + p.gainPct, 0), 10);
		expect(e.baseAttackPct).toBeNull();
		expect(e.rough).toBe(false);
		expect(e.cpPct).toBeGreaterThan(0);
	});

	it('adds the gem base attack through the stat model', () => {
		const shares = Object.fromEntries(gemMembers(damage.skill).map(id => [id, 20]));
		const without = explainGem(loadout, state, state, damage, shares, {}, none);
		const withAttack = explainGem(loadout, state, state, damage, shares, {}, model);
		expect(without.baseAttackPct).toBeNull();
		expect(withAttack.baseAttack).toBeGreaterThan(0);
		expect(withAttack.baseAttackPct).toBeGreaterThan(0);
		expect(withAttack.gainPct).toBeCloseTo(((1 + without.gainPct! / 100) * (1 + withAttack.baseAttackPct! / 100) - 1) * 100, 10);
	});

	it('values stat upgrades bucket by bucket', () => {
		const list = statExplanations(loadout, state, state, model);
		const weapon = list.find(e => e.category === 'honing' && e.delta.weaponPower > 0)!;
		expect(weapon.gainPct).toBeGreaterThan(0);
		expect(weapon.parts.map(p => p.key)).toContain('attack');
		expect(weapon.cpPct).toBeGreaterThan(0);
		expect(statExplanations(loadout, state, state, none).every(e => e.gainPct === null)).toBe(true);
	});

	it('flags cooldown gems as rough and missing shares as missing', () => {
		const e = explainGem(loadout, state, state, cooldown, {}, {}, none);
		expect(e.rough).toBe(true);
		expect(e.parts).toEqual([]);
		expect(e.missing.join(' ')).toContain('No damage share');
		expect(e.gainPct).toBeNull();
	});

	it('cooldown gems add nothing when the skill never waits on cooldown', () => {
		const id = gemMembers(cooldown.skill)[0];
		const e = explainGem(loadout, state, state, cooldown, { [id]: 30 }, { [id]: 0 }, none);
		expect(e.effectPct).toBeCloseTo(0, 10);
	});

	it('recomputes the skill share run by run', () => {
		const e = explainGem(loadout, state, state, damage, { [gemMembers(damage.skill)[0]]: 25 }, {}, none);
		const run = (id: number, mine: number, other: number) => ({ id, start: id, boss: 'Kazeros', difficulty: 'Hard', damage: mine + other,
			skills: [{ id: gemMembers(damage.skill)[0], damage: mine }, { id: 1, damage: other }] }) as unknown as RunSummary;
		const gains = runGains([run(1, 40, 60), run(2, 10, 90)], e);
		expect(gains.map(g => g.id)).toEqual([2, 1]);
		expect(gains[1].share).toBeCloseTo(40);
		expect(gains[1].gainPct).toBeCloseTo(0.4 * e.effectPct, 10);
		expect(gains[0].gainPct).toBeCloseTo(0.1 * e.effectPct, 10);
	});
});
