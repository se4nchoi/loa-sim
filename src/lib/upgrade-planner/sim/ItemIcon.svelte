<!--
	Icon in lostark.bible's frame: grade gradient behind a rounded image, optional ark passive frame
	(evolution = gear, enlightenment = accessories, leap = bracelet), the blue "inherited" border on
	succession gear, and an optional corner badge.
-->
<script lang="ts">
	import { FRAME_BASE, GRADE_GRADIENTS } from '../icons';

	let {
		src,
		grade,
		size = 'size-10',
		badge,
		title,
		frame,
		inherited = false
	}: {
		src?: string;
		grade?: number;
		size?: string;
		badge?: string | number;
		title?: string;
		frame?: 'evolution' | 'enlightenment' | 'leap';
		inherited?: boolean;
	} = $props();
</script>

<div
	class="relative inset-shadow-2xs {size} shrink-0 rounded-sm bg-surface-700"
	style:background-image={grade !== undefined ? GRADE_GRADIENTS[grade] : undefined}
	{title}
>
	{#if src}<img {src} alt="" loading="lazy" class="h-full w-full rounded-[inherit] object-cover" />{/if}
	{#if frame}
		<div class="pointer-events-none absolute -inset-[15%] bg-cover" style:background-image="url({FRAME_BASE}/icon_frame_ap_{frame}.png)"></div>
	{/if}
	{#if inherited}
		<div class="pointer-events-none absolute -inset-px rounded-[inherit] bg-cover" style:background-image="url({FRAME_BASE}/icon_border_inherit.png)"></div>
	{/if}
	{#if badge !== undefined}
		<span class="absolute right-0 bottom-0 rounded-tl-sm rounded-br-sm bg-black/75 px-1 text-[11px] leading-tight font-bold text-surface-50">{badge}</span>
	{/if}
</div>
