<!-- "Hide ⌃ / Show ⌄" chip for a foldable panel's header (the header button itself handles the click). -->
<script lang="ts">
	let { open }: { open: boolean } = $props();
</script>

<span
	class="inline-flex shrink-0 items-center gap-1 rounded-xs border border-surface-600 bg-surface-800 px-1.5 py-0.5 text-[11px] font-semibold text-surface-200 transition group-hover:border-surface-400 group-hover:text-surface-50"
>
	{open ? 'Hide' : 'Show'}
	<svg viewBox="0 0 16 16" class="size-3 transition-transform {open ? 'rotate-180' : ''}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		<path d="M4 6l4 4 4-4" />
	</svg>
</span>
