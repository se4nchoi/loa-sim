<!--
	Combat Power simulator: edit honing, accessories, gems, engravings, ark grid, bracelet and karma, and see
	the character's CP update live. Usage on the character page:
		<Simulator loadout={loadout}>{#snippet sidebar()}…extra sidebar cards…{/snippet}</Simulator>
-->
<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import SimAccessories from './sim/SimAccessories.svelte';
	import SimArkGrid from './sim/SimArkGrid.svelte';
	import SimBracelet from './sim/SimBracelet.svelte';
	import SimEngravings from './sim/SimEngravings.svelte';
	import SimGear from './sim/SimGear.svelte';
	import SimGems from './sim/SimGems.svelte';
	import SimKarma from './sim/SimKarma.svelte';
	import MobileSummaryBar from './sim/MobileSummaryBar.svelte';
	import SimSummary from './sim/SimSummary.svelte';
	import { SECTIONS, type PreviewEdit, type SectionDelta, type SimSection } from './sim/ui';
	import { gemParts, initSimState, itemLevel, mainStatIndex, simulate, type SimState } from './simulate';
	import type { Loadout } from './types';
	import { coreStates } from './upgrades';

	let { loadout, sidebar, characterName }: { loadout: Loadout; sidebar?: Snippet; characterName?: string } = $props();

	const base = $derived(initSimState(loadout));
	let sim = $state(untrack(() => initSimState(loadout)));
	// Start over when a different character's loadout comes in.
	$effect.pre(() => {
		sim = initSimState(loadout);
	});

	const snapshot = () => $state.snapshot(sim) as SimState;
	const baseline = $derived(simulate(loadout, base, base));
	const result = $derived(simulate(loadout, snapshot(), base));
	const current = $derived(loadout.combatPower?.score ?? baseline.cp);
	// Keep the headline number identical to the in-game score; edits apply as a ratio on top.
	const simulated = $derived(current * (result.cp / baseline.cp));

	/** Each section's effect on its own: only that section's edits applied to the starting state. */
	const sections = $derived.by(() => {
		const s = snapshot();
		const out = {} as Record<SimSection, SectionDelta>;
		for (const [name, keys] of Object.entries(SECTIONS) as [SimSection, readonly (keyof SimState)[]][]) {
			const only = { ...base, ...Object.fromEntries(keys.map((k) => [k, s[k]])) } as SimState;
			const pct = (simulate(loadout, only, base).cp / baseline.cp - 1) * 100;
			out[name] = { pct, cp: (current * pct) / 100 };
		}
		return out;
	});

	/** CP change (percent of the current simulation) if `mutate` were applied on top of it. */
	const preview: PreviewEdit = (mutate) => {
		const s = structuredClone(snapshot());
		mutate(s);
		return (simulate(loadout, s, base).cp / result.cp - 1) * 100;
	};

	const gems = $derived(gemParts(loadout));
	const cores = $derived(coreStates(loadout));
	const itemIds = $derived(Object.fromEntries((loadout.items ?? []).map((i) => [i.slot, i.id])));
	const mainStatName = $derived(({ 3: 'Strength', 4: 'Dexterity', 5: 'Intelligence' } as Record<number, string>)[mainStatIndex(loadout)]);

	function reset() {
		sim = initSimState(loadout);
	}

	// Undo / redo: snapshots of the edit state. Changes within HISTORY_MERGE_MS (a slider drag, quick clicks)
	// merge into one step.
	const HISTORY_MERGE_MS = 400;
	let past = $state<string[]>([]);
	let future = $state<string[]>([]);
	let last = untrack(() => JSON.stringify($state.snapshot(sim)));
	let lastAt = 0;
	let restoring = false;
	$effect(() => {
		const now = JSON.stringify($state.snapshot(sim));
		untrack(() => {
			if (now === last) return;
			if (restoring) restoring = false;
			else {
				if (Date.now() - lastAt > HISTORY_MERGE_MS) past = [...past.slice(-99), last];
				future = [];
				lastAt = Date.now();
			}
			last = now;
		});
	});
	$effect.pre(() => {
		void loadout;
		untrack(() => {
			past = [];
			future = [];
			last = JSON.stringify($state.snapshot(sim));
		});
	});
	function restore(json: string) {
		restoring = true;
		sim = JSON.parse(json);
	}
	function undo() {
		const prev = past.at(-1);
		if (prev === undefined) return;
		past = past.slice(0, -1);
		future = [...future, last];
		restore(prev);
	}
	function redo() {
		const next = future.at(-1);
		if (next === undefined) return;
		future = future.slice(0, -1);
		past = [...past, last];
		restore(next);
	}
	function onkeydown(e: KeyboardEvent) {
		if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.tagName === 'INPUT') return;
		if (e.key.toLowerCase() === 'z' && !e.shiftKey) (e.preventDefault(), undo());
		else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) (e.preventDefault(), redo());
	}
</script>

<svelte:window {onkeydown} />

{#snippet summary()}
	<SimSummary
		{current}
		{simulated}
		ilvlBefore={itemLevel(base)}
		ilvlAfter={itemLevel(sim)}
		{sections}
		onreset={reset}
		onundo={undo}
		onredo={redo}
		canUndo={past.length > 0}
		canRedo={future.length > 0}
	/>
{/snippet}

{#if loadout.battlePoint.isSupport}
	<p class="text-sm text-surface-300">The simulator supports DPS loadouts only for now.</p>
{:else}
	<!-- Phones/tablets: pinned under the header while scrolling, expandable. -->
	<MobileSummaryBar {current} {simulated}>{@render summary()}</MobileSummaryBar>
	<div class="grid grid-cols-[1fr_280px] items-start gap-2 max-lg:grid-cols-1">
		<!-- Two columns on wide screens; a single column only when the screen is narrow. -->
		<div class="flex min-w-0 flex-col gap-2">
			<div class="grid grid-cols-2 items-start gap-2 max-xl:grid-cols-1">
				<div class="flex min-w-0 flex-col gap-2">
					<SimGear bind:sim {base} {itemIds} delta={sections.gear} />
					<SimAccessories bind:sim {base} {itemIds} {mainStatName} {preview} delta={sections.accessories} />
					<SimBracelet bind:sim {base} itemId={itemIds.bracelet} {mainStatName} {preview} delta={sections.bracelet} />
				</div>
				<div class="flex min-w-0 flex-col gap-2">
					<SimGems bind:sim {base} {gems} {characterName} delta={sections.gems} />
					<SimEngravings bind:sim {base} {preview} delta={sections.engravings} />
					<SimKarma bind:sim {base} delta={sections.karma} />
				</div>
			</div>
			<SimArkGrid bind:sim {base} {cores} {loadout} {preview} delta={sections.arkGrid} />
		</div>
		<div class="flex flex-col gap-2 lg:sticky lg:top-16">
			<div class="max-lg:hidden">{@render summary()}</div>
			{@render sidebar?.()}
		</div>
	</div>
{/if}
