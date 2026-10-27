import { describe, expect, it } from 'vitest';
import soulshan from './fixtures/na-soulshan.json';
import type { Loadout } from './types';
import type { StatValues } from '$lib/logs/protocol';
import { initSimState, gemParts, simulate } from './simulate';
import { estimateDps, rankByDps } from './dps-estimate';
import { GEM_BASE_ATTACK } from './game-data';
import realRun from './fixtures/dps-soulshan-deskaluda.json';
import { averageStatValues } from '$lib/logs/stat-values';
import { liveUpgrades } from './live-upgrades';
import { applyUpgrade } from './apply-upgrade';

const loadout = soulshan as unknown as Loadout;
const values: StatValues = { runs: 1, mainStat: 0.05346, weaponPower: 0.15901, attackPower: 0.36999, additionalDamage: 0.66841, attackPowerPct: 0.89662, critRate: 0.14965, critDamage: 0.36305, evoDamage: 0.4533, weaponPowerPct: 0.34723 };
function setup() {
	const base = initSimState(loadout);
	const to = structuredClone(base);
	const i = to.gems.findIndex(g => g.kind === 'damage' && g.skill !== null && g.level > 1);
	to.skillShares = { [to.gems[i].skill!]: 30 };
	return { base, to, i };
}

describe('combined DPS estimate', () => {
	it('uses the flat-attack measurement for Basic flat attack, including its base multiplier', () => {
		const base = initSimState(loadout); base.bracer = {grade: 'epic', honing: 4};
		const to = structuredClone(base); to.bracer!.honing++;
		const result = estimateDps(loadout, base, to, base, values);
		const parts = gemParts(loadout);
		const basePct = base.gems.reduce((sum, g, i) => sum + ((g.tier ?? parts[i]?.tier) === 'T4' ? GEM_BASE_ATTACK[g.level - 1] : 0), 0);
		expect(result.statDelta!.baseAttackFlat).toBe(850);
		expect(result.statPct).toBeCloseTo(850 * (1 + basePct / 100) / 1000 * values.attackPower, 10);
		const absent = estimateDps(loadout, base, to, base, {...values, statSamples: {weaponPower: 1}});
		expect(absent.statPct).toBeNull();
		expect(absent.excluded).toContain('baseAttackFlat (missing meter values)');
	});
	it('reproduces measured marginal values from the real Deskaluda run', () => {
		const measured = averageStatValues([realRun.split])!;
		expect(measured.mainStat).toBeCloseTo(0.05346, 5);
		expect(measured.weaponPower).toBeCloseTo(0.15901, 5);
		expect(measured.critRate).toBeCloseTo(0.14965, 5);
		expect(measured.additionalDamage).toBeCloseTo(0.66841, 5);
		const total = realRun.skills.reduce((s,k) => s + k.totalDamage, 0);
		const astaros = realRun.skills.find(k => k.name === 'Astaros')!;
		expect(astaros.totalDamage / total * 100).toBeCloseTo(27.0, 1);
	});
	it('combines honing and damage gems multiplicatively, including T4 base attack', () => {
		const { base, to, i } = setup();
		to.gear.weapon!.honing++;
		const honing = estimateDps(loadout, base, to, base, values);
		const level = to.gems[i].level;
		to.gems[i].level--;
		const result = estimateDps(loadout, base, to, base, values);
		expect(result.excluded).toEqual([]);
		const current = simulate(loadout,base,base);
		const addedAttack = (GEM_BASE_ATTACK[level - 2] - GEM_BASE_ATTACK[level - 1]) / 100 * Math.sqrt(current.mainStat * current.weaponPower / 6);
		expect(result.statPct).toBeCloseTo(honing.statPct! + addedAttack / 1000 * values.attackPower, 9);
		expect(result.gemPct).toBeLessThan(0);
		expect(result.gainPct).toBeCloseTo(((1 + result.statPct! / 100) * (1 + result.gemPct! / 100) - 1) * 100, 9);
	});
	it('retains covered changes when an engraving also changes', () => {
		const { base, to } = setup();
		to.gear.weapon!.honing++;
		const covered = estimateDps(loadout, base, to, base, values);
		to.engravings[Number(Object.keys(to.engravings)[0])].books++;
		const partial = estimateDps(loadout, base, to, base, values);
		expect(partial.gainPct).toBe(covered.gainPct);
		expect(partial.excluded).toEqual(['engravings']);
	});
	it('marks missing gem shares and stat values explicitly', () => {
		const { base, to, i } = setup();
		to.gems[i].level--;
		to.skillShares = {};
		const result = estimateDps(loadout, base, to, base, null);
		expect(result.gainPct).toBeNull();
		expect(result.excluded).toContain('gem skill effects (missing damage shares)');
		if (gemParts(loadout)[i].tier === 'T4') expect(result.excluded).toContain('gem base attack (missing stat values)');
	});
	it('values successive gem changes against the original measured skill shares', () => {
		const { base, to, i } = setup();
		const middle = structuredClone(to);
		middle.gems[i].level--;
		to.gems[i].level -= 2;
		const a = estimateDps(loadout, base, middle, base, values);
		const b = estimateDps(loadout, base, to, base, values);
		const step = estimateDps(loadout, middle, to, base, values);
		expect(step.gemPct).toBeCloseTo(((100 + b.gemPct!) / (100 + a.gemPct!) - 1) * 100, 9);
	});
	it('ranks fully estimated upgrades ahead of unknown and partial changes', () => {
		const upgrades = [{key:'unknown',gainPct:20},{key:'small',gainPct:2},{key:'large',gainPct:1},{key:'partial',gainPct:30}];
		const e = (gainPct:number, excluded:string[] = []) => ({gainPct,statPct:gainPct,gemPct:0,excluded});
		const estimates = new Map([['small',e(0.2)],['large',e(1)],['partial',e(10,['engravings'])]]);
		expect(rankByDps(upgrades,estimates).map(u=>u.key)).toEqual(['large','small','partial','unknown']);
	});
	it('offers and applies separate gem upgrades for distinct skills', () => {
		const {base, to} = setup();
		const gems = liveUpgrades(loadout, to, base, undefined, true).filter(u => u.category === 'gem');
		expect(gems.length).toBe(to.gems.filter(g => g.level < 10).length);
		for (const upgrade of gems) {
			const next = structuredClone(to);
			expect(applyUpgrade(loadout, next, base, upgrade)).toBe(true);
			const changed = next.gems.flatMap((g,i) => g.level !== to.gems[i].level ? [i] : []);
			expect(changed).toEqual([Number(upgrade.key.split(':')[3])]);
		}
	});
	it('covers bracelet roll changes but excludes combat-stat changes', () => {
		const {base} = setup();
		base.bracelet = {lines:[{kind:'effect',key:'3:11012'}]};
		const to = structuredClone(base);
		to.bracelet!.lines = [{kind:'effect',key:'3:11011'}];
		const result = estimateDps(loadout,base,to,base,values);
		expect(result.excluded).toEqual([]);
		expect(result.statPct).toBeCloseTo(0.8 * values.critRate, 9);
		to.bracelet!.lines.push({kind:'stat',index:16,value:100});
		expect(estimateDps(loadout,base,to,base,values).excluded).toContain('bracelet');
	});
});
