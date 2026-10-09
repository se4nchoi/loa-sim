<!--
	Bottom sheet for phones: slides up with an ease-out curve, follows the finger on its handle, and closes on a pull
	past a third of its height or a quick flick down (otherwise it springs back). Tapping the handle or the backdrop,
	or Escape, closes it too. The page behind doesn't scroll while it's open.
		<BottomDrawer bind:open label="Next Upgrades">{#snippet header()}…{/snippet}…body…</BottomDrawer>
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { cubicOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';

	let { open = $bindable(false), label, header, children }: { open: boolean; label: string; header?: Snippet; children: Snippet } = $props();

	let sheet = $state<HTMLDivElement>();
	/** Current pull-down distance (px) while dragging; 0 at rest. */
	let drag = $state(0);
	let dragging = $state(false);
	let start = { y: 0, t: 0 };
	let moved = false;

	function down(e: PointerEvent) {
		dragging = true;
		moved = false;
		start = { y: e.clientY, t: performance.now() };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
	}
	function move(e: PointerEvent) {
		if (!dragging) return;
		const dy = e.clientY - start.y;
		if (Math.abs(dy) > 4) moved = true;
		// Free pull down; a little resistance pulling up past the top.
		drag = dy > 0 ? dy : dy / 4;
	}
	function up(e: PointerEvent) {
		if (!dragging) return;
		dragging = false;
		const dy = e.clientY - start.y;
		const speed = dy / Math.max(1, performance.now() - start.t); // px per ms
		const height = sheet?.offsetHeight ?? 600;
		if (moved && (dy > height / 3 || speed > 0.6)) open = false;
		else drag = 0;
	}
	function tap() {
		if (!moved) open = false; // a tap (not the end of a drag) closes
	}

	$effect(() => {
		if (!open) return;
		drag = 0;
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
	<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-black/60 lg:hidden"
		style:opacity={sheet && drag > 0 ? Math.max(0.2, 1 - drag / sheet.offsetHeight) : undefined}
		transition:fade={{ duration: 220 }}
		onclick={() => (open = false)}
	></div>
	<div
		bind:this={sheet}
		class="fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-xl border-t border-surface-700 bg-surface-900 shadow-2xl shadow-black lg:hidden"
		style:transform={drag ? `translateY(${drag}px)` : undefined}
		style:transition={dragging ? 'none' : 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)'}
		role="dialog"
		aria-modal="true"
		aria-label={label}
		transition:fly={{ y: 700, duration: 320, easing: cubicOut, opacity: 1 }}
	>
		<button
			type="button"
			class="flex shrink-0 touch-none flex-col items-center gap-1.5 px-4 pt-2 pb-1.5"
			aria-label={`Close ${label}`}
			onpointerdown={down}
			onpointermove={move}
			onpointerup={up}
			onpointercancel={up}
			onclick={tap}
		>
			<span class="h-1 w-10 rounded-full bg-surface-500"></span>
			{@render header?.()}
		</button>
		{@render children()}
	</div>
{/if}
