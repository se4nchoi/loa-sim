<!--
	Bottom sheet for phones: slides up with an ease-out curve and closes on a drag down from its handle (or from any
	zone inside that uses the shared `drawerDrag` action, e.g. the content's title row), a tap on the handle or the
	clear backdrop, or Escape. The page behind doesn't scroll while it's open.
		<BottomDrawer bind:open label="Next Upgrades">…body…</BottomDrawer>
-->
<script lang="ts" module>
	import { getContext } from 'svelte';
	import type { Action } from 'svelte/action';

	const KEY = 'bottom-drawer:drag';
	/** Drag zone inside the open drawer (no-op elsewhere). */
	export const useDrawerDrag = (): Action => getContext<Action>(KEY) ?? (() => {});
</script>

<script lang="ts">
	import { setContext, type Snippet } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { sheetDrag } from './sheet-drag';

	let {
		open = $bindable(false),
		label,
		top = 0,
		children
	}: { open: boolean; label: string; /** Px from the top of the screen the sheet may reach (e.g. below a pinned bar); 0 = default. */ top?: number; children: Snippet } = $props();

	let sheet = $state<HTMLDivElement>();
	const options = () => ({ sheet: () => sheet, close: () => (open = false) });
	const drawerDrag: Action = (node) => {
		const { destroy } = sheetDrag(node, options());
		return { destroy };
	};
	setContext(KEY, drawerDrag);

	$effect(() => {
		if (!open) return;
		const before = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (open = false);
		window.addEventListener('keydown', onKey);
		return () => {
			document.body.style.overflow = before;
			window.removeEventListener('keydown', onKey);
		};
	});
</script>

{#if open}
	<!-- Clear (no dimming), so the page and its CP bar stay readable; a tap on it still closes the drawer. -->
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div class="fixed inset-0 z-50 lg:hidden" onclick={() => (open = false)}></div>
	<div
		bind:this={sheet}
		style:max-height={top > 0 ? `calc(100dvh - ${Math.round(top)}px)` : undefined}
		class="fixed inset-x-0 bottom-0 z-50 flex max-h-[calc(100dvh-8.25rem)] flex-col rounded-t-xl border-t border-surface-700 bg-surface-900 shadow-2xl shadow-black lg:hidden"
		role="dialog"
		aria-modal="true"
		aria-label={label}
		transition:fly={{ y: 700, duration: 320, easing: cubicOut, opacity: 1 }}
	>
		<button type="button" class="flex shrink-0 flex-col items-center px-4 pt-3 pb-2" aria-label={`Close ${label}`} use:drawerDrag onclick={() => (open = false)}>
			<span class="h-1.5 w-12 rounded-full bg-surface-500"></span>
		</button>
		{@render children()}
	</div>
{/if}
