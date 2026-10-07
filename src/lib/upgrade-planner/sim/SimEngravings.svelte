<script lang="ts">
	import type { SimState } from '../simulate';
	import { ENGRAVING_BOOK_STEPS, ENGRAVING_NAMES } from '../tables';
	import SimCard from './SimCard.svelte';
	import { range, selectClass, type SectionDelta } from './ui';

	let { sim = $bindable(), base, delta }: { sim: SimState; base: SimState; delta: SectionDelta } = $props();

	const ids = $derived(Object.keys(sim.engravings).map(Number));
	const stoned = $derived(ids.filter((id) => sim.engravings[id].stone > 0).length);
</script>

<SimCard title="Engravings" {delta}>
	{#if ids.length === 0}
		<p class="text-sm text-surface-400">No supported engravings found.</p>
	{:else}
		<div class="grid w-fit grid-cols-[10rem_max-content_max-content] items-center gap-x-4 gap-y-1">
			<span class="text-xs text-surface-400">Engraving</span>
			<span class="text-xs text-surface-400">Relic books</span>
			<span class="text-xs text-surface-400">Ability stone</span>
			{#each ids as id (id)}
				{@const e = sim.engravings[id]}
				{@const b = base.engravings[id]}
				<span class="text-sm text-surface-200">{ENGRAVING_NAMES[id] ?? id}</span>
				<select class={selectClass(e.books !== b.books)} bind:value={e.books} aria-label={`${ENGRAVING_NAMES[id]} relic books`}>
					{#each ENGRAVING_BOOK_STEPS as n, col (col)}<option value={col}>{n}/20</option>{/each}
				</select>
				<select class={selectClass(e.stone !== b.stone)} bind:value={e.stone} aria-label={`${ENGRAVING_NAMES[id]} ability stone level`}>
					{#each range(0, 4) as lv (lv)}<option value={lv}>{lv === 0 ? '—' : `Lv. ${lv}`}</option>{/each}
				</select>
			{/each}
		</div>
		{#if stoned > 2}
			<p class="mt-2 text-xs text-amber-300">An ability stone carries at most two engravings ({stoned} set).</p>
		{/if}
	{/if}
</SimCard>
