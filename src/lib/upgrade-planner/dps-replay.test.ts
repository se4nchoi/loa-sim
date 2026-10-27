import { describe, expect, it } from 'vitest';
import real from './fixtures/dps-soulshan-hits.json';
import type { ReplayRun, ReplayHit } from '$lib/logs/protocol';
import type { StatDeltas } from './dps-stats';
import { replayHitRatio, replayStats, type HitContext } from './dps-replay';
import { sampleQuality } from './dps-sample';
import { initSimState } from './simulate';
import snapshot from './fixtures/na-soulshan.json';
import type { Loadout } from './types';

const delta = (patch: Partial<StatDeltas> = {}): StatDeltas => ({mainStat:0,weaponPower:0,attackPower:0,attackPowerPct:0,critRate:0,critDamage:0,additionalDamage:0,...patch});
const context: HitContext = {mainStat:764203,weaponPower:253611,baseAttackPct:0.127,attackPowerPct:0,flatAttack:0,supportAttack:0,additionalDamage:0.5,critRate:0.9,critMultiplier:2.88,critCap:1};
const hit: ReplayHit = {skill:1,damage:100,crit:false,hyper:false};
const run = real as ReplayRun;

describe('per-hit stat replay with explicit contexts', () => {
	it('distinguishes Basic flat attack from additive attack and rejects negative Basic attack', () => {
		const c = {...context, baseAttackFlat: 3690, baseAttackPct: .2, supportAttack: 40000};
		const total = (Math.sqrt(c.mainStat * c.weaponPower / 6) + 3690) * 1.2 + 40000;
		expect(replayHitRatio(hit, c, delta({baseAttackFlat: 1000}))).toBeCloseTo(1 + 1200 / total, 12);
		expect(replayHitRatio(hit, c, delta({attackPower: 1000}))).toBeCloseTo(1 + 1000 / total, 12);
		expect(replayHitRatio(hit, c, delta({baseAttackFlat: -4000}))).toBeNull();
	});
	it('cannot identify primary Crit Damage from a combined crit multiplier', () => {
		// Both contexts produce x3 crits. One is x2 primary times x1.5 secondary; the other x3 primary.
		const a = {...context, critMultiplier: 3, primaryCritDamageRate: 1};
		const b = {...context, critMultiplier: 3, primaryCritDamageRate: 2};
		const crit = {...hit, crit: true};
		expect(replayHitRatio(crit, a, delta())).toBe(replayHitRatio(crit, b, delta()));
		expect(replayHitRatio(crit, a, delta({critDamage: 1}))).toBeCloseTo(1.005, 12);
		expect(replayHitRatio(crit, b, delta({critDamage: 1}))).toBeCloseTo(1 + .01 / 3, 12);
	});
	it('preserves the baseline including incomplete hit coverage', () => {
		const result = replayStats([run],delta(),()=>context);
		expect(result.gainPct).toBe(0);
		expect(result.coveragePct).toBeCloseTo(98.890074,6);
	});
	it('uses square-root weapon scaling and decreasing marginal returns', () => {
		const amount = 20000;
		const first = replayHitRatio(hit,context,delta({weaponPower:amount}))!;
		const second = replayHitRatio(hit,{...context,weaponPower:context.weaponPower+amount},delta({weaponPower:amount}))!;
		expect(first).toBeCloseTo(Math.sqrt((context.weaponPower+amount)/context.weaponPower),12);
		expect(second).toBeLessThan(first);
		const large = replayHitRatio(hit,context,delta({weaponPower:context.weaponPower}))!;
		expect(large).toBeCloseTo(Math.sqrt(2),12);
		expect(large).toBeLessThan(1.5); // A first-order approximation would be 50%.
	});
	it('support attack dilutes main-stat and weapon gains', () => {
		const d = delta({mainStat:1000});
		expect(replayHitRatio(hit,{...context,supportAttack:26601.6},d)).toBeLessThan(replayHitRatio(hit,context,d)!);
	});
	it('caps positive crit gain and preserves the effect of negative crit changes', () => {
		const d = delta({critRate:20});
		const capped = replayHitRatio(hit,context,d)!;
		expect(capped).toBeCloseTo((1 + 1 * (2.88-1))/(1+0.9*(2.88-1)),12);
		expect(replayHitRatio(hit,{...context,critRate:1.1},delta({critRate:5}))).toBe(1);
		expect(replayHitRatio(hit,{...context,critRate:1.1},delta({critRate:-5}))).toBe(1);
		expect(replayHitRatio(hit,{...context,critRate:1.1},delta({critRate:-20}))).toBeLessThan(1);
		expect(replayHitRatio(hit,{...context,critRate:0.9,critCap:0.8},delta({critRate:5}))).toBe(1);
	});
	it('applies crit-damage changes only to actual crits when crit rate is unchanged', () => {
		const d = delta({critDamage:10});
		expect(replayHitRatio(hit,context,d)).toBe(1);
		expect(replayHitRatio({...hit,crit:true},context,d)).toBeCloseTo(2.98/2.88,12);
	});
	it('keeps base-attack and outgoing attack-power buckets separate', () => {
		const c = {...context,supportAttack:40000,flatAttack:1000,attackPowerPct:0.1};
		const base = replayHitRatio(hit,c,delta({baseAttackPct:1}))!;
		const outgoing = replayHitRatio(hit,c,delta({attackPowerPct:1}))!;
		expect(base).not.toBeCloseTo(outgoing,6);
		expect(outgoing).toBeCloseTo(1.11/1.1,12);
	});
	it('leaves hyper awakening fixed and rejects unavailable/invalid contexts', () => {
		expect(replayHitRatio({...hit,hyper:true},context,delta({weaponPower:10000,critRate:50}))).toBe(1);
		expect(replayStats([run],delta({weaponPower:1000}),()=>null).gainPct).toBeNull();
		expect(replayHitRatio(hit,{...context,weaponPower:0},delta())).toBeNull();
		expect(replayHitRatio(hit,context,delta({weaponPower:-context.weaponPower}))).toBeNull();
	});
	it('matches a direct sum over real logged hits for weapon scaling', () => {
		const d = delta({weaponPower:20000});
		const ratio = Math.sqrt((context.weaponPower+20000)/context.weaponPower);
		const expected = run.hits.filter(h=>!h.hyper).reduce((sum,h)=>sum+h.damage*(ratio-1),0)/run.totalDamage*100;
		expect(replayStats([run],d,()=>context).gainPct).toBeCloseTo(expected,10);
	});
});

