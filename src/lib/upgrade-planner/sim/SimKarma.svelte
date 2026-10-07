<script lang="ts">
	import type { SimState } from '../simulate';
	import { KARMA_EVOLUTION_MAX_RANK, KARMA_LEAP_MAX_LEVEL } from '../tables';
	import SimCard from './SimCard.svelte';
	import { range, selectClass } from './ui';

	let { sim = $bindable(), base, deltaPct }: { sim: SimState; base: SimState; deltaPct: number } = $props();
</script>

{#if sim.karma.evolution !== null || sim.karma.leap !== null}
	<SimCard title="Karma" {deltaPct}>
		<div class="grid grid-cols-[1fr_max-content] items-center gap-x-3 gap-y-1">
			{#if sim.karma.evolution !== null}
				<label class="text-sm text-surface-200" for="karma-evo">Evolution rank</label>
				<select id="karma-evo" class={selectClass(sim.karma.evolution !== base.karma.evolution)} bind:value={sim.karma.evolution}>
					{#each range(0, KARMA_EVOLUTION_MAX_RANK) as r (r)}<option value={r}>{r}</option>{/each}
				</select>
			{/if}
			{#if sim.karma.leap !== null}
				<label class="text-sm text-surface-200" for="karma-leap">Leap level</label>
				<select id="karma-leap" class={selectClass(sim.karma.leap !== base.karma.leap)} bind:value={sim.karma.leap}>
					{#each range(0, KARMA_LEAP_MAX_LEVEL) as r (r)}<option value={r}>{r}</option>{/each}
				</select>
			{/if}
		</div>
	</SimCard>
{/if}
