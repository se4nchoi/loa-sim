import { beforeEach, describe, expect, it } from 'vitest';
import { pinSimulation, renameSimulation, autosaveSimulation, loadAutosave, deleteSimulation, latestSimulation, parseSimulation, savedSimulations, saveSimulation } from './saved-simulations';
import { initSimState, simulate } from './simulate';
import type { Loadout } from './types';
import soulshan from './fixtures/na-soulshan.json';
import inconsistent from './fixtures/na-soulshan-merged-inconsistent.json';
import { simulationCP } from './saved-simulations';

const loadout = soulshan as unknown as Loadout;
const store = new Map<string, string>();
let blocked = false;
Object.assign(globalThis, { localStorage: {
	getItem: (k: string) => store.get(k) ?? null,
	setItem: (k: string, v: string) => { if (blocked) throw new Error('Quota'); store.set(k, v); }
} });
beforeEach(() => { store.clear(); blocked = false; });

describe('saved simulator plans', () => {
 it('repairs old plans and autosaves that omitted baseline rows without losing other edits', () => {
  const l = inconsistent as unknown as Loadout;
  const state = initSimState(l);
  delete state.engravings[1109];
  delete state.quality.head;
  delete state.gear.head;
  state.arkGrid.shift();
  state.gear.weapon!.honing++;
  const saved = saveSimulation('na/soulshan', 'Old plan', l, state);
  expect(saved.state.engravings[1109]).toEqual(initSimState(l).engravings[1109]);
  expect(saved.state.gear.head).toEqual(initSimState(l).gear.head);
  expect(saved.state.quality.head).toBe(initSimState(l).quality.head);
  expect(saved.state.arkGrid).toHaveLength(initSimState(l).arkGrid.length);
  expect(saved.state.gear.weapon!.honing).toBe(state.gear.weapon!.honing);
  store.set('loa-sim:autosave:v1:na/soulshan', JSON.stringify([{ ...saved, state }]));
  expect(loadAutosave('na/soulshan', l)?.engravings[1109]).toBeDefined();
 });
 it('migrates an old extra engraving into the formerly hidden fifth slot', () => {
  const l = inconsistent as unknown as Loadout;
  const state = initSimState(l);
  delete state.engravings[1109];
  state.engravings[1118] = { books: 4, stone: 0, added: true };
  const saved = saveSimulation('na/soulshan', 'Old fifth slot', l, state);
  expect(Object.keys(saved.state.engravings)).toHaveLength(5);
  expect(saved.state.engravings[1109]).toEqual({ books: 4, stone: 0, as: 1118 });
  expect(saved.state.engravings[1118]).toBeUndefined();
  expect(simulationCP(saved)).toBeCloseTo(6620.18, 2);
 });
 it('defaults missing optional feature fields from an old v1 plan to its own snapshot', () => {
  const saved = saveSimulation('na/soulshan', 'Before new fields', loadout, initSimState(loadout));
  const older = structuredClone(saved);
  for (const key of ['quality', 'paradise', 'skillCooldownUse', 'skins']) delete (older.state as unknown as Record<string, unknown>)[key];
  const restored = parseSimulation(JSON.stringify(older));
  expect(restored.state).toEqual(saved.state);
  expect(simulationCP(restored)).toBe(simulationCP(saved));
 });
 it('rejects malformed swap IDs, duplicate or excess slots and out-of-range saved inputs', () => {
  const saved = saveSimulation('na/soulshan', 'Valid', loadout, initSimState(loadout));
  for (const mutate of [
   (s: typeof saved) => { s.state.engravings[1118].as = 'bad' as unknown as number; },
   (s: typeof saved) => { s.state.engravings[1118].as = 999999; },
   (s: typeof saved) => { s.state.engravings[1118].as = 1299; },
   (s: typeof saved) => { s.state.engravings[1109] = { books: 0, stone: 0, added: true }; },
   (s: typeof saved) => { s.state.quality.head = 101; },
   (s: typeof saved) => { s.state.gems[0].tier = 'invalid' as 'T4'; },
   (s: typeof saved) => { s.state.arkGrid[0].grade = 'invalid' as 'ancient'; },
   (s: typeof saved) => { s.state.sidereal = { infusion: 9999, evolution: 0, advanced: 0 }; },
   (s: typeof saved) => { s.state.gems = Array.from({length: 12}, () => structuredClone(s.state.gems[0])); },
   (s: typeof saved) => { s.state.karma.evolution = 31; },
   (s: typeof saved) => { s.state.skins.bonus = 99; },
   (s: typeof saved) => { s.state.accessories.neck = Array.from({length: 4}, () => ({key: 'other', label: 'Bad'})); },
   (s: typeof saved) => { s.state.arkGrid.push(structuredClone(s.state.arkGrid[0])); }
  ]) {
   const bad = structuredClone(saved); mutate(bad);
   expect(() => parseSimulation(JSON.stringify(bad))).toThrow('supported');
  }
 });
	it('saving the same title, baseline and edits again is a no-op, while a new title or edits creates a plan', () => {
		const state = initSimState(loadout);
		state.gear.weapon!.honing++;
		const first = saveSimulation('na/soulshan', 'Raid plan', loadout, state);
		blocked = true; // A no-op must not attempt a storage write.
		expect(saveSimulation('NA/Soulshan', ' Raid plan ', loadout, structuredClone(state))).toEqual(first);
		expect(savedSimulations()).toHaveLength(1);
		blocked = false;
		expect(saveSimulation('na/soulshan', 'Other plan', loadout, state).id).not.toBe(first.id);
		state.gear.weapon!.honing--;
		expect(saveSimulation('na/soulshan', 'Raid plan', loadout, state).id).not.toBe(first.id);
		expect(savedSimulations()).toHaveLength(3);
	});
	it('round trips actual edited equipment, gems and a KR bracer without changing the baseline', () => {
		const state = initSimState(loadout);
		state.gear.weapon!.honing++;
		state.gems[0].level = 10;
		state.bracer = { grade: 'ancient', honing: 25 };
		const s = saveSimulation('NA/Soulshan', 'My upgrades', loadout, state);
		const restored = latestSimulation('na/soulshan', loadout)!;
		expect(restored.state).toEqual(state);
		expect(parseSimulation(JSON.stringify(s))).toEqual(s);
		expect(simulate(loadout, restored.state).cp).toBeGreaterThan(simulate(loadout, initSimState(loadout)).cp);
		expect(loadout).toEqual(soulshan);
	});
	it('keeps characters and changed baselines separate', () => {
		saveSimulation('na/soulshan', 'Plan', loadout, initSimState(loadout));
		expect(latestSimulation('ce/other', loadout)).toBeUndefined();
		const newer = structuredClone(loadout); newer.combatPower!.score++;
		expect(latestSimulation('na/soulshan', newer)).toBeUndefined();
		expect(savedSimulations('na/soulshan')).toHaveLength(1);
	});
	it('reports failed writes and deletion without losing existing plans', () => {
		const s = saveSimulation('na/soulshan', 'Plan', loadout, initSimState(loadout));
		blocked = true;
		expect(() => saveSimulation('na/soulshan', 'Other', loadout, initSimState(loadout))).toThrow('storage');
		expect(() => deleteSimulation(s.id)).toThrow('storage');
		blocked = false; deleteSimulation(s.id);
		expect(savedSimulations()).toEqual([]);
	});
	it('rejects unsupported and malformed imports, while ignoring corrupted stored records', () => {
		const s = saveSimulation('na/soulshan', 'Plan', loadout, initSimState(loadout));
		for (const value of [{ ...s, version: 2 }, { ...s, state: {} }, { ...s, state: { ...s.state, gems: 'bad' } }, { ...s, state: { ...s.state, accessories: { neck: [null] } } }]) {
			expect(() => parseSimulation(JSON.stringify(value))).toThrow('supported');
		}
		store.set('loa-sim:simulations:v1', JSON.stringify([{}, s]));
		expect(savedSimulations()).toEqual([s]);
	});
});


