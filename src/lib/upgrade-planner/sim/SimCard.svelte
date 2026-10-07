<script lang="ts">
	import type { Snippet } from 'svelte';
	import { formatPct } from '../format';

	let {
		title,
		deltaPct = 0,
		actions,
		children
	}: { title: string; deltaPct?: number; actions?: Snippet; children: Snippet } = $props();
</script>

<div class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
	<div class="flex flex-row items-center gap-2 bg-black/10 px-3 py-2 font-bold">
		<span>{title}</span>
		{#if Math.abs(deltaPct) > 0.00005}
			<span class="text-sm font-semibold {deltaPct > 0 ? 'text-green-400' : 'text-red-400'}">{formatPct(deltaPct)}%</span>
		{/if}
		<div class="ml-auto flex flex-row gap-2 text-xs font-normal">{@render actions?.()}</div>
	</div>
	<div class="p-2">{@render children()}</div>
</div>
