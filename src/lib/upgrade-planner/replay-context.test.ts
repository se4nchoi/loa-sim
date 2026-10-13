import { describe, expect, it } from 'vitest';
import { contextDecoder, replayAuditedHitRatio, type RuntimeContextTables } from './replay-context';
import { replayHitRatio, type HitContext } from './dps-replay';
import realRun from './fixtures/dps-soulshan-hits.json';

const baseline: HitContext = {mainStat:600000,weaponPower:250000,flatAttack:0,supportAttack:0,baseAttackPct:0.1,attackPowerPct:0,additionalDamage:0.5,
	critRate:0.7,critMultiplier:2.4,primaryCritDamageRate:1,critCap:1,evolutionDamage:0.6};
const hit = {skill:1,damage:100,crit:true,hyper:false,buffedBy:[10],debuffedBy:[]};
const tables: RuntimeContextTables = {buffs:{
	10:{id:10,name:'Crit synergy',type:'instant_stat_amplify',sourceSkills:[100],perLevelData:{1:{passiveOptions:[],statusEffectValues:[1000,2000,0,0,0,0,0,600]}}},
	20:{id:20,name:'Stacked attack',type:'none',overlap:6,perLevelData:{1:{passiveOptions:[{type:'stat',keyStat:'attack_power_rate',value:90}]}}},
	30:{id:30,name:'Support attack',type:'attack_power_amplify',perLevelData:{1:{statusEffectValues:[1600]},2:{statusEffectValues:[1800]}}}
},passives:{40:{levels:{2:{addons:[{type:'stat',statType:'evolution_dam_rate',keyValue:1500},{type:'ability_feature',keyIndex:50,keyValue:2}]}}}},
	abilities:{50:{featureType:'blocky_thorn',levels:{2:{values:[8000,15000,6000]}}}}};

