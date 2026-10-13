import { describe, expect, it } from 'vitest';
import { critConversionFromValues, critEvolutionBonus } from './crit-conversion';
import { replayHitRatio, type HitContext } from './dps-replay';
import type { StatDeltas } from './dps-stats';
import realMetrics from './fixtures/dps-soulshan-deskaluda.json';

const conversion = {threshold:0.8,ratio:1.5,maxBonus:0.6};
const hit = {skill:1,damage:100,crit:false,hyper:false};
const context: HitContext = {mainStat:600000,weaponPower:250000,baseAttackPct:0.1,attackPowerPct:0,flatAttack:0,supportAttack:0,additionalDamage:0,
	critRate:1.1,critMultiplier:3,critCap:1,evolutionDamage:0.6,critConversion:conversion};
const delta = (patch: Partial<StatDeltas>): StatDeltas => ({mainStat:0,weaponPower:0,attackPower:0,attackPowerPct:0,critRate:0,critDamage:0,additionalDamage:0,...patch});

describe('crit overcap conversion', () => {
	it('decodes caller-supplied numeric parameters without bundling an ability table', () => {
		expect(critConversionFromValues([8000,15000,6000])).toEqual(conversion);
		expect(critConversionFromValues([8000,12500,4500])).toEqual({threshold:0.8,ratio:1.25,maxBonus:0.45});
		expect(critConversionFromValues([8000,NaN,6000])).toBeNull();
		expect(critConversionFromValues([12000,15000,6000])).toBeNull();
		expect(critConversionFromValues(['8000',15000,6000])).toBeNull();
	});
	it('starts at the threshold and saturates at its own conversion cap', () => {
		expect(critEvolutionBonus(0.75,conversion)).toBe(0);
		expect(critEvolutionBonus(0.8,conversion)).toBe(0);
		expect(critEvolutionBonus(1.1,conversion)).toBeCloseTo(0.45,12);
		expect(critEvolutionBonus(1.2,conversion)).toBeCloseTo(0.6,12);
		expect(critEvolutionBonus(1.5,conversion)).toBe(0.6);
	});
	it('adds converted damage to evolution instead of multiplying it as a new bucket', () => {
		const ratio = replayHitRatio(hit,context,delta({critRate:1}))!;
		expect(ratio).toBeCloseTo((1+0.6+0.465)/(1+0.6+0.45),12);
		expect(ratio).not.toBeCloseTo(1.015,5);
	});
	it('crosses the direct crit cap and conversion threshold in one step', () => {
		const ratio = replayHitRatio(hit,{...context,critRate:0.79},delta({critRate:2}))!;
		const crit = (1+0.8*2)/(1+0.79*2);
		const evo = (1+0.6+0.015)/(1+0.6);
		expect(ratio).toBeCloseTo(crit*evo,12);
	});
	it('stops gain at conversion saturation and handles decreases past either boundary', () => {
		expect(replayHitRatio(hit,{...context,critRate:1.3},delta({critRate:5}))).toBeCloseTo(1,12);
		expect(replayHitRatio(hit,{...context,critRate:1.3},delta({critRate:-5}))).toBeCloseTo(1,12);
		expect(replayHitRatio(hit,{...context,critRate:1.3},delta({critRate:-20}))).toBeCloseTo(2.05/2.2,12);
		const down = replayHitRatio(hit,{...context,critRate:0.81},delta({critRate:-2}))!;
		expect(down).toBeCloseTo(((1+0.79*2)/(1+0.8*2))*(1.6/1.615),12);
	});
	it('changes the existing evolution bucket without double counting the conversion bonus', () => {
		expect(replayHitRatio(hit,context,delta({evolutionDamage:10}))).toBeCloseTo(2.15/2.05,12);
		expect(replayHitRatio(hit,{...context,evolutionDamage:1.6},delta({critRate:1}))).toBeLessThan(replayHitRatio(hit,context,delta({critRate:1}))!);
	});
	it('preserves actual crit flags for crit-damage changes and leaves hyper awakening unchanged', () => {
		expect(replayHitRatio(hit,context,delta({critDamage:10}))).toBeCloseTo(1,12);
		expect(replayHitRatio({...hit,crit:true},context,delta({critDamage:10}))).toBeCloseTo(3.1/3,12);
		expect(replayHitRatio({...hit,hyper:true},context,delta({critRate:20,evolutionDamage:50}))).toBe(1);
		expect(replayHitRatio(hit,{...context,critConversion:{...conversion,ratio:-1}},delta({critRate:1}))).toBeNull();
	});
	it('shows that matching aggregate crit/evolution sensitivities does not identify the overcap distribution', () => {
		const pairGain = (pair: {damageDoneByStat:number;damageDoneByStatPlusValue:number}) => pair.damageDoneByStatPlusValue/pair.damageDoneByStat-1;
		const critTarget = pairGain(realMetrics.split.criticalHitRate1percentDamage);
		const evoTarget = pairGain(realMetrics.split.evoDamage1percentDamage);
		// Two synthetic hit-context mixtures fitted to the SAME two actual marginal values. They are
		// counterexamples, not reconstructed stats for the logged run.
		const hypothesis = (uncappedRate: number) => {
			const bonus = critEvolutionBonus(uncappedRate,conversion);
			const k = critTarget/(0.01*conversion.ratio);
			const sensitivity = evoTarget/0.01;
			const bucket = (1-k*bonus-(sensitivity-k)*conversion.maxBonus)/sensitivity;
			const weight = k*(bucket+bonus);
			const uncapped = {...context,critRate:uncappedRate,evolutionDamage:bucket-1};
			const saturated = {...uncapped,critRate:1.3};
			const gain = (d:StatDeltas) => weight*(replayHitRatio(hit,uncapped,d)!-1)+(1-weight)*(replayHitRatio(hit,saturated,d)!-1);
			return {weight,gain};
		};
		const a = hypothesis(1.0), b = hypothesis(1.19);
		for (const h of [a,b]) {
			expect(h.weight).toBeGreaterThan(0); expect(h.weight).toBeLessThan(1);
			expect(h.gain(delta({critRate:1}))).toBeCloseTo(critTarget,12);
			expect(h.gain(delta({evolutionDamage:1}))).toBeCloseTo(evoTarget,12);
		}
		expect(a.gain(delta({critRate:10}))).toBeCloseTo(critTarget*10,12);
		expect(b.gain(delta({critRate:10}))).toBeCloseTo(critTarget,12);
		expect(a.gain(delta({critRate:20}))).toBeCloseTo(critTarget*20,12);
		expect(b.gain(delta({critRate:20}))).toBeCloseTo(critTarget,12);
	});
});
