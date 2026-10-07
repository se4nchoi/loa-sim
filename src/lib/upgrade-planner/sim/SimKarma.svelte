<script lang="ts">
	import type { SimState } from '../simulate';
	import { KARMA_EVOLUTION_MAX_RANK, KARMA_LEAP_MAX_LEVEL } from '../tables';
	import SimCard from './SimCard.svelte';
	import Stepper from './Stepper.svelte';
	import { btn, type SectionDelta } from './ui';

	let { sim = $bindable(), base, delta }: { sim: SimState; base: SimState; delta: SectionDelta } = $props();
</script>

{#if sim.karma.evolution !== null || sim.karma.leap !== null}
	<SimCard title="Karma" {delta}>
		<div class="flex flex-row flex-wrap gap-3">
			{#if sim.karma.evolution !== null}
				<div class="flex flex-1 flex-row items-center gap-3 rounded-xs bg-black/15 p-2.5">
					<div class="flex flex-1 flex-col">
						<span class="text-sm font-semibold">Evolution rank</span>
						<span class="text-xs text-surface-400">+0.6% CP per rank, max {KARMA_EVOLUTION_MAX_RANK}</span>
					</div>
					<Stepper bind:value={sim.karma.evolution} min={0} max={KARMA_EVOLUTION_MAX_RANK} changed={sim.karma.evolution !== base.karma.evolution} label="Evolution karma rank" width="w-6" />
					<button type="button" class={btn} onclick={() => (sim.karma.evolution = KARMA_EVOLUTION_MAX_RANK)}>Max</button>
				</div>
			{/if}
			{#if sim.karma.leap !== null}
				<div class="flex flex-1 flex-row items-center gap-3 rounded-xs bg-black/15 p-2.5">
					<div class="flex flex-1 flex-col">
						<span class="text-sm font-semibold">Leap level</span>
						<span class="text-xs text-surface-400">+0.02% CP per level, max {KARMA_LEAP_MAX_LEVEL}</span>
					</div>
					<Stepper bind:value={sim.karma.leap} min={0} max={KARMA_LEAP_MAX_LEVEL} changed={sim.karma.leap !== base.karma.leap} label="Leap karma level" width="w-7" />
					<button type="button" class={btn} onclick={() => (sim.karma.leap = KARMA_LEAP_MAX_LEVEL)}>Max</button>
				</div>
			{/if}
		</div>
	</SimCard>
{/if}