describe('runtime context provenance', () => {
	it('decodes direct and composed IDs and preserves the primary crit-damage bucket', () => {
		const decode = contextDecoder(tables);
		for (const id of [10,1000000110]) {
			const r = decode({...hit,buffedBy:[id]}, {baseline,baselineMatchesLog:true});
			expect(r.issues).toEqual([]);
			expect(r.context?.critRate).toBeCloseTo(0.8,12);
			expect(r.context?.primaryCritDamageRate).toBeCloseTo(1.2,12);
			expect(r.context?.critMultiplier).toBeCloseTo(2.64,12); // Preserve the separate 1.2x multiplier.
		}
	});
	it('requires a matched inspected baseline, rather than promoting an audited buff list into a full context', () => {
		const r = contextDecoder(tables)(hit,{baseline});
		expect(r.context).toBeNull();
		expect(r.totals.critRate).toBeCloseTo(0.1,12);
		expect(r.issues.some(i=>i.reason.includes('Matching inspected'))).toBe(true);
	});
	it('does not infer Adrenaline stacks, and applies supplied stacks once', () => {
		const decode = contextDecoder(tables), h={...hit,buffedBy:[20,20]};
		expect(decode(h,{baseline,baselineMatchesLog:true}).issues[0].reason).toContain('stack count required');
		const r=decode(h,{baseline,baselineMatchesLog:true,stacks:{20:6}});
		expect(r.context?.attackPowerPct).toBeCloseTo(0.054,12);
		expect(decode(h,{baseline,baselineMatchesLog:true,stacks:{20:7}}).context).toBeNull();
	});
	it('requires both buff level and caster base attack for support addends', () => {
		const decode=contextDecoder(tables),h={...hit,buffedBy:[30]};
		expect(decode(h,{baseline,baselineMatchesLog:true}).issues[0].reason).toContain('Buff level required');
		expect(decode(h,{baseline,baselineMatchesLog:true,levels:{30:1}}).context).toBeNull();
		const r=decode(h,{baseline,baselineMatchesLog:true,levels:{30:1},casterAttack:{30:166260}});
		expect(r.context?.supportAttack).toBeCloseTo(26601.6,9);
	});
	it('resolves selected passive levels with a separate base evolution bonus and conversion cap', () => {
		const r=contextDecoder(tables)({...hit,buffedBy:[]},{baseline,baselineMatchesLog:true,passiveNodes:[{id:40,lv:2}]});
		expect(r.context?.evolutionDamage).toBeCloseTo(0.75,12);
		expect(r.context?.critConversion).toEqual({threshold:0.8,ratio:1.5,maxBonus:0.6});
		expect(r.context?.critCap).toBe(0.8);
	});
	it('does not choose between composed-ID collisions or overlapping unique groups', () => {
		const ambiguous=structuredClone(tables);ambiguous.buffs[11]={...ambiguous.buffs[10],id:11,sourceSkills:[99]};
		expect(contextDecoder(ambiguous)({...hit,buffedBy:[1000000110]},{baseline,baselineMatchesLog:true}).issues[0].reason).toContain('Ambiguous');
		ambiguous.buffs[10].uniqueGroup=123;ambiguous.buffs[11].uniqueGroup=123;
		expect(contextDecoder(ambiguous)({...hit,buffedBy:[10,11]},{baseline,baselineMatchesLog:true}).issues[0].reason).toContain('unique buff group');
	});
	it('uses the recorded source skill to disambiguate composed IDs and rejects mismatched versions', () => {
		const ambiguous=structuredClone(tables);ambiguous.buffs[11]={...ambiguous.buffs[10],id:11,sourceSkills:[99],name:'Other synergy'};
		const h={...hit,buffedBy:[1000000110]};
		const decode=contextDecoder(ambiguous);
		const r=decode(h,{baseline,baselineMatchesLog:true,recordedSources:{1000000110:{skill:100,name:'Crit synergy'}}});
		expect(r.context?.critRate).toBeCloseTo(0.8,12);
		expect(decode(h,{baseline,baselineMatchesLog:true,recordedSources:{1000000110:{skill:100,name:'Changed definition'}}}).context).toBeNull();
	});
	it('derives the base buff ID from the real recorded Moonfall source instead of guessing among aliases', () => {
		const observed=1000341569;
		const metadata=realRun.buffSources['1000341569'];
		expect(metadata.skill).toBe(31051);
		const id=observed-1000000000-metadata.skill!;
		expect(id).toBe(310518);
		// Synthetic definitions use the actual recorded identity to isolate collision resolution from numerical effects.
		const buffs={
			[id]:{id,name:metadata.name,type:'none',sourceSkills:[metadata.skill!],perLevelData:{1:{passiveOptions:[{type:'stat',keyStat:'critical_hit_rate',value:1000}]}}},
			[id+1]:{id:id+1,name:'Other',type:'none',sourceSkills:[metadata.skill!-1],perLevelData:{1:{passiveOptions:[{type:'stat',keyStat:'critical_hit_rate',value:2000}]}}}
		};
		const r=contextDecoder({buffs})({...hit,buffedBy:[observed]},{baseline,baselineMatchesLog:true,recordedSources:{[observed]:metadata}});
		expect(r.context?.critRate).toBeCloseTo(0.8,12);
	});
	it('keeps non-damage effects out but preserves numeric damage modifiers on shield buffs', () => {
		const altered=structuredClone(tables);
		altered.buffs[60]={id:60,type:'shield',perLevelData:{1:{passiveOptions:[],statusEffectValues:[0,0,1000]}}};
		altered.buffs[61]={id:61,type:'shield',perLevelData:{1:{passiveOptions:[{type:'stat',keyStat:'critical_hit_rate',value:1000}]}}};
		const r=contextDecoder(altered)({...hit,buffedBy:[60,61]},{baseline,baselineMatchesLog:true});
		expect(r.context?.critRate).toBeCloseTo(0.8,12);
	});
	it('uses an explicit level-specific Crit-points conversion and cancels known unchanged combat effects', () => {
		const altered=structuredClone(tables);
		altered.buffs[60]={id:60,type:'none',perLevelData:{1:{passiveOptions:[{type:'stat',keyStat:'criticalhit',value:100}]}}};
		altered.buffs[61]={id:61,type:'none',perLevelData:{1:{passiveOptions:[{type:'combat_effect',keyIndex:900}]}}};
		altered.combatEffects={900:{effects:[{actions:[{actionType:'modify_damage'}]}]}};
		const r=contextDecoder(altered)({...hit,buffedBy:[60,61]},{baseline,baselineMatchesLog:true,critRatePerPoint:0.00035});
		expect(r.context?.critRate).toBeCloseTo(0.735,12);
	});
	it('blocks missing lists, hidden numeric effects, unknown options, and conditional passives', () => {
		const altered=structuredClone(tables);
		altered.buffs[60]={id:60,name:'Description-only ability',type:'none',perLevelData:{1:{passiveOptions:[],statusEffectValues:[0]}}};
		altered.buffs[61]={id:61,name:'Conditional',type:'none',perLevelData:{1:{passiveOptions:[{type:'combat_effect',keyIndex:123,value:0}]}}};
		altered.passives![40].levels![2].addons![0].includeEffectNodeId=42;
		const decode=contextDecoder(altered);
		for (const h of [{...hit,buffedBy:undefined}, {...hit,buffedBy:[60]}, {...hit,buffedBy:[61]}])
			expect(decode(h,{baseline,baselineMatchesLog:true}).context).toBeNull();
		expect(decode({...hit,buffedBy:[]},{baseline,baselineMatchesLog:true,passiveNodes:[{id:40,lv:2}]}).context).toBeNull();
	});
	it('uses the known primary bucket for future crit-damage upgrades instead of adding to the aggregate multiplier', () => {
		const r=contextDecoder(tables)(hit,{baseline,baselineMatchesLog:true});
		const ratio=replayHitRatio(hit,r.context!,{mainStat:0,weaponPower:0,attackPower:0,attackPowerPct:0,additionalDamage:0,critRate:0,critDamage:10});
		expect(ratio).toBeCloseTo(2.3/2.2,12);
	});
});

