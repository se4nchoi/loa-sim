import { expect, it } from 'vitest';
import { render } from 'svelte/server';
import DpsStatContext from './DpsStatContext.svelte';
import { initSimState } from './simulate';
import type { Loadout } from './types';
import fixture from './fixtures/na-soulshan.json';

it('renders a usable no-log context form without fabricating missing combat totals', () => {
	const loadout = fixture as unknown as Loadout;
	const html = render(DpsStatContext, {props: {loadout, base: initSimState(loadout), characterKey: 'na/soulshan', oncontext: () => {}}}).body;
	expect(html).toContain('no logs required');
	expect(html).toContain('764203');
	expect(html).toContain('Complete valid combat totals');
	expect(html).toContain('Blunt Thorn');
});
