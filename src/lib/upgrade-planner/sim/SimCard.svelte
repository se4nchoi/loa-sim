<script lang="ts">
	import type { Snippet } from 'svelte';
	import Delta from './Delta.svelte';
	import type { SectionDelta } from './ui';

	let {
		title,
		delta,
		info,
		actions,
		children
	}: { title: string; delta?: SectionDelta; info?: string; actions?: Snippet; children: Snippet } = $props();
</script>

<div class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
	<div class="flex flex-row items-center gap-2 bg-black/10 px-4 py-2 font-bold">
		<span>{title}</span>
		{#if info}
			<span class="cursor-help text-xs font-normal text-surface-500 hover:text-surface-200" title={info} aria-label={info}>ⓘ</span>
		{/if}
		{#if delta && Math.abs(delta.pct) > 0.00005}
			<Delta pct={delta.pct} cp={delta.cp} class="text-sm font-semibold" />
		{/if}
		<div class="ml-auto flex flex-row gap-2 text-xs font-normal">{@render actions?.()}</div>
	</div>
	<div class="px-4 py-3 max-sm:px-3">{@render children()}</div>
</div>
