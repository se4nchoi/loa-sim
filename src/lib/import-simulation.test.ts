import { beforeEach, expect, it } from 'vitest';
import { importSimulation } from './import-simulation';
import { loadSavedCharacter, saveCharacter } from './saved-character';
import { initSimState } from './upgrade-planner/simulate';
import { savedSimulations } from './upgrade-planner/saved-simulations';
import type { Loadout } from './upgrade-planner/types';
import fixture from './upgrade-planner/fixtures/na-soulshan.json';

const loadout = fixture as unknown as Loadout;
const store = new Map<string, string>();
let blocked = false;
Object.assign(globalThis, {
 localStorage: {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { if (blocked) throw new Error('Quota'); store.set(key, value); },
  removeItem: (key: string) => store.delete(key)
 },
 sessionStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
});
beforeEach(() => { store.clear(); blocked = false; });
function file(characterKey = 'na/soulshan') {
 const state = initSimState(loadout);
 state.gear.weapon!.honing = 25;
 return JSON.stringify({version: 1, id: 'exported-id', name: 'Imported build', characterKey, savedAt: 1, loadout, state});
}
it('opens the imported edits explicitly, creates a character if needed, and deduplicates repeated imports', () => {
 const url = new URL(importSimulation(file()), 'https://example.test');
 const plan = savedSimulations()[0];
 expect(url.searchParams.get('c')).toBe('na/soulshan');
 expect(url.searchParams.get('build')).toBe(plan.id);
 expect(plan.state.gear.weapon?.honing).toBe(25);
 expect(loadSavedCharacter('na/soulshan')?.loadout).toEqual(loadout);
 expect(importSimulation(file())).toContain(encodeURIComponent(plan.id));
 expect(savedSimulations()).toHaveLength(1);
});
it('preserves the current character snapshot when importing an older build', () => {
 const current = structuredClone(loadout);
 current.itemLevel++;
 saveCharacter({name: 'Soulshan', region: 'NA', header: null, loadout: current, loadouts: {current}, loadoutKind: 'current'});
 const before = loadSavedCharacter('na/soulshan');
 importSimulation(file());
 expect(loadSavedCharacter('na/soulshan')).toEqual(before);
 expect(savedSimulations()[0].loadout).toEqual(loadout);
});
it('rejects unsupported keys and blocked storage without returning a successful navigation', () => {
 expect(() => importSimulation(file('na/name/extra'))).toThrow('unsupported');
 expect(savedSimulations()).toEqual([]);
 blocked = true;
 expect(() => importSimulation(file())).toThrow('storage');
 expect(savedSimulations()).toEqual([]);
});
