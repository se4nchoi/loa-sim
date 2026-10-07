<!--
	Combat Power simulator: edit honing, accessories, gems, engravings, ark grid and karma, and see the
	character's CP update live. Usage on the character page:
		<Simulator loadout={loadout}>{#snippet sidebar()}…extra sidebar cards…{/snippet}</Simulator>
-->
<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import SimAccessories from './sim/SimAccessories.svelte';
	import SimArkGrid from './sim/SimArkGrid.svelte';
	import SimEngravings from './sim/SimEngravings.svelte';
	import SimGear from './sim/SimGear.svelte';
	import SimGems from './sim/SimGems.svelte';
	import SimKarma from './sim/SimKarma.svelte';
	import SimSummary from './sim/SimSummary.svelte';
	import { groupDeltas } from './sim/ui';
	import { gemParts, initSimState, itemLevel, simulate } from './simulate';
	import type { Loadout } from './types';
	import { coreStates } from './upgrades';

	let { loadout, sidebar }: { loadout: Loadout; sidebar?: Snippet } = $props();

	const base = $derived(initSimState(loadout));
	let sim = $state(untrack(() => initSimState(loadout)));
	// Start over when a different character's loadout comes in.
	$effect.pre(() => {
		sim = initSimState(loadout);
	});
	const baseline = $derived(simulate(loadout, base, base));
	const result = $derived(simulate(loadout, $state.snapshot(sim) as typeof base, base));
	const groups = $derived(groupDeltas(baseline.parts, result.parts));
	const gems = $derived(gemParts(loadout));
	const cores = $derived(coreStates(loadout));
	const current = $derived(loadout.combatPower?.score ?? baseline.cp);
	// Keep the headline number identical to the in-game score; edits apply as a ratio on top.
	const simulated = $derived(current * (result.cp / baseline.cp));

	function reset() {
		sim = initSimState(loadout);
	}
</script>

{#if loadout.battlePoint.isSupport}
	<p class="text-sm text-surface-300">The simulator supports DPS loadouts only for now.</p>
{:else}
	<div class="grid grid-cols-[1fr_300px] items-start gap-2 max-lg:grid-cols-1">
		<div class="flex min-w-0 flex-col gap-2">
			<SimGear bind:sim {base} deltaPct={groups.gear} />
			<SimAccessories bind:sim {base} deltaPct={groups.accessories} />
			<SimGems bind:sim {base} {gems} deltaPct={groups.gems} />
			<SimEngravings bind:sim {base} deltaPct={groups.engravings} />
			<SimArkGrid bind:sim {base} {cores} deltaPct={groups.arkGrid} />
			<SimKarma bind:sim {base} deltaPct={groups.karma} />
		</div>
		<div class="flex flex-col gap-2 lg:sticky lg:top-16">
			<SimSummary
				{current}
				{simulated}
				ilvlBefore={itemLevel(base)}
				ilvlAfter={itemLevel(sim)}
				{groups}
				onreset={reset}
			/>
			{@render sidebar?.()}
		</div>
	</div>
{/if}
