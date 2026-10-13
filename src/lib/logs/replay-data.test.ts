import { describe, expect, it } from 'vitest';
import { replayRun } from './replay-data';

const encounter = {id:1,start:100,boss:'Boss',difficulty:'Hard',cleared:true,player:'Soulshan',duration:10000};
describe('replay log extraction', () => {
	it('retains actual hits, hyper flags, gem levels, and build-quality metadata', () => {
		const run = replayRun(encounter,{'123':{name:'Skill',totalDamage:100,hits:2,crits:1,gemDamage:9,gemCooldown:8,isHyperAwakening:true,
			skillCastLog:[{hits:[{damage:40,crit:false},{damage:60,crit:true}]}]}},
			{contributionSplits:[{name:'soulshan',damageDoneWithAllCrits:300,damageDoneWithoutCrits:100,bluntThornEfficiency:{damageDoneByStat:10}}]},6000,'hash');
		expect(run.totalDamage).toBe(100);
		expect(run.hits).toEqual([{skill:123,damage:40,crit:false,hyper:true},{skill:123,damage:60,crit:true,hyper:true}]);
		expect(run.skills[0]).toMatchObject({damageGem:9,cooldownGem:8});
		expect(run).toMatchObject({combatPower:6000,loadoutHash:'hash',effectiveCritMultiplier:3,critConversion:true});
	});
	it('does not invent missing hit flags, crit context or build values', () => {
		const run = replayRun(encounter,{'123':{total_damage:100,skillCastLog:[{hits:[{damage:100}]}]}},null);
		expect(run.hits).toEqual([]);
		expect(run.totalDamage).toBe(100);
		expect(run.effectiveCritMultiplier).toBeNull();
		expect(run.combatPower).toBeNull();
	});
	it('preserves the recorded buff IDs, timestamp, meter version and passive selections', () => {
		const run = replayRun(encounter,{'123':{totalDamage:100,skillCastLog:[{hits:[{damage:100,crit:true,timestamp:50,buffedBy:[10,1000000110,-1],debuffedBy:[]}]}]}},
			{version:'1.51.2'},6000,'hash','Build A',JSON.stringify({evolution:[{id:40,lv:2}],arkGridOrder:{sun:3}}),
			{1000000110:{uniqueGroup:5,source:{name:'Crit synergy',skill:{id:100}}}});
		expect(run.hits[0]).toMatchObject({timestamp:50,buffedBy:[10,1000000110],debuffedBy:[]});
		expect(run.arkPassives).toEqual({evolution:[{id:40,lv:2}]});
		expect(run).toMatchObject({meterVersion:'1.51.2',buildSpec:'Build A'});
		expect(run.buffSources?.[1000000110]).toEqual({name:'Crit synergy',skill:100,uniqueGroup:5});
	});
});
