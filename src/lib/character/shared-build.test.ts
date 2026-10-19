import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import CharacterView from './CharacterView.svelte';
import { initSimState } from '$lib/upgrade-planner/simulate';
import { parseSimulation, simulationCP } from '$lib/upgrade-planner/saved-simulations';
import fixture from '$lib/upgrade-planner/fixtures/na-soulshan.json';
import type { Loadout } from '$lib/upgrade-planner/types';
import { isStoredLoadout } from '$lib/stored-loadout';

const fixtures = Object.entries(import.meta.glob('$lib/upgrade-planner/fixtures/*.json', {eager: true, import: 'default'}))
 .filter(([, value]) => isStoredLoadout(value)) as [string, Loadout][];

it.each(fixtures)('restores and renders the recorded snapshot %s', (_, loadout) => {
 const initialBuild = parseSimulation(JSON.stringify({version: 1, id: 'shared:abcdefgh', name: 'Recorded build',
  characterKey: 'na/audit', savedAt: 1, loadout, state: initSimState(loadout)}));
 const html = render(CharacterView, {props: {name: 'Audit', region: 'NA', loadout, initialBuild, sharedBuild: true}}).body;
 expect(html).toContain(simulationCP(initialBuild).toFixed(2));
});

it('renders a shared build with its edits and matching CP before hydration', () => {
 const loadout = fixture as unknown as Loadout;
 const state = initSimState(loadout);
 state.gear.weapon!.honing = 25;
 const initialBuild = parseSimulation(JSON.stringify({version: 1, id: 'shared:abcdefgh', name: 'Weapon upgrade',
  characterKey: 'na/soulshan', savedAt: 1, loadout, state}));
 const expectedCp = simulationCP(initialBuild).toFixed(2);
 const html = render(CharacterView, {props: {name: 'Soulshan', region: 'NA', loadout, initialBuild, sharedBuild: true}}).body;
 expect(html).toContain(expectedCp);
 expect(html).toContain('value="25"');
});
