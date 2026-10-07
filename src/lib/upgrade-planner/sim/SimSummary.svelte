<script lang="ts">
	import { formatCp } from '../format';
	import Delta from './Delta.svelte';
	import type { SimGroup } from './ui';

	let {
		current,
		simulated,
		ilvlBefore,
		ilvlAfter,
		groups,
		onreset
	}: {
		current: number;
		simulated: number;
		ilvlBefore: number | null;
		ilvlAfter: number | null;
		groups: Record<SimGroup, number>;
		onreset: () => void;
	} = $props();

	const LABELS: Record<SimGroup, string> = {
		gear: 'Equipment',
		accessories: 'Accessories',
		gems: 'Gems',
		engravings: 'Engravings',
		arkGrid: 'Ark Grid',
		karma: 'Karma'
	};
	const delta = $derived((simulated / current - 1) * 100);
	const changed = $derived((Object.entries(groups) as [SimGroup, number][]).filter(([, v]) => Math.abs(v) > 0.00005));
	const color = (v: number) => (v > 0 ? 'text-green-400' : v < 0 ? 'text-red-400' : 'text-surface-300');
</script>

<div class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
	<div class="flex flex-row items-center bg-black/10 px-3 py-2 font-bold">
		<span>Combat Power Simulator</span>
		<button type="button" class="ml-auto text-xs font-normal text-surface-300 underline hover:text-surface-50" onclick={onreset}>Reset</button>
	</div>
	<div class="flex flex-col gap-1 p-2">
		<span class="text-xs text-surface-400">Current</span>
		<span class="text-lg font-bold text-surface-200">{formatCp(current)}</span>
		<span class="mt-1 text-xs text-surface-400">Simulated</span>
		<div class="flex flex-row items-baseline gap-2">
			<span class="text-2xl font-bold text-red-400">{formatCp(simulated)}</span>
			<Delta pct={delta} cp={simulated - current} class="text-sm font-semibold" />
		</div>
		{#if ilvlBefore !== null && ilvlAfter !== null}
			<span class="mt-1 text-xs text-surface-400">Item Level</span>
			<span class="text-sm text-surface-200">
				{ilvlBefore.toFixed(2)}{#if ilvlAfter !== ilvlBefore} → <span class={color(ilvlAfter - ilvlBefore)}>{ilvlAfter.toFixed(2)}</span>{/if}
			</span>
		{/if}
	</div>
	{#if changed.length}
		<div class="grid grid-cols-[1fr_max-content] p-2">
			{#each changed as [g, v] (g)}
				<span class="text-sm text-surface-300">{LABELS[g]}</span>
				<Delta pct={v} cp={(current * v) / 100} class="text-right text-sm" />
			{/each}
		</div>
	{:else}
		<p class="p-2 text-xs text-surface-400">Change anything on the left to see its effect on Combat Power.</p>
	{/if}
</div>
