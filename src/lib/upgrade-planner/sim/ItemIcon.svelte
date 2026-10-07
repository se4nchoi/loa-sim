<!-- Icon in lostark.bible's frame: grade gradient behind a rounded image, optional corner badge. -->
<script lang="ts">
	import { GRADE_GRADIENTS } from '../icons';

	let {
		src,
		grade,
		size = 'size-10',
		badge,
		title
	}: { src?: string; grade?: number; size?: string; badge?: string | number; title?: string } = $props();
</script>

<div
	class="relative inset-shadow-2xs {size} shrink-0 rounded-sm bg-surface-700"
	style:background-image={grade !== undefined ? GRADE_GRADIENTS[grade] : undefined}
	{title}
>
	{#if src}<img {src} alt="" loading="lazy" class="h-full w-full rounded-[inherit] object-cover" />{/if}
	{#if badge !== undefined}
		<span class="absolute right-0 bottom-0 rounded-tl-sm rounded-br-sm bg-black/70 px-1 text-[10px] leading-tight font-bold text-surface-50">{badge}</span>
	{/if}
</div>