describe('sample-quality signals', () => {
	it('reports the actual date, encounter, sample size and coverage', () => {
		const loadout = snapshot as unknown as Loadout;
		const q = sampleQuality([run],loadout,initSimState(loadout),Date.UTC(2026,9,13));
		expect(q.oldest).toBe(run.start);
		expect(q.contexts).toEqual(['Deskaluda · Normal']);
		expect(q.replayRuns).toBe(1);
		expect(q.coverage).toBeCloseTo(98.890074,6);
		expect(q.warnings.some(w=>w.startsWith('Small sample'))).toBe(true);
		expect(q.buildStatus).toContain('unverified');
	});
	it('detects mixed difficulties/builds, old data, gem and CP mismatches', () => {
		const loadout = snapshot as unknown as Loadout;
		const base = initSimState(loadout);
		const changed = structuredClone(run);
		changed.difficulty = 'Hard'; changed.loadoutHash='build-b'; changed.combatPower=1;
		for (const skill of changed.skills) {skill.damageGem=1;skill.cooldownGem=1;}
		const q = sampleQuality([{...run,loadoutHash:'build-a'},changed],loadout,base,Date.UTC(2026,10,13));
		expect(q.gemMismatches).toBeGreaterThan(0);
		expect(q.warnings.some(w=>w.includes('Mixed encounters'))).toBe(true);
		expect(q.warnings.some(w=>w.includes('different build hashes'))).toBe(true);
		expect(q.warnings.some(w=>w.includes('2 weeks old'))).toBe(true);
		expect(q.warnings.some(w=>w.includes('Combat Power differs'))).toBe(true);
	});
});
