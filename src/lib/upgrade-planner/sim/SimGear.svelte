<script lang="ts">
	import { HONING_SLOTS, type HoningSlot } from '../honing-data';
	import type { SimState } from '../simulate';
	import SimCard from './SimCard.svelte';
	import { linkButtonClass, range, selectClass } from './ui';

	let { sim = $bindable(), base, deltaPct }: { sim: SimState; base: SimState; deltaPct: number } = $props();

	const LABELS: Record<HoningSlot, string> = {
		head: 'Head',
		shoulder: 'Shoulder',
		upper_body: 'Chest',
		lower_body: 'Pants',
		hand: 'Gloves',
		weapon: 'Weapon'
	};
	const ORDER: HoningSlot[] = ['head', 'shoulder', 'upper_body', 'lower_body', 'hand', 'weapon'];
	const slots = $derived(ORDER.filter((s) => sim.gear[s]));

	function bumpAll(delta: number) {
		for (const s of HONING_SLOTS) {
			const g = sim.gear[s];
			if (g) g.honing = Math.min(25, Math.max(0, g.honing + delta));
		}
	}
</script>

<SimCard title="Equipment" {deltaPct}>
	{#snippet actions()}
		<button type="button" class={linkButtonClass} onclick={() => bumpAll(1)}>All +1</button>
	{/snippet}
	{#if slots.length === 0}
		<p class="text-sm text-surface-400">No T4 1675-tier gear found; honing can't be simulated for this loadout.</p>
	{:else}
		<div class="grid w-fit grid-cols-[7rem_max-content_max-content_max-content] items-center gap-x-4 gap-y-1">
			<span class="text-xs text-surface-400">Piece</span>
			<span class="text-xs text-surface-400">Honing</span>
			<span class="text-xs text-surface-400">Advanced</span>
			<span class="text-right text-xs text-surface-400">Item Lv.</span>
			{#each slots as slot (slot)}
				{@const g = sim.gear[slot]!}
				{@const b = base.gear[slot]!}
				<span class="text-sm text-surface-200">{LABELS[slot]}</span>
				<select class={selectClass(g.honing !== b.honing)} bind:value={g.honing} aria-label={`${LABELS[slot]} honing`}>
					{#each range(0, 25) as h (h)}<option value={h}>+{h}</option>{/each}
				</select>
				<select class={selectClass(g.advanced !== b.advanced)} bind:value={g.advanced} aria-label={`${LABELS[slot]} advanced honing`}>
					{#each range(0, 40) as a (a)}<option value={a}>{a}</option>{/each}
				</select>
				<span class="text-right text-sm text-surface-300">{1675 + 5 * g.honing}</span>
			{/each}
		</div>
		<p class="mt-2 text-xs text-surface-400">
			≈ Stats from the game's T4 1675 honing tables. Armor adds main stat; the weapon scales Weapon Power.
		</p>
	{/if}
</SimCard>
