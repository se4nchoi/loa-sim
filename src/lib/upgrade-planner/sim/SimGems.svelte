<script lang="ts">
	import { itemLook } from '../icons';
	import type { GemPart, SimState } from '../simulate';
	import ItemIcon from './ItemIcon.svelte';
	import SimCard from './SimCard.svelte';
	import { linkButtonClass, selectClass, type SectionDelta } from './ui';

	let {
		sim = $bindable(),
		base,
		gems,
		delta
	}: { sim: SimState; base: SimState; gems: GemPart[]; delta: SectionDelta } = $props();

	const KIND = { damage: 'Damage', cooldown: 'Cooldown', other: 'Gem' };
	const MIN_LISTED = 6;
	const editable = $derived(gems.map((g, i) => ({ g, i })).filter(({ g }) => g.table));

	/** Same gem at another level: the level sits in the id's tens/hundreds digits (6503[1][09][0]). */
	const gemAt = (id: number, level: number) => Math.floor(id / 1000) * 1000 + level * 10 + (id % 10);
	/** Lv. 10 down to Lv. 6, plus the current level if it's lower. */
	const levels = (current: number) => {
		const out = [10, 9, 8, 7, 6];
		if (current < MIN_LISTED) out.push(current);
		return out;
	};
</script>

<SimCard title="Gems" {delta}>
	{#snippet actions()}
		<button type="button" class={linkButtonClass} onclick={() => editable.forEach(({ i }) => (sim.gems[i] = Math.min(10, sim.gems[i] + 1)))}>All +1</button>
		<button type="button" class={linkButtonClass} onclick={() => editable.forEach(({ i }) => (sim.gems[i] = 10))}>All Lv. 10</button>
	{/snippet}
	{#if editable.length === 0}
		<p class="text-sm text-surface-400">No gems equipped.</p>
	{:else}
		<div class="grid grid-cols-[repeat(auto-fill,minmax(5.25rem,1fr))] gap-2">
			{#each editable as { g, i } (i)}
				{@const look = itemLook(gemAt(g.id, sim.gems[i]))}
				<div class="flex flex-col items-center gap-1 rounded-xs bg-black/10 p-1.5" title={look.name}>
					<ItemIcon src={look.icon} grade={look.grade} size="size-12" badge={sim.gems[i]} />
					<span class="text-[11px] text-surface-400">{KIND[g.kind]}</span>
					<select
						class="{selectClass(sim.gems[i] !== base.gems[i])} w-full"
						bind:value={sim.gems[i]}
						aria-label={`${KIND[g.kind]} gem ${i + 1} level`}
					>
						{#each levels(base.gems[i]) as lv (lv)}<option value={lv}>Lv. {lv}</option>{/each}
					</select>
				</div>
			{/each}
		</div>
	{/if}
</SimCard>
