import type { ReplayHit } from '$lib/logs/protocol';
import { replayHitRatio, type HitContext } from './dps-replay';
import type { StatDeltas } from './dps-stats';
import { critConversionFromValues, type CritConversion } from './crit-conversion';

interface StatOption { type?: string; keyStat?: string; keyIndex?: number; value?: number }
interface BuffLevel { passiveOptions?: StatOption[]; statusEffectValues?: number[] }
export interface RuntimeBuff {
	id?: number; name?: string | null; type?: string; overlap?: number; uniqueGroup?: number;
	sourceSkills?: number[] | null; perLevelData?: Record<string,BuffLevel>;
}
interface PassiveAddon { type?: string; statType?: string; keyIndex?: number; keyValue?: number; includeEffectNodeId?: number; excludeEffectNodeId?: number }
export interface RuntimePassive { levels?: Record<string,{addons?: PassiveAddon[]}> }
export interface RuntimeAbility { featureType?: string; levels?: Record<string,{values?: number[]}> }
export interface RuntimeContextTables {
	buffs: Record<string,RuntimeBuff>;
	passives?: Record<string,RuntimePassive>;
	abilities?: Record<string,RuntimeAbility>;
	combatEffects?: Record<string,{effects?:{actions?:{actionType?:string}[]}[]}>;
}
export type Bucket = 'mainStat' | 'weaponPower' | 'flatAttack' | 'supportAttack' | 'attackPowerPct' | 'baseAttackPct' | 'additionalDamage' | 'critRate' | 'primaryCritDamageRate' | 'evolutionDamage';
export interface ContextIssue { source: number | string; reason: string }
export interface ContextContribution { source: number; name: string; bucket: Bucket; amount: number }
export interface ContextInputs {
	/** Static, inspected totals excluding the active buffs and selected passive contributions decoded below. */
	baseline?: HitContext;
	/** Optional stat-change projection; returned context is valid only for these deltas. */
	delta?: StatDeltas;
	baselineMatchesLog?: boolean;
	mainStatKey?: 'str' | 'dex' | 'int';
	levels?: Record<number,number>;
	stacks?: Record<number,number>;
	casterAttack?: Record<number,number>;
	passiveNodes?: {id:number;lv:number}[];
	recordedSources?: Record<number,{skill?:number;name?:string;uniqueGroup?:number}>;
	critRatePerPoint?: number;
}
export interface ContextAudit {
	context: HitContext | null;
	/** null means a complete context audit; a list identifies projection-only buckets. */
	dependencies: Bucket[] | null;
	totals: Partial<Record<Bucket,number>>;
	contributions: ContextContribution[];
	issues: ContextIssue[];
	conversion: CritConversion | null;
}

const STAT_MAP: Record<string,[Bucket,number]> = {
	critical_hit_rate:['critRate',10000], critical_dam_rate:['primaryCritDamageRate',10000],
	evolution_dam_rate:['evolutionDamage',10000], attack_power_rate:['attackPowerPct',10000],
	attack_power_base_multiplier:['baseAttackPct',10000], skill_damage_rate:['additionalDamage',10000],
	attack_power_addend_2:['flatAttack',1], weapon_power:['weaponPower',1]
};
// These are independent, unchanged multipliers for the stat deltas supported by dps-replay.ts.
// They cancel in same-hit replay; they would need values for nDPS or changes to those effects themselves.
const FIXED_STATS = new Set(['skill_damage_sub_rate_1','skill_damage_sub_rate_2','attack_power_sub_rate_1','attack_power_sub_rate_2',
	'physical_inc_rate','magical_inc_rate','physical_inc_sub_rate_1','magical_inc_sub_rate_1','physical_inc_sub_rate_2','magical_inc_sub_rate_2','def_x','res_x']);
const FIXED_TYPES = new Set(['skill_damage_amplify','directional_attack_amplify','instant_stat_amplify_by_contents']);
const NON_DAMAGE_TYPES = new Set(['shield','heal','super_armor','paralyzation','burn','invoke_skill_effect']);
const NON_DAMAGE_STATS = new Set(['max_hp','max_hp_x','hp','max_mp','max_mp_x','mp','ultimate_awakening_dam_rate']);

