<script lang="ts">
	import type { Snippet } from 'svelte';
	import Delta from './Delta.svelte';
	import type { SectionDelta } from './ui';

	let {
		title,
		delta,
		info,
		actions,
		toolbar,
		children
	}: {
		title: string;
		delta?: SectionDelta;
		info?: string;
		actions?: Snippet;
		/** A second header row that sticks with the header (e.g. Gems' level buttons). */
		toolbar?: Snippet;
		children: Snippet;
	} = $props();
</script>

<div class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
	<!-- Wraps on narrow screens: the actions drop to a second line instead of widening the page. Sticks under the
	     site header (and the phone CP bar) while its card scrolls by, so Max / Reset stay in reach. -->
	<div class="sticky top-(--sim-sticky-top,3rem) z-20 flex flex-row flex-wrap items-center gap-x-2 gap-y-1.5 rounded-t-xs bg-[color-mix(in_oklab,var(--color-surface-900),black_18%)] px-4 py-2 font-bold shadow-[0_6px_8px_-6px_rgb(0_0_0/0.6)] max-sm:px-3">
		<span>{title}</span>
		{#if info}
			<span class="cursor-help text-xs font-normal text-surface-500 hover:text-surface-200" title={info} aria-label={info}>ⓘ</span>
		{/if}
		{#if delta && Math.abs(delta.pct) > 0.00005}
			<Delta pct={delta.pct} cp={delta.cp} class="text-sm font-semibold" />
		{/if}
		<div class="ml-auto flex flex-row flex-wrap justify-end gap-2 text-xs font-normal">{@render actions?.()}</div>
		{#if toolbar}<div class="min-w-0 basis-full pt-1 text-sm font-normal">{@render toolbar()}</div>{/if}
	</div>
	<div class="px-4 py-3 max-sm:px-3">{@render children()}</div>
</div>