describe('automatic working copies', () => {
 it('restores edits separately from named plans and other characters or baselines', () => {
  const state=initSimState(loadout);state.gear.weapon!.honing++;
  autosaveSimulation('NA/Soulshan',loadout,state);
  expect(loadAutosave('na/soulshan',loadout)).toEqual(state);
  expect(savedSimulations()).toEqual([]);
  expect(loadAutosave('ce/other',loadout)).toBeUndefined();
  const newer=structuredClone(loadout);newer.combatPower!.score++;
  expect(loadAutosave('na/soulshan',newer)).toBeUndefined();
  autosaveSimulation('na/soulshan',newer,initSimState(newer));
  expect(loadAutosave('na/soulshan',loadout)).toEqual(state);
 });
 it('persists reset and skips unchanged writes', () => {
  const state=initSimState(loadout);state.gear.weapon!.honing++;
  autosaveSimulation('na/soulshan',loadout,state);
  blocked=true;expect(()=>autosaveSimulation('na/soulshan',loadout,state)).not.toThrow();
  blocked=false;autosaveSimulation('na/soulshan',loadout,initSimState(loadout));
  expect(loadAutosave('na/soulshan',loadout)).toEqual(initSimState(loadout));
 });
 it('retains last valid edits through temporary invalid input and reports storage failures', () => {
  const state=initSimState(loadout);state.gear.weapon!.honing++;
  autosaveSimulation('na/soulshan',loadout,state);
  const invalid=structuredClone(state);invalid.gear.weapon!.honing=NaN;
  autosaveSimulation('na/soulshan',loadout,invalid);
  expect(loadAutosave('na/soulshan',loadout)).toEqual(state);
  blocked=true;state.gear.weapon!.honing--;
  expect(()=>autosaveSimulation('na/soulshan',loadout,state)).toThrow('Autosave unavailable');
  expect(loadAutosave('na/soulshan',loadout)).not.toEqual(state);
 });
 it('ignores corrupt working copies', () => {
  store.set('loa-sim:autosave:v1:na/soulshan','broken');
  expect(loadAutosave('na/soulshan',loadout)).toBeUndefined();
 });
});


