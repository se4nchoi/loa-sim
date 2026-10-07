<script lang="ts">
	import type { GemPart, SimState } from '../simulate';
	import SimCard from './SimCard.svelte';
	import { linkButtonClass, range, selectClass } from './ui';

	let {
		sim = $bindable(),
		base,
		gems,
		deltaPct
	}: { sim: SimState; base: SimState; gems: GemPart[]; deltaPct: number } = $props();

	const KIND = { damage: 'Damage', cooldown: 'Cooldown', other: 'Gem' };
	const editable = $derived(gems.map((g, i) => ({ g, i })).filter(({ g }) => g.table));

	function allTo(level: number) {
		for (const { i } of editable) sim.gems[i] = level;
	}
</script>

<SimCard title="Gems" {deltaPct}>
	{#snippet actions()}
		<button type="button" class={linkButtonClass} onclick={() => editable.forEach(({ i }) => (sim.gems[i] = Math.min(10, sim.gems[i] + 1)))}>All +1</button>
		<button type="button" class={linkButtonClass} onclick={() => allTo(10)}>All Lv. 10</button>
	{/snippet}
	{#if editable.length === 0}
		<p class="text-sm text-surface-400">No gems equipped.</p>
	{:else}
		<div class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-1.5">
			{#each editable as { g, i } (i)}
				<label class="flex flex-col gap-0.5 rounded-xs bg-black/10 p-1.5">
					<span class="text-xs text-surface-400">{g.tier} {KIND[g.kind]}</span>
					<select class={selectClass(sim.gems[i] !== base.gems[i])} bind:value={sim.gems[i]}>
						{#each range(1, 10) as lv (lv)}<option value={lv}>Lv. {lv}</option>{/each}
					</select>
				</label>
			{/each}
		</div>
	{/if}
</SimCard>
