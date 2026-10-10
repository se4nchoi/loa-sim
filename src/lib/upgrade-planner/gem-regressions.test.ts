import { describe, expect, it } from 'vitest';
import fixture from './fixtures/na-soulshan.json';
import yktra from './fixtures/ce-yktra.json';
import { PartType, partHigh } from './cp';
import { GEM_BASE_ATTACK } from './game-data';
import { gemParts, initSimState, simulate } from './simulate';
import { gemDpsGainPct } from './dps';
import { liveUpgrades } from './live-upgrades';
import { applyUpgrade } from './apply-upgrade';
import { buildUpgrades } from './upgrades';
import type { Loadout } from './types';

describe('gem base Attack Power', () => {
	it('switches a mixed setup’s T3 level 10 gem to T4 and back, including DPS and base attack', () => {
		const l = structuredClone(fixture) as unknown as Loadout;
		const part = l.battlePoint.parts.find((p) => p.type === PartType.Gem)!;
		const originalId = part.id;
		part.id = 65021100;
		part.value = 640;
		l.gems!.find((g) => g.id === originalId)!.id = 65021100;
		const base = initSimState(l);
		const state = structuredClone(base);
		const info = gemParts(l);
		expect(info[0].tier).toBe('T3');
		expect(info.some((g) => g.tier === 'T4')).toBe(true);
		state.gems[0].tier = 'T4';
		const before = simulate(l, base, base);
		const after = simulate(l, state, base);
		const attack = (parts: typeof before.parts) => partHigh(parts.find((p) => p.type === PartType.BaseAttack)!);
		expect(attack(after.parts)).toBeGreaterThan(attack(before.parts));
		expect(partHigh(after.parts.find((p) => p.type === PartType.Gem)!)).toBe(704);
		expect(gemDpsGainPct(base.gems, state.gems, info, { [base.gems[0].skill!]: 100 })).toBeCloseTo((1.44 / 1.4 - 1) * 100, 8);
		state.gems[0].level = 9;
		expect(gemDpsGainPct(base.gems, state.gems, info, { [base.gems[0].skill!]: 100 })).toBe(0);
		const upgrade = liveUpgrades(l, state, base).find((u) => u.key === 'gem:T4:9')!;
		const current = simulate(l, state, base).cp;
		expect(applyUpgrade(l, state, base, upgrade)).toBe(true);
		expect(state.gems[0].level).toBe(10);
		expect(upgrade.gainPct).toBeCloseTo((simulate(l, state, base).cp / current - 1) * 100, 8);
		delete state.gems[0].tier;
		expect(simulate(l, state, base).cp).toBeCloseTo(before.cp, 10);
		expect(gemDpsGainPct(base.gems, state.gems, info, { [base.gems[0].skill!]: 100 })).toBe(0);
	});
	it('reproduces Yktra’s Inferno 8 → 9 report: +44.8 CP rather than +34.53', () => {
		const l = yktra as unknown as Loadout;
		const base = initSimState(l);
		const state = structuredClone(base);
		const i = state.gems.findIndex((g) => g.skill === 37230 && g.kind === 'damage');
		expect(state.gems[i].level).toBe(8);
		state.gems[i].level = 9;
		const ratio = simulate(l, state, base).cp / simulate(l, base, base).cp;
		const displayedGain = l.combatPower!.score * (ratio - 1);
		expect(displayedGain).toBeCloseTo(44.79, 2);
		expect(l.combatPower!.score * (10640 / 10576 - 1)).toBeCloseTo(34.53, 2);
	});

	it('uses the game data bonus rather than a linear level approximation', () => {
		expect(GEM_BASE_ATTACK).toEqual([0, 0.05, 0.1, 0.2, 0.3, 0.45, 0.6, 0.8, 1, 1.2]);
	});

	it.each([65031080, 65032080, 65021080])('applies both CP effects for gem %s, with no Attack Power bonus for T3', (id) => {
		const l = structuredClone(fixture) as unknown as Loadout;
		const part = l.battlePoint.parts.find((p) => p.type === PartType.Gem)!;
		const originalId = part.id;
		part.id = id;
		const t4 = Math.floor(id / 10000) % 10 === 3;
		part.value = t4 ? 576 : 384;
		l.gems!.find((g) => g.id === originalId)!.id = id;
		const base = initSimState(l);
		const state = structuredClone(base);
		state.gems[0].level = 9;
		const before = simulate(l, base, base);
		const after = simulate(l, state, base);
		const attack = l.battlePoint.parts.find((p) => p.type === PartType.BaseAttack)!;
		const attackRatio = t4 ? 1 + 0.2 / (100 + Number(attack.attackPowerMultiplier)) : 1;
		const gemRatio = t4 ? 10640 / 10576 : 10480 / 10384;
		expect(partHigh(after.parts.find((p) => p.type === PartType.BaseAttack)!) / partHigh(attack)).toBeCloseTo(attackRatio, 10);
		expect(after.cp / before.cp).toBeCloseTo(attackRatio * gemRatio, 10);
		const upgrade = buildUpgrades(l).find((u) => u.key === `gem:${t4 ? 'T4' : 'T3'}:8`)!;
		expect(upgrade.gainPct).toBeCloseTo((after.cp / before.cp - 1) * 100, 8);
		state.gems[0].level = 8;
		expect(simulate(l, state, base).cp).toBeCloseTo(before.cp, 10);
	});
});
