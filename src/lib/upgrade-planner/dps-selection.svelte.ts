// DPS mode's picked clear, per character: DpsModePanel sets it, Next Upgrades ranks by the same meter with it.
// Kept as plain objects (the meter clones setups, which Svelte's state proxies can't be); a counter makes reads reactive.
import { untrack } from 'svelte';
import type { RunSummary } from '$lib/logs/protocol';
import type { orderCoreEffect } from './ark-grid-dps';
import type { SimState } from './simulate';
import type { DamageContext } from './dps-stat-engine';
import type { SharedDps } from './shared-dps';

export interface DpsSelection {
	/** The meter's baseline: the clear's own setup, or the snapshot when the clear has none. */
	baseline: SimState;
	buildRuns: RunSummary[];
	runs: RunSummary[];
	arkGrid?: typeof orderCoreEffect;
	context?: DamageContext;
	/** What a share link carries from DPS mode: the run and its baseline. */
	share?: SharedDps;
}

const selections = new Map<string, DpsSelection>();
const changes = $state({ count: 0 });

export function dpsSelection(characterKey: string): DpsSelection | undefined {
	void changes.count;
	return selections.get(characterKey);
}

export function setDpsSelection(characterKey: string, selection: DpsSelection | null) {
	if (selection) selections.set(characterKey, selection);
	else selections.delete(characterKey);
	// Called from DpsModePanel's effect: bumping the counter must not make that effect depend on it.
	untrack(() => changes.count++);
}
