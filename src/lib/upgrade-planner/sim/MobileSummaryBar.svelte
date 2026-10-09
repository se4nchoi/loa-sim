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
		top = 'top-12'
	}: { current: number; simulated: number; children: Snippet; top?: string } = $props();

	// Collapsed by default so it doesn't cover the cards; the full summary opens on tap.
	let open = $state(false);
	// No scroll area of its own (that trapped swipes); instead it folds once the page has scrolled on a bit.
	$effect(() => {
		if (!open) return;
		const from = window.scrollY;
		const onScroll = () => Math.abs(window.scrollY - from) > 160 && (open = false);
		window.addEventListener('scroll', onScroll, { passive: true });
		return () => window.removeEventListener('scroll', onScroll);
	});
	const delta = $derived((simulated / current - 1) * 100);
</script>

<div class="sticky {top} z-40 -mx-4 mb-2 border-b border-neutral-800 bg-neutral-950/95 px-4 py-1.5 shadow-md shadow-black/40 backdrop-blur lg:hidden">
	<button
		type="button"
		class="flex w-full flex-row items-center gap-2 text-left hover:opacity-90"
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
		<span class="ml-auto flex items-center gap-1 rounded-xs border border-surface-600 bg-surface-800 px-2 py-1 text-xs font-semibold text-surface-100">
			{open ? 'Hide' : 'Show'}
			<svg class="size-3 transition {open ? 'rotate-180' : ''}" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 4l4 4 4-4z" /></svg>
		</span>
	</button>
	{#if open}
		<div id="mobile-summary" class="mt-2 pb-1">{@render children()}</div>
	{/if}
</div>
