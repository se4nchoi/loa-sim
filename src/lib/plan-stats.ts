import type { SimState } from './upgrade-planner/simulate';
import { resolveClass } from './upgrade-planner/class-names';
import { CP_STATS_MODEL, type CpStatsModel } from './stats-versions';
import { samplingAttempt, type SamplingAttempt, type SkipReason } from './stats-sampling';

export const CP_BUCKETS = [
	['lower', 'Lower CP'], ['same', 'Unchanged'], ['under1', '<1%'], ['1to3', '1–3%'],
	['3to5', '3–5%'], ['5to10', '5–10%'], ['10to20', '10–20%'], ['over20', '20%+']
] as const;
export const LEVEL_BUCKETS = [
	['under1700', '<1700'], ['1700to1729', '1700–1729'], ['1730to1759', '1730–1759'],
	['1760to1789', '1760–1789'], ['1790to1819', '1790–1819'], ['over1820', '1820+']
] as const;
export const LEVEL_MILESTONES = ['1700','1710','1720','1730','1740','1750','1760','1770','1780','1790','1800','1810','1820'] as const;
export interface PlanObservation {
	cp: typeof CP_BUCKETS[number][0];
	target: typeof LEVEL_BUCKETS[number][0];
	role: 'dealer' | 'support';
	start?: typeof LEVEL_BUCKETS[number][0];
	sections?: PlanSection[];
	dominant?: PlanSection | 'none' | 'tie';
	shape?: 'unchanged' | 'weapon-only' | 'single-system' | 'mixed';
	weapon?: 'under20' | '20to24' | '25' | 'sidereal';
	gems?: 'under9' | '9' | 'some10' | 'all10';
	classId?: string;
	region?: 'NA'|'CE';
	model?: CpStatsModel;
	milestones?: typeof LEVEL_MILESTONES[number][];
}
export const PLAN_SECTIONS = ['gear','accessories','bracelet','skins','gems','engravings','arkGrid','karma','paradise'] as const;
export type PlanSection = typeof PLAN_SECTIONS[number];
const sectionKeys: Record<PlanSection, readonly (keyof SimState)[]> = {gear:['gear','quality','sidereal','bracer'],accessories:['accessories','accessoryStats'],bracelet:['bracelet'],skins:['skins'],gems:['gems'],engravings:['engravings'],arkGrid:['arkGrid'],karma:['karma'],paradise:['paradise']};
export interface PlanContext {
	state: SimState;
	baselineCp: number;
	targetCp: number;
	targetIlvl: number | null;
	consistent: boolean;
	exclusion?: SkipReason;
	support: boolean;
	base?: SimState;
	startIlvl?: number;
	contributions?: Partial<Record<PlanSection,{pct:number}>>;
	classId?: string;
	region?: 'NA'|'CE';
}

export function cpBucket(rawGain:number): typeof CP_BUCKETS[number][0] {
	const gain=Number(rawGain.toFixed(8));
	return gain < -0.005 ? 'lower' : gain < 0.005 ? 'same' : gain < 1 ? 'under1' : gain < 3 ? '1to3'
		: gain < 5 ? '3to5' : gain < 10 ? '5to10' : gain < 20 ? '10to20' : 'over20';
}
export function levelBucket(level:number): typeof LEVEL_BUCKETS[number][0] {
	return level < 1700 ? 'under1700' : level < 1730 ? '1700to1729' : level < 1760 ? '1730to1759'
		: level < 1790 ? '1760to1789' : level < 1820 ? '1790to1819' : 'over1820';
}

export function planSkipReason(context: PlanContext | null | undefined, savedState: SimState): SkipReason | undefined {
	if (!context) return 'no-context';
	if (!context.consistent) return context.exclusion ?? 'baseline-mismatch';
	if (context.targetIlvl===null) return 'missing-item-level';
	if (
		![context.baselineCp, context.targetCp, context.targetIlvl].every(Number.isFinite) ||
		context.baselineCp <= 0 || context.targetCp <= 0) return 'invalid-values';
	if (context.targetIlvl < 1500 || context.targetIlvl > 2000) return 'invalid-item-level';
	if (JSON.stringify(context.state) !== JSON.stringify(savedState)) return 'unsettled';
}

export function savedPlanObservation(context:PlanContext|null|undefined, savedState:SimState): {plan?:PlanObservation;sampling:SamplingAttempt} {
	try {
		const reason=planSkipReason(context,savedState);
		const plan=reason?undefined:planObservation(context,savedState);
		return {plan,sampling:samplingAttempt('plan',reason)};
	} catch { return {sampling:samplingAttempt('plan','observation-error')}; }
}

/** Uses the simulator's settled results, never runs a new CP/honing calculation for telemetry. */
export function planObservation(context: PlanContext | null | undefined, savedState: SimState): PlanObservation | undefined {
	if (planSkipReason(context,savedState) || !context || context.targetIlvl===null) return;
	const out:PlanObservation={cp:cpBucket((context.targetCp/context.baselineCp-1)*100),target:levelBucket(context.targetIlvl),role:context.support?'support':'dealer',model:CP_STATS_MODEL};
	if (context.startIlvl!==undefined && Number.isFinite(context.startIlvl)) {
		out.start=levelBucket(context.startIlvl);
		out.milestones=LEVEL_MILESTONES.filter(level=>Number(level)>context.startIlvl! && Number(level)<=context.targetIlvl!);
	}
	if(context.classId)out.classId=resolveClass(context.classId);
	if(context.region)out.region=context.region;
	if (context.base) {
		const base=context.base;
		const different=(a:unknown,b:unknown)=>JSON.stringify(a)!==JSON.stringify(b);
		out.sections=PLAN_SECTIONS.filter(section=>sectionKeys[section].some(key=>different(base[key],savedState[key])));
		const strength=out.sections.filter(s=>Number.isFinite(context.contributions?.[s]?.pct) && context.contributions![s]!.pct>0)
			.sort((a,b)=>context.contributions![b]!.pct-context.contributions![a]!.pct);
		out.dominant=!strength.length?'none':strength[1]&&Math.abs(context.contributions![strength[0]]!.pct-context.contributions![strength[1]]!.pct)<=1e-8?'tie':strength[0];
		const withoutWeapon=(s:SimState)=>({...s,gear:Object.fromEntries(Object.entries(s.gear).filter(([k])=>k!=='weapon')),
			quality:Object.fromEntries(Object.entries(s.quality).filter(([k])=>k!=='weapon')),sidereal:undefined});
		out.shape=!out.sections.length?'unchanged':out.sections.length>1?'mixed':
			out.sections[0]==='gear' && !different(withoutWeapon(base),withoutWeapon(savedState))?'weapon-only':'single-system';
		if (different(base.gear.weapon,savedState.gear.weapon) || different(base.sidereal,savedState.sidereal)) {
			out.weapon=savedState.sidereal?'sidereal':(savedState.gear.weapon?.honing??0)>=25?'25':(savedState.gear.weapon?.honing??0)>=20?'20to24':'under20';
		}
		if (out.sections.includes('gems') && savedState.gems.length) {
			const max=Math.max(...savedState.gems.map(g=>g.level));
			out.gems=max>=10?savedState.gems.every(g=>g.level>=10)?'all10':'some10':max>=9?'9':'under9';
		}
	}
	return out;
}