describe('dependency-specific reconstruction', () => {
 const delta = {mainStat:0,weaponPower:0,attackPower:0,attackPowerPct:0,additionalDamage:1,critRate:0,critDamage:0};
 it('allows additional damage without unrelated crit levels, stacks, or caster attack', () => {
  const t: RuntimeContextTables = {buffs:{
   1:{type:'instant_stat_amplify',overlap:6,perLevelData:{1:{statusEffectValues:[1000]},2:{statusEffectValues:[2000]}}},
   2:{type:'attack_power_amplify',perLevelData:{1:{statusEffectValues:[1600]},2:{statusEffectValues:[1700]}}}
  }};
  const h={...hit,buffedBy:[1,2]};
  const decode=contextDecoder(t);
  expect(decode(h,{baseline,baselineMatchesLog:true}).context).toBeNull();
  const r=decode(h,{baseline,baselineMatchesLog:true,delta});
  expect(r.issues).toEqual([]);
  expect(r.dependencies).toEqual(['additionalDamage']);
  expect(r.context).not.toBeNull();
  expect(replayAuditedHitRatio(h,r,delta)).toBeCloseTo(1+0.01/1.5,12);
  expect(replayAuditedHitRatio(h,r,{...delta,weaponPower:1000})).toBeNull();
 });
 it('keeps support attack required for weapon-power changes', () => {
  const t:RuntimeContextTables={buffs:{2:{type:'attack_power_amplify',perLevelData:{1:{statusEffectValues:[1600]}}}}};
  const r=contextDecoder(t)({...hit,buffedBy:[2]},{baseline,baselineMatchesLog:true,delta:{...delta,additionalDamage:0,weaponPower:1000}});
  expect(r.context).toBeNull();
  expect(r.issues.some(i=>i.reason.includes('Casting support'))).toBe(true);
 });
 it('does not hide unknown sources or effects behind projection', () => {
  const t:RuntimeContextTables={buffs:{1:{type:'none',perLevelData:{1:{passiveOptions:[{type:'stat',keyStat:'unknown',value:10}]}}}}};
  expect(contextDecoder(t)({...hit,buffedBy:[1]},{baseline,baselineMatchesLog:true,delta}).context).toBeNull();
  expect(contextDecoder(t)({...hit,buffedBy:[999]},{baseline,baselineMatchesLog:true,delta}).context).toBeNull();
 });
 it('checks every possible buff level before ignoring it', () => {
  const t:RuntimeContextTables={buffs:{1:{type:'none',perLevelData:{1:{passiveOptions:[{type:'stat',keyStat:'critical_hit_rate',value:1000}]},2:{passiveOptions:[{type:'stat',keyStat:'skill_damage_rate',value:1000}]}}}}};
  expect(contextDecoder(t)({...hit,buffedBy:[1]},{baseline,baselineMatchesLog:true,delta}).issues.some(i=>i.reason==='Buff level required')).toBe(true);
 });
 it('still requires matching inspected provenance', () => {
  expect(contextDecoder({buffs:{}})({...hit,buffedBy:[]},{baseline,delta}).context).toBeNull();
 });
});
