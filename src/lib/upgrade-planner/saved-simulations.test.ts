import { beforeEach, describe, expect, it } from 'vitest';
import { deleteSimulation, latestSimulation, parseSimulation, savedSimulations, saveSimulation } from './saved-simulations';
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