/** Buckets that cannot cancel in a same-hit ratio for this change. Crit conversion couples crit and evolution. */
export function replayDependencies(delta: StatDeltas): Bucket[] {
 const needed = new Set<Bucket>();
 if (delta.mainStat || delta.weaponPower || delta.attackPower || delta.baseAttackPct)
  for (const bucket of ['mainStat','weaponPower','flatAttack','supportAttack','baseAttackPct'] as const) needed.add(bucket);
 if (delta.attackPowerPct) needed.add('attackPowerPct');
 if (delta.additionalDamage) needed.add('additionalDamage');
 if (delta.critRate || delta.evolutionDamage)
  for (const bucket of ['critRate','primaryCritDamageRate','evolutionDamage'] as const) needed.add(bucket);
 if (delta.critDamage) needed.add('primaryCritDamageRate');
 return [...needed];
}

/** Use this for projected audits: unrelated deltas must not reuse an incomplete context. */
export function replayAuditedHitRatio(hit: ReplayHit, audit: ContextAudit, delta: StatDeltas): number | null {
	if (!audit.context) return null;
	if (audit.dependencies && replayDependencies(delta).some(bucket => !audit.dependencies!.includes(bucket))) return null;
	return replayHitRatio(hit, audit.context, delta);
}

/** Index direct and meter-composed IDs. Collisions remain ambiguous instead of selecting an arbitrary source. */
export function contextDecoder(tables: RuntimeContextTables) {
	const aliases = new Map<number,RuntimeBuff[]>();
	const ids = new WeakMap<RuntimeBuff,number>();
	for (const [key,buff] of Object.entries(tables.buffs)) {
		const id = buff.id ?? Number(key);
		if (!Number.isSafeInteger(id)) continue;
		ids.set(buff,id);
		for (const source of buff.sourceSkills ?? []) {
			if (!Number.isSafeInteger(source)) continue;
			const alias = 1_000_000_000 + id + source;
			const entries = aliases.get(alias) ?? [];
			if (!entries.includes(buff)) entries.push(buff);
			aliases.set(alias,entries);
		}
	}
	return (hit: ReplayHit, inputs: ContextInputs = {}): ContextAudit => {
		const dependencies = inputs.delta ? replayDependencies(inputs.delta) : null;
		const relevant = (bucket: Bucket) => !dependencies || dependencies.includes(bucket);
		const knownBucket = (key: string | undefined): Bucket | undefined => key === 'criticalhit' ? 'critRate' : key && ['str','dex','agi','int'].includes(key) ? 'mainStat' : key ? STAT_MAP[key]?.[0] : undefined;
		const irrelevantStat = (key: string | undefined) => !!key && (FIXED_STATS.has(key) || NON_DAMAGE_STATS.has(key) || !!knownBucket(key) && !relevant(knownBucket(key)!));
		const issues: ContextIssue[] = [], contributions: ContextContribution[] = [];
		const totals: ContextAudit['totals'] = {};
		let conversion: CritConversion | null = null;
		const uniqueGroups = new Map<number,number>();
		const issue = (source:number|string,reason:string) => issues.push({source,reason});
		const add = (source:number,name:string,bucket:Bucket,amount:number) => {
			if (!relevant(bucket)) return;
			if (!Number.isFinite(amount)) {issue(source,'Invalid numeric effect');return;}
			if (!amount) return;
			totals[bucket] = (totals[bucket] ?? 0) + amount;
			contributions.push({source,name,bucket,amount});
		};
		const stat = (source:number,name:string,key:string|undefined,value:number|undefined,multiplier=1) => {
			if (irrelevantStat(key)) return;
			if (typeof value !== 'number' || !Number.isFinite(value)) {issue(source,'Stat value unavailable');return;}
			if (!value || key && (FIXED_STATS.has(key) || NON_DAMAGE_STATS.has(key))) return;
			if (key === 'criticalhit') {
				if (inputs.critRatePerPoint === undefined || !Number.isFinite(inputs.critRatePerPoint) || inputs.critRatePerPoint <= 0) issue(source,'Level-specific Crit-points conversion required');
				else add(source,name,'critRate',value*multiplier*inputs.critRatePerPoint);
				return;
			}
			if (key && ['str','dex','agi','int'].includes(key)) {
				if (!inputs.mainStatKey) issue(source,'Main-stat identity required');
				else if ((key === 'agi' ? 'dex' : key) === inputs.mainStatKey) add(source,name,'mainStat',value*multiplier);
				return;
			}
			const map = key ? STAT_MAP[key] : undefined;
			if (!map) {issue(source,`Unresolved stat ${key ?? '(missing)'}`);return;}
			add(source,name,map[0],value/map[1]*multiplier);
		};
		if (!Array.isArray(hit.buffedBy) || !Array.isArray(hit.debuffedBy)) issue('hit','Active buff/debuff lists unavailable');
		for (const observed of new Set([...(hit.buffedBy ?? []),...(hit.debuffedBy ?? [])])) {
			const direct = tables.buffs[String(observed)];
			const recorded = inputs.recordedSources?.[observed];
			let matches = direct ? [direct] : aliases.get(observed) ?? [];
			if (!direct && recorded?.skill !== undefined) matches = matches.filter(buff => ids.get(buff) === observed-1_000_000_000-recorded.skill!);
			if (matches.length !== 1) {issue(observed,matches.length ? 'Ambiguous composed buff ID' : 'Buff definition unavailable');continue;}
			const buff = matches[0], levels = Object.entries(buff.perLevelData ?? {});
			if (recorded && ((recorded.name && buff.name && recorded.name !== buff.name) || (recorded.uniqueGroup !== undefined && buff.uniqueGroup !== undefined && recorded.uniqueGroup !== buff.uniqueGroup))) {
				issue(observed,'Recorded buff metadata does not match runtime definition');continue;
			}
			if (NON_DAMAGE_TYPES.has(buff.type ?? '') && levels.length && levels.every(([,l]) => (l.passiveOptions ?? []).every(o => o.type === 'stat' && NON_DAMAGE_STATS.has(o.keyStat ?? '')))) continue;
			// Inspect every possible level before ignoring a source: an unknown effect remains blocking.
			if (dependencies && levels.length && levels.every(([,l]) =>
				(l.passiveOptions ?? []).every(o => o.type === 'stat' && irrelevantStat(o.keyStat)) &&
				(buff.type === 'instant_stat_amplify' ? !relevant('critRate') && !relevant('primaryCritDamageRate') :
				 buff.type === 'attack_power_amplify' ? !relevant('supportAttack') :
				 FIXED_TYPES.has(buff.type ?? '') || NON_DAMAGE_TYPES.has(buff.type ?? '') || buff.type === 'none' && !!l.passiveOptions?.length)
			)) continue;
			if (buff.uniqueGroup) {
				if (uniqueGroups.has(buff.uniqueGroup)) {issue(observed,'Shared unique buff group has unverified stacking rules');continue;}
				uniqueGroups.set(buff.uniqueGroup,observed);
			}
			const explicit = inputs.levels?.[observed];
			const level = explicit !== undefined ? buff.perLevelData?.[String(explicit)] : levels.length === 1 ? levels[0][1] : undefined;
			if (!level) {issue(observed,explicit !== undefined ? 'Requested buff level unavailable' : 'Buff level required');continue;}
			const name = buff.name ?? `Buff ${buff.id ?? observed}`;
			const suppliedStacks = inputs.stacks?.[observed];
			if ((buff.overlap ?? 0) > 1 && suppliedStacks === undefined) {issue(observed,'Buff stack count required');continue;}
			const stacks = suppliedStacks ?? 1;
			if (!Number.isInteger(stacks) || stacks < 1 || stacks > Math.max(1,buff.overlap ?? 1)) {issue(observed,'Invalid buff stack count');continue;}
			for (const option of level.passiveOptions ?? []) {
				if (option.type === 'combat_effect') {
					const effects = tables.combatEffects?.[String(option.keyIndex)]?.effects;
					if (!effects?.length || effects.some(e => !e.actions?.length || e.actions.some(a => !['modify_damage','exec_start_skill','modify_damage_shield_multiplier'].includes(a.actionType ?? ''))))
						issue(observed,`Unresolved combat_effect option ${option.keyIndex ?? ''}`);
				} else if (option.type !== 'stat') issue(observed,`Unresolved ${option.type ?? 'unknown'} option ${option.keyIndex ?? ''}`);
				else stat(observed,name,option.keyStat,option.value,stacks);
			}
			const values = level.statusEffectValues ?? [];
			if (buff.type === 'instant_stat_amplify') {
				add(observed,name,'critRate',(values[0] ?? 0)/10000*stacks);
				add(observed,name,'primaryCritDamageRate',(values[1] ?? 0)/10000*stacks);
				if (relevant('primaryCritDamageRate') && (values[9] || values[10])) issue(observed,'Hit-specific physical/magical crit amplification unresolved');
			} else if (buff.type === 'attack_power_amplify') {
				const caster = inputs.casterAttack?.[observed];
				if (!relevant('supportAttack')) continue;
				if (caster === undefined || !Number.isFinite(caster) || caster <= 0) issue(observed,'Casting support base attack required');
				else add(observed,name,'supportAttack',caster*(values[0] ?? 0)/10000*stacks);
			} else if (!FIXED_TYPES.has(buff.type ?? '') && !NON_DAMAGE_TYPES.has(buff.type ?? '') && !['none','evolution_type_damage'].includes(buff.type ?? '')) issue(observed,`Unresolved buff type ${buff.type ?? '(missing)'}`);
			if (buff.type === 'none' && !(level.passiveOptions?.length)) issue(observed,'Effect has no usable numeric definition');
		}
		for (const node of inputs.passiveNodes ?? []) {
			const level = tables.passives?.[String(node.id)]?.levels?.[String(node.lv)];
			if (!level) {issue(node.id,'Ark Passive definition/level unavailable');continue;}
			for (const addon of level.addons ?? []) {
				if (addon.type === 'stat' && irrelevantStat(addon.statType)) continue;
				if (addon.includeEffectNodeId || addon.excludeEffectNodeId) {issue(node.id,'Conditional passive applicability unresolved');continue;}
				if (addon.type === 'stat') stat(node.id,`Passive ${node.id}`,addon.statType,addon.keyValue);
				else if (addon.type === 'ability_feature') {
					const ability = tables.abilities?.[String(addon.keyIndex)];
					if (ability?.featureType !== 'blocky_thorn') {issue(node.id,`Unresolved ability feature ${addon.keyIndex ?? ''}`);continue;}
					if (dependencies && !relevant('critRate') && !relevant('evolutionDamage')) continue;
					const decoded = critConversionFromValues(ability.levels?.[String(addon.keyValue)]?.values);
					if (!decoded) issue(node.id,'Invalid crit conversion parameters');
					else if (conversion) issue(node.id,'Multiple crit-conversion rules');
					else conversion = decoded;
				} else issue(node.id,`Unresolved passive addon ${addon.type ?? '(missing)'}`);
			}
		}
		if (!inputs.baseline || inputs.baselineMatchesLog !== true) issue('baseline','Matching inspected static baseline unavailable');
		let context: HitContext | null = inputs.baseline ? {...inputs.baseline} : null;
		if (context) {
			if (inputs.delta?.critDamage && context.primaryCritDamageRate === undefined)
				issue('baseline','Primary crit-damage bucket required for crit-damage projection');
			const critDamage = totals.primaryCritDamageRate ?? 0;
			if (critDamage && context.primaryCritDamageRate === undefined) issue('baseline','Primary crit-damage bucket required; aggregate multiplier is insufficient');
			else if (critDamage) {
				context.critMultiplier *= (1+context.primaryCritDamageRate!+critDamage)/(1+context.primaryCritDamageRate!);
				context.primaryCritDamageRate! += critDamage;
			}
			for (const [bucket,amount] of Object.entries(totals)) if (bucket !== 'primaryCritDamageRate') {
				const key = bucket as Exclude<Bucket,'primaryCritDamageRate'>;
				context[key] = (context[key] ?? 0) + amount;
			}
			if (conversion) {context.critConversion = conversion;context.critCap = conversion.threshold;}
			if (replayHitRatio({...hit,hyper:false},context,{mainStat:0,weaponPower:0,attackPower:0,attackPowerPct:0,additionalDamage:0,critRate:0,critDamage:0}) === null)
				issue('baseline','Invalid reconstructed numeric context');
		}
		return {context:issues.length ? null : context,dependencies,totals,contributions,issues,conversion};
	};
}
