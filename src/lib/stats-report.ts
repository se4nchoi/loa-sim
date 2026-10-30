import { CP_BUCKETS, LEVEL_BUCKETS } from './plan-stats';
import { GOLD_BUCKETS, BUDGET_BANDS } from './stats-insights';
import { UPGRADE_CATEGORIES } from './stats-model';
import { CP_STATS_MODELS, isCpStatsModel } from './stats-versions';
import { SAMPLE_KINDS, SKIP_REASONS } from './stats-sampling';
import { resolveClass } from './upgrade-planner/class-names';

export const GOLD_LABELS: Record<string,string> = {zero:'0 gold',under100k:'<100k','100to500k':'100k–500k','500kto1m':'500k–1m','1to5m':'1–5m','5to10m':'5–10m',over10m:'10m+'};
export const ASSUMPTION_LABELS: Record<string,string> = {standard:'Standard costs','unlimited-stones':'Unlimited Chaos Stones','non-gold-materials':'Non-gold materials assumed',mixed:'Mixed assumptions',unrecorded:'Not recorded (legacy)'};
export const MODEL_LABELS:Record<string,string> = {'cp-2026-10-25':'Historical mixed CP · Oct 25–26','cp-2026-10-26-vambraces-v1':'Corrected CP · Oct 26'};
export const SKIP_LABELS:Record<string,string> = {'no-context':'No simulation context','baseline-mismatch':'Baseline CP mismatch','over-willpower':'Excess Willpower','unknown-class':'Unknown class','unknown-region':'Unknown region','invalid-item-level':'Invalid item level','missing-item-level':'Missing item level','invalid-values':'Invalid calculation','unsettled':'Calculation still settling','no-positive-gain':'No positive gain','no-priced-candidate':'No priced upgrade','unmounted':'Dialog unmounted','observation-error':'Observation error'};
const gains = new Set<string>(CP_BUCKETS.map(([key])=>key));
const assumptions = new Set(Object.keys(ASSUMPTION_LABELS));
const categories = new Set<string>(UPGRADE_CATEGORIES);
const cohort=(p:string[],offset=0)=>isCpStatsModel(p[offset])&&['NA','CE'].includes(p[offset+1])&&
	resolveClass(p[offset+2])===p[offset+2]&&['dealer','support'].includes(p[offset+3])&&LEVEL_BUCKETS.some(([k])=>k===p[offset+4]);
const schema=(s:string)=>s==='2'||s==='3';
const coverage=(s:string)=>['complete','partial','unpriced'].includes(s);
export type SampleRow = { dimensions:string[]; count:number };

/** Summarize recorded joint cells, not marginal counters; each qualifying cell is counted once. */
function summarize(counts:Record<string,number>, prefix:string, valid:(parts:string[])=>boolean, group:(parts:string[])=>string[]):SampleRow[] {
	const rows=new Map<string,SampleRow>();
	for(const [field,count] of Object.entries(counts)) {
		if(!field.startsWith(prefix)||!Number.isSafeInteger(count)||count<=0)continue;
		const parts=field.slice(prefix.length).split(':');
		if(!valid(parts))continue;
		const dimensions=group(parts), key=JSON.stringify(dimensions), row=rows.get(key);
		if(row)row.count+=count;else rows.set(key,{dimensions,count});
	}
	return [...rows.values()].sort((a,b)=>b.count-a.count||a.dimensions.join(':').localeCompare(b.dimensions.join(':')));
}

export function budgetCurves(counts:Record<string,number>,model?:string):SampleRow[] {
	return summarize(counts,'budget:curve:',p=>p.length===9&&cohort(p)&&(!model||p[0]===model)&&(GOLD_BUCKETS as readonly string[]).includes(p[5])&&gains.has(p[6])&&['none','some','all','na'].includes(p[7])&&assumptions.has(p[8]),p=>[p[0],p[5],p[6],p[7],p[8]]);
}
export function affordableOffers(counts:Record<string,number>,model?:string,priced='all'):SampleRow[] {
	return summarize(counts,'opportunity:offer-context:',p=>p.length===11&&schema(p[0])&&cohort(p,1)&&(!model||p[1]===model)&&
		['complete','partial'].includes(p[6])&&(priced==='all'||p[6]===priced)&&assumptions.has(p[7])&&(BUDGET_BANDS as readonly string[]).includes(p[8])&&categories.has(p[9])&&gains.has(p[10]),
		p=>[p[0],p[1],p[6],p[8],p[9],p[10],p[7]]);
}
export function choicePairs(counts:Record<string,number>,model?:string,priced='all'):SampleRow[] {
	return summarize(counts,'decision:comparison:',p=>p.length===14&&schema(p[0])&&cohort(p,1)&&(!model||p[1]===model)&&
		['cp','gold'].includes(p[6])&&coverage(p[7])&&(priced==='all'||p[7]===priced)&&assumptions.has(p[8])&&
		(p[9]==='none'||categories.has(p[9]))&&categories.has(p[10])&&['best','other','unpriced'].includes(p[11])&&gains.has(p[12])&&
		(p[13]==='unpriced'||(GOLD_BUCKETS as readonly string[]).includes(p[13])),p=>[p[0],p[1],...p.slice(6)]);
}
export function recommendations(counts:Record<string,number>,model?:string,priced='all'):SampleRow[] {
	return summarize(counts,'opportunity:outcome:',p=>p.length===9&&schema(p[0])&&cohort(p,1)&&(!model||p[1]===model)&&
		['complete','partial'].includes(p[6])&&(priced==='all'||p[6]===priced)&&assumptions.has(p[7])&&categories.has(p[8]),p=>[p[0],p[1],p[6],p[7],p[8]]);
}

export function samplingDiagnostics(counts:Record<string,number>) {
	const count=(key:string)=>Number.isSafeInteger(counts[key])&&counts[key]>0?counts[key]:0;
	return CP_STATS_MODELS.flatMap(model=>SAMPLE_KINDS.flatMap(kind=>{
		const attempts=count(`sampling:attempt:${model}:${kind}`), sampled=count(`sampling:outcome:${model}:${kind}:sampled`);
		const skipped=SKIP_REASONS.map(reason=>({reason,count:count(`sampling:outcome:${model}:${kind}:${reason}`)})).filter(r=>r.count);
		const excluded=skipped.reduce((n,r)=>n+r.count,0), difference=attempts-sampled-excluded;
		return attempts||sampled||excluded?[{model,kind,attempts,sampled,excluded,skipped,difference}]:[];
	}));
}