it('renames a saved simulation without changing its identity, timestamp or data', () => {
 const original=saveSimulation('na/soulshan','Old',loadout,initSimState(loadout));
 renameSimulation(original.id,' New ');
 expect(savedSimulations()[0]).toEqual({...original,name:'New'});
 blocked=true;expect(()=>renameSimulation(original.id,'New')).not.toThrow();
 expect(()=>renameSimulation(original.id,'Other')).toThrow('storage');
 expect(savedSimulations()[0].name).toBe('New');
 expect(()=>renameSimulation(original.id,' ')).toThrow('name');
});

it('pins saved builds without changing their baseline or edits; rename and unpin preserve them', () => {
 const a = saveSimulation('na/soulshan', 'DPS', loadout, initSimState(loadout));
 const changed = structuredClone(loadout); changed.combatPower!.score += 100;
 const b = saveSimulation('na/soulshan', 'Other snapshot', changed, initSimState(changed));
 pinSimulation(a.id, true);
 renameSimulation(a.id, 'Raid DPS');
 const pinned = savedSimulations().find(s => s.id === a.id)!;
 expect(pinned.pinned).toBe(true);
 expect(pinned.loadout).toEqual(a.loadout);
 expect(pinned.state).toEqual(a.state);
 expect(savedSimulations().find(s => s.id === b.id)?.pinned).toBeUndefined();
 pinSimulation(a.id, false);
 expect(savedSimulations()).toHaveLength(2);
 expect(savedSimulations().find(s => s.id === a.id)?.pinned).toBe(false);
 deleteSimulation(a.id);
 expect(savedSimulations().some(s => s.id === a.id)).toBe(false);
});
it('keeps each build working copy separate from the normal character and other builds', () => {
 const normal = initSimState(loadout), first = structuredClone(normal), second = structuredClone(normal);
 first.gear.weapon!.honing--; second.gear.weapon!.honing -= 2;
 autosaveSimulation('na/soulshan', loadout, normal);
 autosaveSimulation('na/soulshan:build:a', loadout, first);
 autosaveSimulation('na/soulshan:build:b', loadout, second);
 expect(loadAutosave('na/soulshan', loadout)).toEqual(normal);
 expect(loadAutosave('na/soulshan:build:a', loadout)).toEqual(first);
 expect(loadAutosave('na/soulshan:build:b', loadout)).toEqual(second);
});
it('reports pin failures without claiming the shortcut persisted', () => {
 const s = saveSimulation('na/soulshan', 'DPS', loadout, initSimState(loadout));
 blocked = true;
 expect(() => pinSimulation(s.id, true)).toThrow('storage');
 expect(savedSimulations()[0].pinned).toBeUndefined();
});
