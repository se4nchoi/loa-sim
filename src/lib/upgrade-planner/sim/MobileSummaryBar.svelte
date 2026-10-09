<!--
	Phone/tablet version of the summary: a slim bar that stays pinned under the site header while scrolling,
	with a toggle that expands the full summary (undo/redo, per-section changes).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { formatCp } from '../format';
	import Delta from './Delta.svelte';

	let {
		current,
		simulated,
		children,
		top = 'top-12',
		nav,
		onbudget
	}: { current: number; simulated: number; children: Snippet; top?: string; /** Section links, always shown under the CP line. */ nav?: Snippet<[string]>; onbudget?: () => void } = $props();

	// Collapsed by default so it doesn't cover the cards; the full summary opens on tap.
	let open = $state(false);
	// No scroll area of its own (that trapped swipes). It stays open while the page scrolls (its Reset lives there)
	// until Hide is tapped.
	const delta = $derived((simulated / current - 1) * 100);
</script>

<div data-cp-bar class="sticky {top} z-40 -mx-4 mb-2 border-b border-neutral-800 bg-neutral-950/95 px-4 py-1.5 shadow-md shadow-black/40 backdrop-blur lg:hidden">
	<div class="flex items-center gap-1.5">
	<button
		type="button"
		class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5 text-left hover:opacity-90"
		aria-expanded={open}
		aria-controls="mobile-summary"
		onclick={() => (open = !open)}
	>
		<span class="text-xs text-surface-400">CP</span>
		<!-- Very narrow phones drop the starting CP; the change still shows it. -->
		<span class="text-sm text-surface-300 tabular-nums max-[400px]:hidden">{formatCp(current)}</span>
		<span class="text-surface-500 max-[400px]:hidden">→</span>
		<span class="text-base font-bold text-red-400 tabular-nums">{formatCp(simulated)}</span>
		<Delta pct={delta} cp={simulated - current} class="text-xs font-semibold" />
	</button>
	{#if onbudget}<button type="button" onclick={onbudget} class="h-7 shrink-0 rounded-xs border border-amber-300/70 bg-amber-500/5 px-2 text-xs font-semibold text-amber-200 hover:bg-amber-500/15" aria-haspopup="dialog">Budget</button>{/if}
	<button type="button" class="flex h-7 shrink-0 items-center gap-1 rounded-xs border border-surface-600 bg-surface-800 px-2 text-xs font-semibold text-surface-100" aria-expanded={open} aria-controls="mobile-summary" onclick={() => open = !open}>
			{open ? 'Hide' : 'Show'}
			<svg class="size-3 transition {open ? 'rotate-180' : ''}" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 4l4 4 4-4z" /></svg>
	</button>
	</div>
	{#if nav}<nav aria-label="Simulator sections" class="-mx-4 mt-1.5">{@render nav('px-4 pb-0.5')}</nav>{/if}
	{#if open}
		<div id="mobile-summary" class="mt-2 pb-1">{@render children()}</div>
	{/if}
</div>
