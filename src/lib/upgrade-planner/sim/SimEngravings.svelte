<script lang="ts">
	import { engravingIcon } from '../icons';
	import type { SimState } from '../simulate';
	import { ENGRAVING_BOOK_STEPS, ENGRAVING_NAMES } from '../tables';
	import ItemIcon from './ItemIcon.svelte';
	import Segmented from './Segmented.svelte';
	import SimCard from './SimCard.svelte';
	import { type SectionDelta } from './ui';

	let { sim = $bindable(), base, delta }: { sim: SimState; base: SimState; delta: SectionDelta } = $props();

	const ids = $derived(Object.keys(sim.engravings).map(Number));
	const stoned = $derived(ids.filter((id) => sim.engravings[id].stone > 0).length);
	const BOOKS = ENGRAVING_BOOK_STEPS.map((n, col) => ({ value: col, label: String(n), title: `${n}/20 relic books` }));
	const STONE = [0, 1, 2, 3, 4].map((lv) => ({ value: lv, label: lv === 0 ? '–' : String(lv), title: lv === 0 ? 'No stone level' : `Ability stone Lv. ${lv}` }));
</script>

<SimCard title="Engravings" {delta}>
	{#if ids.length === 0}
		<p class="text-sm text-surface-400">No supported engravings found.</p>
	{:else}
		<div class="flex flex-col gap-2">
			{#each ids as id (id)}
				{@const e = sim.engravings[id]}
				{@const b = base.engravings[id]}
				<div
					class="flex flex-row flex-wrap items-center gap-x-3 gap-y-2 rounded-xs p-2.5 {e.books !== b.books || e.stone !== b.stone
						? 'bg-accent-500/10 ring-1 ring-accent-500'
						: 'bg-black/15'}"
				>
					<ItemIcon src={engravingIcon(id)} grade={5} size="size-10" />
					<span class="min-w-28 flex-1 text-sm font-semibold">{ENGRAVING_NAMES[id] ?? id}</span>
					<div class="flex flex-col gap-0.5">
						<span class="text-[11px] text-surface-400">Relic books</span>
						<Segmented value={e.books} options={BOOKS} onselect={(v) => (e.books = v)} label={`${ENGRAVING_NAMES[id]} relic books`} size="h-8 min-w-9 px-1.5 text-xs" />
					</div>
					<div class="flex flex-col gap-0.5">
						<span class="text-[11px] text-surface-400">Ability stone</span>
						<Segmented value={e.stone} options={STONE} onselect={(v) => (e.stone = v)} label={`${ENGRAVING_NAMES[id]} ability stone level`} size="h-8 min-w-8 px-1.5 text-xs" />
					</div>
				</div>
			{/each}
		</div>
		{#if stoned > 2}
			<p class="mt-2 text-xs text-amber-300">An ability stone carries at most two engravings ({stoned} set).</p>
		{/if}
	{/if}
</SimCard>
