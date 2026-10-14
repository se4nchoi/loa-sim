import { beforeEach, describe, expect, it, vi } from 'vitest';
import soulshan from './fixtures/na-soulshan.json';
import type { Loadout } from './types';
import { initSimState } from './simulate';
import { analyzeDpsPlan } from './dps-plan';
import { publicDpsSample } from './public-dps-samples';
import { autosaveSimulation, loadAutosave } from './saved-simulations';

const loadout = soulshan as unknown as Loadout;
const storage = new Map<string, string>();
beforeEach(() => {
	storage.clear();
	vi.stubGlobal('localStorage', { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) });
});

describe('DPS workspace reads Simulator plans', () => {
	it('analyzes the persisted upgrade without modifying the working copy or baseline', () => {
		const state = initSimState(loadout);
		state.gear.weapon!.honing++;
		autosaveSimulation('na/soulshan', loadout, state);
		const persisted = loadAutosave('na/soulshan', loadout)!;
		const before = JSON.stringify(persisted);
		const sample = publicDpsSample('na/shanzkii', '91Vm5pv')!;
		const result = analyzeDpsPlan(loadout, persisted, sample);
		expect(result.estimate.gainPct).toBeGreaterThan(0);
		expect(result.sections.map(s => s.name)).toEqual(['Equipment']);
		expect(JSON.stringify(persisted)).toBe(before);
		expect(loadAutosave('na/soulshan', loadout)).toEqual(state);
		expect(result.base.gear.weapon!.honing).toBe(state.gear.weapon!.honing - 1);
	});
	it('replaces stale sample context in analysis and keeps unsupported changes visible', () => {
		const state = initSimState(loadout);
		state.skillShares = {47950: 99};
		state.karma.leap = (state.karma.leap ?? 0) + 1;
		const sample = publicDpsSample('na/shanzkii', '6bHvxtb')!;
		const result = analyzeDpsPlan(loadout, state, sample);
		expect(result.target.skillShares[47950]).toBe(34.3);
		expect(state.skillShares[47950]).toBe(99);
		expect(result.sections[0].estimate.excluded).toContain('karma');
	});
	it('requires new edits for a new snapshot rather than applying an old baseline', () => {
		const state = initSimState(loadout);
		state.gear.weapon!.honing++;
		autosaveSimulation('na/soulshan', loadout, state);
		const newer = structuredClone(loadout);
		newer.combatPower!.score++;
		expect(loadAutosave('na/soulshan', newer)).toBeUndefined();
		expect(loadAutosave('ce/other', loadout)).toBeUndefined();
	});
});
