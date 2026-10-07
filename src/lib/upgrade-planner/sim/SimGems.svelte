<script lang="ts">
	import { itemLook } from '../icons';
	import type { GemPart, SimState } from '../simulate';
	import ItemIcon from './ItemIcon.svelte';
	import SimCard from './SimCard.svelte';
	import Stepper from './Stepper.svelte';
	import { btn, btnAccent, type SectionDelta } from './ui';

	let {
		sim = $bindable(),
		base,
		gems,
		delta
	}: { sim: SimState; base: SimState; gems: GemPart[]; delta: SectionDelta } = $props();

	const KIND = { damage: 'Damage', cooldown: 'Cooldown', other: 'Gem' };
	const editable = $derived(gems.map((g, i) => ({ g, i })).filter(({ g }) => g.table));

	/** Same gem at another level: the level sits in the id's tens/hundreds digits (6503[1][09][0]). */
	const gemAt = (id: number, level: number) => Math.floor(id / 1000) * 1000 + level * 10 + (id % 10);
	const setAll = (fn: (current: number) => number) =>
		editable.forEach(({ i }) => (sim.gems[i] = Math.min(10, Math.max(1, fn(sim.gems[i])))));
</script>

<SimCard title="Gems" {delta}>
	{#if editable.length === 0}
		<p class="text-sm text-surface-400">No gems equipped.</p>
	{:else}
		<div class="mb-3 flex flex-row flex-wrap items-center gap-1.5">
			<span class="mr-1 text-xs text-surface-400">Set all</span>
			{#each [10, 9, 8, 7, 6] as lv (lv)}
				<button type="button" class={lv === 10 ? btnAccent : btn} onclick={() => setAll(() => lv)}>All Lv. {lv}</button>
			{/each}
			<span class="mx-1 h-5 w-px bg-surface-700"></span>
			<button type="button" class={btn} onclick={() => setAll((v) => v - 1)}>All −1</button>
			<button type="button" class={btn} onclick={() => setAll((v) => v + 1)}>All +1</button>
			<button type="button" class={btn} onclick={() => editable.forEach(({ i }) => (sim.gems[i] = base.gems[i]))}>Reset</button>
		</div>
		<div class="grid grid-cols-[repeat(auto-fill,minmax(6.75rem,1fr))] gap-2">
			{#each editable as { g, i } (i)}
				{@const look = itemLook(gemAt(g.id, sim.gems[i]))}
				<div
					class="flex flex-col items-center gap-1.5 rounded-xs p-2 {sim.gems[i] !== base.gems[i] ? 'bg-accent-500/10 ring-1 ring-accent-500' : 'bg-black/15'}"
					title={look.name}
				>
					<ItemIcon src={look.icon} grade={look.grade} size="size-12" badge={sim.gems[i]} />
					<span class="text-xs text-surface-400">{g.tier} {KIND[g.kind]}</span>
					<Stepper bind:value={sim.gems[i]} min={1} max={10} label={`${KIND[g.kind]} gem ${i + 1} level`} width="w-6" />
				</div>
			{/each}
		</div>
	{/if}
</SimCard>
