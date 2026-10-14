import { beforeEach, describe, expect, it } from 'vitest';
import { renameSimulation, autosaveSimulation, loadAutosave, deleteSimulation, latestSimulation, parseSimulation, savedSimulations, saveSimulation } from './saved-simulations';
import { initSimState, simulate } from './simulate';
import type { Loadout } from './types';
import soulshan from './fixtures/na-soulshan.json';

const loadout = soulshan as unknown as Loadout;
const store = new Map<string, string>();
let blocked = false;
Object.assign(globalThis, { localStorage: {
	getItem: (k: string) => store.get(k) ?? null,
	setItem: (k: string, v: string) => { if (blocked) throw new Error('Quota'); store.set(k, v); }
} });
beforeEach(() => { store.clear(); blocked = false; });

describe('saved simulator plans', () => {
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
