import { describe, expect, it } from 'vitest';
import { bracerStats, readBracer, type BracerGrade } from './bracer';
import { baseAttackPoint, PartType, partHigh } from './cp';
import { initSimState, itemLevel, mainStatIndex, simulate } from './simulate';
import { supportCombatPower } from './support';
import { bracerUpgrades } from './bracer-upgrades';
import { applyUpgrade } from './apply-upgrade';
import { buildUpgrades } from './upgrades';
import type { Loadout } from './types';
import soulshan from './fixtures/na-soulshan.json';
import brushann from './fixtures/na-brushann.json';

const dealer = soulshan as unknown as Loadout;
const support = brushann as unknown as Loadout;
const part = (l: Loadout, type: number) => l.battlePoint.parts.find((p) => p.type === type)!;

describe('KR Belgardin bracer', () => {
	it('keeps existing imports unchanged until a bracer is equipped', () => {
		for (const l of [dealer, support]) {
			const base = initSimState(l);
			expect(base.bracer).toBeNull();
			expect(simulate(l, base).parts).toEqual(l.battlePoint.parts);
		}
	});

	it('includes the KR +0 and +25 stats and separate limit breaks', () => {
		expect(bracerStats({ honing: 0, grade: 'epic' })).toEqual({ mainStat: 10500, vitality: 900, weaponPower: 3500, attackFlat: 0, attackPercent: 0 });
		expect(bracerStats({ honing: 25, grade: 'ancient' })).toEqual({ mainStat: 73710, vitality: 6414, weaponPower: 22940, attackFlat: 9050, attackPercent: 3 });
		for (const [honing, lower, higher] of [[10, 'epic', 'legendary'], [15, 'legendary', 'relic'], [20, 'relic', 'ancient']] as [number, BracerGrade, BracerGrade][]) {
			const a = bracerStats({ honing, grade: lower });
			expect(bracerStats({ honing, grade: higher })).toEqual({ ...a, attackPercent: a.attackPercent + 1 });
		}
	});

	it('applies flat basic AP before additive gem / stone / bracer percentages', () => {
		const base = initSimState(dealer);
		const state = structuredClone(base);
		state.bracer = { honing: 25, grade: 'ancient' };
		const result = simulate(dealer, state, base);
		const atk = part(dealer, PartType.BaseAttack);
		const expected = baseAttackPoint(result.mainStat, result.weaponPower, Number(atk.attackPowerMultiplier) + 3, 9050)
			/ baseAttackPoint(Number(atk.mainStat), Number(atk.weaponPower), Number(atk.attackPowerMultiplier));
		expect(result.cp / simulate(dealer, base).cp).toBeCloseTo(expected, 10);
		const multiplier = (dealer.stats?.find((s) => s.type === mainStatIndex(dealer) + 4)?.value ?? 10000) / 10000;
		expect(result.mainStat - Number(atk.mainStat)).toBeCloseTo(73710 * multiplier);
		expect(itemLevel(state)).toBe(itemLevel(base));
	});

	it('increases both support Buff Power and Shield & Heal Power', () => {
		const base = initSimState(support);
		const state = structuredClone(base);
		state.bracer = { honing: 0, grade: 'epic' };
		const result = simulate(support, state, base);
		const a = supportCombatPower(simulate(support, base).parts);
		const b = supportCombatPower(result.parts);
		expect(b.buff).toBeGreaterThan(a.buff);
		expect(b.shieldHeal).toBeGreaterThan(a.shieldHeal);
		// Artist: 2 HP per Vitality, then existing vigor and HP multipliers.
		const expectedHp = Number(part(support, PartType.BaseHealth).maxHp) + 900 * 2 * (1 + 6491 / 14000) * 1.29;
		expect(result.parts.find((p) => p.type === PartType.BaseHealth)!.maxHp).toBeCloseTo(expectedHp, 6);
	});

	it('reads known bracer IDs, preserves an equipped baseline, and removes it as a delta', () => {
		const l = structuredClone(dealer);
		l.items!.push({ id: 134601206, slot: 'bracer', data: { type: 'equipment', honing: 25 } });
		expect(readBracer(l)).toEqual({ honing: 25, grade: 'ancient' });
		const base = initSimState(l);
		expect(simulate(l, base).parts).toEqual(l.battlePoint.parts);
		const state = structuredClone(base);
		state.bracer = null;
		expect(simulate(l, state, base).cp).toBeLessThan(simulate(l, base).cp);
		l.items!.at(-1)!.data.honing = 26;
		expect(readBracer(l)).toBeNull();
	});

	it('keeps bracer Weapon Power independent when honing an already equipped weapon', () => {
		const l = structuredClone(dealer);
		l.items!.push({ id: 134601206, slot: 'vambrace', data: { type: 'equipment', honing: 25 } });
		const base = initSimState(l);
		const state = structuredClone(base);
		state.gear.weapon!.honing++;
		const result = simulate(l, state, base);
		const without = structuredClone(l);
		without.items!.pop();
		const noBracerBase = initSimState(without);
		const noBracerState = structuredClone(noBracerBase);
		noBracerState.gear.weapon!.honing++;
		expect(result.weaponPower).toBeLessThan(simulate(without, noBracerState, noBracerBase).weaponPower);
		expect(partHigh(result.parts.find((p) => p.type === PartType.BaseAttack)!)).toBeGreaterThan(partHigh(part(l, PartType.BaseAttack)));
	});
});

describe('bracer Next Upgrades', () => {
	it.each([['dealer', dealer], ['support', support]] as const)('applies every legal step with the advertised gain for a %s', (_, l) => {
		const base = initSimState(l);
		const state = structuredClone(base);
		let steps = 0;
		while (true) {
			const suggestions = bracerUpgrades(l, state, base);
			if (!suggestions.length) break;
			const upgrade = suggestions[0];
			expect(buildUpgrades(l, suggestions).some((u) => u.key === upgrade.key)).toBe(true);
			const before = simulate(l, state, base).cp;
			expect(applyUpgrade(l, state, base, upgrade)).toBe(true);
			expect((simulate(l, state, base).cp / before - 1) * 100).toBeCloseTo(upgrade.gainPct, 9);
			expect(upgrade.gainPct).toBeGreaterThan(0);
			// A stale row must never skip another level or lower the bracer.
			expect(applyUpgrade(l, state, base, upgrade)).toBe(false);
			steps++;
			if (steps > 29) throw new Error('Bracer progression did not stop');
		}
		expect(steps).toBe(29);
		expect(state.bracer).toEqual({ grade: 'ancient', honing: 25 });
	});

	it('honors manually selected grades and scores against other current edits', () => {
		const base = initSimState(dealer);
		const state = structuredClone(base);
		state.bracer = { grade: 'relic', honing: 20 };
		state.gear.weapon!.honing = 25;
		state.karma.enlightenment = 30;
		const upgrade = bracerUpgrades(dealer, state, base)[0];
		expect(upgrade.key).toBe('bracer:ancient:20');
		expect(upgrade.title).toBe('Relic → Ancient (+20)');
		const before = simulate(dealer, state, base).cp;
		expect(applyUpgrade(dealer, state, base, upgrade)).toBe(true);
		expect((simulate(dealer, state, base).cp / before - 1) * 100).toBeCloseTo(upgrade.gainPct, 9);
	});

	it('does not recommend acquisition below item level 1750', () => {
		const l = structuredClone(dealer);
		l.itemLevel = 1740;
		const state = initSimState(l);
		state.gear = {};
		expect(bracerUpgrades(l, state)).toEqual([]);
	});
});
