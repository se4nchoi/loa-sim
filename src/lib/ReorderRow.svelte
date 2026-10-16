<script lang="ts">
	import type { Snippet } from 'svelte';
	let { id, group, label, onmove, onstep, children }: {id: string; group: string; label: string; onmove: (id: string, target: string) => void; onstep: (direction: number) => void; children: Snippet} = $props();
	let dragging = $state(false);
	let startY = 0;
	function move(e: PointerEvent) {
		if (!e.currentTarget || !(e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) return;
		if (!dragging && Math.abs(e.clientY - startY) < 6) return;
		dragging = true;
		const row = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-reorder-id]');
		if (row?.dataset.reorderGroup === group && row.dataset.reorderId !== id) onmove(id, row.dataset.reorderId!);
		if (e.clientY < 70) window.scrollBy(0, -14);
		else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 14);
	}
</script>

<div data-reorder-id={id} data-reorder-group={group} class="flex min-w-0 items-start {dragging ? 'bg-accent-500/10 outline outline-accent-400/50' : ''}">
	<div class="flex shrink-0 flex-col items-center pt-2 pl-1">
		<button type="button" aria-label={`Reorder ${label}. Use up and down arrow keys.`} title="Drag to reorder · ↑ / ↓" class="h-9 w-6 touch-none cursor-grab text-surface-500 hover:text-surface-100 active:cursor-grabbing"
			onpointerdown={e => { if (e.button !== 0) return; startY = e.clientY; e.currentTarget.setPointerCapture(e.pointerId); }} onpointermove={move}
			onpointerup={e => { dragging = false; if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId); }} onpointercancel={() => dragging = false}
			onkeydown={e => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); onstep(e.key === 'ArrowUp' ? -1 : 1); } }}>⠿</button>
		<details class="relative text-xs text-surface-400">
			<summary aria-label={`Move ${label}`} class="cursor-pointer list-none px-1">⋯</summary>
			<div class="absolute left-0 z-20 flex w-28 flex-col border border-surface-600 bg-surface-900 shadow-lg">
				<button type="button" class="p-2 text-left hover:bg-surface-800" onclick={() => onstep(-1)}>Move up</button>
				<button type="button" class="p-2 text-left hover:bg-surface-800" onclick={() => onstep(1)}>Move down</button>
			</div>
		</details>
	</div>
	<div class="min-w-0 flex-1">{@render children()}</div>
</div>
