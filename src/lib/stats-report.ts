import { CP_BUCKETS } from './plan-stats';
import { GOLD_BUCKETS, BUDGET_BANDS } from './stats-insights';
import { UPGRADE_CATEGORIES } from './stats-model';

export const GOLD_LABELS: Record<string,string> = {zero:'0 gold',under100k:'<100k','100to500k':'100k–500k','500kto1m':'500k–1m','1to5m':'1–5m','5to10m':'5–10m',over10m:'10m+'};
export const ASSUMPTION_LABELS: Record<string,string> = {standard:'Standard costs','unlimited-stones':'Unlimited Chaos Stones','non-gold-materials':'Non-gold materials assumed',mixed:'Mixed assumptions'};
const gains = new Set<string>(CP_BUCKETS.map(([key])=>key));
const assumptions = new Set(Object.keys(ASSUMPTION_LABELS));
const categories = new Set<string>(UPGRADE_CATEGORIES);
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

export function budgetCurves(counts:Record<string,number>):SampleRow[] {
	return summarize(counts,'budget:curve:',p=>p.length===9&&(GOLD_BUCKETS as readonly string[]).includes(p[5])&&gains.has(p[6])&&['none','some','all','na'].includes(p[7])&&assumptions.has(p[8]),p=>[p[0],p[5],p[6],p[7],p[8]]);
}
export function affordableOffers(counts:Record<string,number>):SampleRow[] {
	return summarize(counts,'opportunity:offer:',p=>p.length===9&&(BUDGET_BANDS as readonly string[]).includes(p[5])&&categories.has(p[6])&&gains.has(p[7])&&assumptions.has(p[8]),p=>[p[0],p[5],p[6],p[7],p[8]]);
}
export function choicePairs(counts:Record<string,number>):SampleRow[] {
	return summarize(counts,'decision:pair:',p=>p.length===4&&['cp','gold'].includes(p[0])&&categories.has(p[1])&&categories.has(p[2])&&assumptions.has(p[3]),p=>p);
}
