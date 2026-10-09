<!--
	Bottom sheet for phones: slides up with an ease-out curve and closes on a drag down from its handle (or from any
	zone inside that uses the shared `drawerDrag` action, e.g. the content's title row), a tap on the handle, or Escape.
	No backdrop, so what's above it (the CP bar) stays usable; the page behind doesn't scroll while it's open.
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
		// The drawer is phones-only (lg:hidden): widening the window to desktop closes it, so its scroll lock doesn't
		// linger on a page that no longer shows it.
		const desktop = matchMedia('(min-width: 1024px)');
		if (desktop.matches) {
			open = false;
			return;
		}
		const onWiden = () => desktop.matches && (open = false);
		desktop.addEventListener('change', onWiden);
		window.addEventListener('resize', onWiden);
		const before = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (open = false);
		window.addEventListener('keydown', onKey);
		// iOS Safari ignores overflow:hidden on the body: block page-scrolling swipes outside the sheet instead
		// (sideways scrollers marked data-scroll-x, like the section chips, still swipe).
		const onTouchMove = (e: TouchEvent) => {
			const t = e.target as HTMLElement | null;
			if (t && (sheet?.contains(t) || t.closest('[data-scroll-x]'))) return;
			e.preventDefault();
		};
		document.addEventListener('touchmove', onTouchMove, { passive: false });
		return () => {
			document.body.style.overflow = before;
			window.removeEventListener('keydown', onKey);
			document.removeEventListener('touchmove', onTouchMove);
			desktop.removeEventListener('change', onWiden);
			window.removeEventListener('resize', onWiden);
		};
	});
</script>

{#if open}
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
