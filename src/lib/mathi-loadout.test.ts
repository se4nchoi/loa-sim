import { expect, it } from 'vitest';
import { decodeMathiLoadout } from './mathi-loadout';
import { bibleSnapshotUrl } from './bible-data';

const raw = () => ({class: 405, combat_power: {id: 1, score: 6620.18}, skills: [{id: 46500, level: 14}],
	equipped_items: [
		{id: 134621440, slot: 0, item_data: {type: 'equipment', honing_level: 24, advanced_honing_state: {stage: 40}, rolled_stats: [{addon_type: 2, tree_id: 100, index: 50, value: 3000, is_base_stat: true}]}},
		{id: 9104550, slot: 11, item_data: {type: 'ability_stone', engravings: [{id: 247, nodes: 9}]}},
		{id: 213400033, slot: 26, item_data: {type: 'bracelet', stats: [{addon_type: 2, index: 15, value: 100}]}},
		{id: 123, slot: 99, item_data: {type: 'future_item', future: true}}
	], gems: [{id: 65031090, slot: 0, effects: [{addon_type: 5, id: 46500, value: 4000}]}],
	loadout: {type: 'ark_passive', engravings: [{id: 1247, grade: 5, progress: 0}], evolution_points: [{id: 100, level: 2}],
		karma: {levels: [{id: 10000, level: 23}, {id: 20000, level: 29}, {id: 30000, level: 28}]}},
	ark_grid: {cores: [{id: 673012435, base_tree_id: 10001, astro_gems: [{id: 40621173, index: 0, core_points: 5, willpower_cost_reduction: 4, options: [{id: 2001, level: 5}]}]}]}
});
it('adapts raw gear, gems, stone nodes, passives, karma and cores while preserving unknown data', () => {
	const value = raw(), s = decodeMathiLoadout(value);
	expect(s.classId).toBe('souleater');
	expect(s.items?.[0]).toMatchObject({slot: 'weapon', data: {honing: 24, advancedHoning: 40, stats: [{type: 2, index: 50, value: 3000, base: true}]}});
	expect(s.items?.[1]).toMatchObject({slot: 'ability_stone', data: {engravings: [{id: 247, nodes: 9}]}});
	expect(s.items?.[2].slot).toBe('bracelet');
	expect(s.items?.[3]).toMatchObject({slot: 'unknown:99', data: {future: true}});
	expect(s.gems?.[0].effects?.[0]).toEqual({type: 5, id: 46500, value: 4000});
	expect(s.engravings?.[0].grade).toBe('engrave_grade05');
	expect(s.karma).toEqual({evolution: 23, enlightenment: 29, leap: 28});
	expect(s.arkPassive?.evolution).toEqual([{id: 100, level: 2}]);
	expect(s.arkGridCores?.[0].gems[0]).toEqual({id: 40621173, idx: 0, corePoints: 5, costReduc: 4, opts: [{id: 2001, level: 5}]});
	expect(s.raw).toEqual(value);
});
it('uses only the approved fixed-host v3 endpoint and rejects invalid versions or shapes', () => {
	expect(bibleSnapshotUrl(`v3/${'a'.repeat(64)}`)).toBe(`https://loadout.mathi.moe/v3/loadouts/by-hash/${'a'.repeat(64)}`);
	for (const hash of ['https://evil.test', `v4/${'a'.repeat(64)}`, 'v3/../x']) expect(() => bibleSnapshotUrl(hash)).toThrow();
	for (const body of [null, {}, {...raw(), class: 99999}, {...raw(), equipped_items: [null]}]) expect(() => decodeMathiLoadout(body)).toThrow();
});
