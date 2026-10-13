import type { ReplayHit, ReplayRun, StatValues } from '$lib/logs/protocol';
import { replayStats } from './dps-replay';
import type { StatDeltas } from './dps-stats';
import { replayDependencies, type ContextAudit, type ContextIssue } from './replay-context';

type Metric = Exclude<keyof StatValues, 'runs' | 'encounterIds' | 'statSamples' | 'statRanges' | 'weaponPowerPct'>;
const increments: Record<Metric, Partial<StatDeltas>> = {
 mainStat:{mainStat:1000},weaponPower:{weaponPower:1000},attackPower:{attackPower:1000},
 attackPowerPct:{attackPowerPct:1},additionalDamage:{additionalDamage:1},
 critRate:{critRate:1},critDamage:{critDamage:1},evoDamage:{evolutionDamage:1}
};
const zero: StatDeltas={mainStat:0,weaponPower:0,attackPower:0,attackPowerPct:0,additionalDamage:0,critRate:0,critDamage:0};
export interface MarginalCheck {
 metric: Metric; status:'match'|'mismatch'|'unavailable';
 replayPct:number|null;meterPct:number|null;differencePp:number|null;coveragePct:number;
 issues:ContextIssue[];
}
/** Validate one encounter at a time. An aggregate meter average cannot stand in for its own run. */
export function validateReplayMarginals(run:ReplayRun, values:StatValues,
 auditOf:(hit:ReplayHit,delta:StatDeltas)=>ContextAudit,
 options:{tolerancePp?:number;minCoveragePct?:number}={}):MarginalCheck[] {
 const tolerance=options.tolerancePp??0.02, minCoverage=options.minCoveragePct??95;
 if (!Number.isFinite(tolerance)||tolerance<0||!Number.isFinite(minCoverage)||minCoverage<0||minCoverage>100)
  throw new Error('Invalid replay validation tolerance or coverage threshold');
 return (Object.entries(increments) as [Metric,Partial<StatDeltas>][]).map(([metric,increment])=>{
  const delta={...zero,...increment};const issues:ContextIssue[]=[];
  const unavailable=(reason:string):MarginalCheck=>({metric,status:'unavailable',replayPct:null,meterPct:null,differencePp:null,coveragePct:0,issues:[{source:run.id,reason}]});
  if (values.runs!==1||values.encounterIds?.length!==1||values.encounterIds[0]!==run.id)
   return unavailable('Meter values must belong to this single encounter');
  if (values.statSamples&&values.statSamples[metric]!==1||!Number.isFinite(values[metric]))
   return unavailable('Meter marginal unavailable');
  const result=replayStats([run],delta,(_,hit)=>{
   if (hit.hyper) return null;
   const audit=auditOf(hit,delta);issues.push(...audit.issues);
   if (audit.dependencies&&replayDependencies(delta).some(b=>!audit.dependencies!.includes(b))) {
    issues.push({source:hit.skill,reason:'Context projection does not cover this marginal'});return null;
   }
   return audit.context;
  });
  if(result.gainPct===null)issues.push({source:run.id,reason:'Replay contains unresolved contexts or invalid hit data'});
  if(result.coveragePct<minCoverage)issues.push({source:run.id,reason:'Insufficient hit coverage for validation'});
  const difference=result.gainPct===null?null:result.gainPct-values[metric];
  return {metric,status:issues.length?'unavailable':Math.abs(difference!)<=tolerance?'match':'mismatch',
   replayPct:result.gainPct,meterPct:values[metric],differencePp:difference,coveragePct:result.coveragePct,
   issues:issues.filter((v,i,a)=>a.findIndex(x=>x.source===v.source&&x.reason===v.reason)===i)};
 });
}
