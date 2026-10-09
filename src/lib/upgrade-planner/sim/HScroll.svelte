<!--
	One row that scrolls sideways: no scrollbar, the mouse wheel scrolls it too, and touch swipes stay allowed inside the
	phone drawer's scroll lock (data-scroll-x). Used by the Jump to chips and the Gems toolbar.
		<HScroll class="gap-1.5">…buttons…</HScroll>
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { class: cls = '', children }: { class?: string; children: Snippet } = $props();
</script>

<div
	data-scroll-x
	class="flex min-w-0 flex-row overflow-x-auto [scrollbar-width:none]! [&::-webkit-scrollbar]:hidden! {cls}"
	onwheel={(e) => {
		const el = e.currentTarget;
		if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
		el.scrollLeft += e.deltaY;
		e.preventDefault();
	}}
>
	{@render children()}
</div>
