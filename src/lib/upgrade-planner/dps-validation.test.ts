import {describe,it,expect} from 'vitest';
import {validateReplayMarginals} from './dps-validation';
import {contextDecoder} from './replay-context';
import {averageStatValues} from '$lib/logs/stat-values';
import type {StatValues,ReplayRun} from '$lib/logs/protocol';
import type {StatDeltas} from './dps-stats';
import type {HitContext} from './dps-replay';
import realRun from './fixtures/dps-soulshan-hits.json';
import marginal from './fixtures/dps-soulshan-deskaluda.json';
const baseline:HitContext={mainStat:600000,weaponPower:250000,flatAttack:0,supportAttack:0,baseAttackPct:0.1,attackPowerPct:0,additionalDamage:0.5,critRate:0.7,critMultiplier:2.4,primaryCritDamageRate:1,critCap:1,evolutionDamage:0.6};
const run:ReplayRun={...realRun,totalDamage:100,hits:[{skill:1,damage:100,crit:true,hyper:false,buffedBy:[],debuffedBy:[]}]};
const values:StatValues={runs:1,encounterIds:[run.id],mainStat:0,weaponPower:0,attackPower:0,attackPowerPct:1,weaponPowerPct:0,additionalDamage:2/3,critRate:0,critDamage:0.5,evoDamage:0.625};
const decode=contextDecoder({buffs:{}});
const audit=(hit:ReplayRun['hits'][number],delta:StatDeltas)=>decode(hit,{baseline,baselineMatchesLog:true,delta});
describe('per-encounter replay validation',()=>{
 it('matches known bucket arithmetic and exposes disagreements',()=>{
  const checks=validateReplayMarginals(run,values,audit);
  expect(checks.find(c=>c.metric==='additionalDamage')?.status).toBe('match');
  expect(checks.find(c=>c.metric==='critDamage')?.status).toBe('match');
  expect(checks.find(c=>c.metric==='mainStat')?.status).toBe('mismatch');
 });
 it('rejects mixed-run averages and wrong encounter IDs',()=>{
  for(const v of [{...values,runs:2},{...values,encounterIds:[999]}])expect(validateReplayMarginals(run,v,audit).every(c=>c.status==='unavailable')).toBe(true);
 });
 it('distinguishes absent marginals from measured zero',()=>{
  const checks=validateReplayMarginals(run,{...values,statSamples:{critRate:1}},audit);
  expect(checks.find(c=>c.metric==='additionalDamage')?.status).toBe('unavailable');
  expect(checks.find(c=>c.metric==='critRate')?.status).toBe('mismatch');
 });
 it('blocks missing provenance, unrelated projections and low coverage',()=>{
  expect(validateReplayMarginals(run,values,(h,d)=>decode(h,{baseline,delta:d})).every(c=>c.status==='unavailable')).toBe(true);
  expect(validateReplayMarginals(run,values,(h)=>decode(h,{baseline,baselineMatchesLog:true,delta:{mainStat:0,weaponPower:0,attackPower:0,attackPowerPct:0,additionalDamage:1,critRate:0,critDamage:0}})).find(c=>c.metric==='weaponPower')?.status).toBe('unavailable');
  expect(validateReplayMarginals({...run,totalDamage:200},values,audit).every(c=>c.status==='unavailable')).toBe(true);
 });
 it('shows historical assumption mismatches without calling them validated',()=>{
  const v=averageStatValues([marginal.split])!;v.encounterIds=[realRun.id];
  const checks=validateReplayMarginals(realRun,v,(h,d)=>decode({...h,buffedBy:[],debuffedBy:[]},{baseline:{...baseline,mainStat:764203,weaponPower:253611,baseAttackPct:0.127},baselineMatchesLog:true,delta:d}));
  expect(checks.find(c=>c.metric==='weaponPower')?.status).toBe('mismatch');
 });
 it('rejects invalid thresholds',()=>expect(()=>validateReplayMarginals(run,values,audit,{tolerancePp:NaN})).toThrow());
});
