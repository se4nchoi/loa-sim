<!-- Phones/tablets: Updates as a folded card above the Roster. Folded it shows the newest update; tapping it opens
     the full card in place. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import SiteNews from './SiteNews.svelte';
	import { UPDATES, type UpdateKind } from './site-news';
	import { isFresh, readNewsSeen } from './news-seen.svelte';

	let open = $state(false);
	onMount(readNewsSeen);
	const freshCount = $derived(UPDATES.filter((u) => isFresh(u.date)).length);
	const latest = UPDATES[0];
	const KIND: Record<UpdateKind, string> = {
		new: 'border-accent-500/60 text-accent-200',
		improved: 'border-sky-500/50 text-sky-300',
		fix: 'border-green-500/50 text-green-300'
	};
</script>

<section aria-label="Updates" class="flex flex-col rounded-xs bg-surface-900 shadow-sm shadow-neutral-800 lg:hidden">
	<button type="button" class="flex w-full min-w-0 flex-row items-center gap-2 bg-black/10 px-3 py-2 text-left" aria-expanded={open} aria-controls="site-news-strip" onclick={() => (open = !open)}>
		<span class="shrink-0 font-bold text-surface-100">Updates</span>
		{#if freshCount}<span class="shrink-0 rounded-full bg-accent-700 px-1.5 text-[10px] font-bold text-white">{freshCount} new</span>{/if}
		<!-- Folded: the newest update and its tag; open, the list below shows it. -->
		<span class="flex min-w-0 flex-1 items-center justify-end gap-2">
			{#if !open && latest}
				<span class="min-w-0 truncate text-sm text-surface-100">{latest.title}</span>
				<span class="shrink-0 rounded-xs border px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase {KIND[latest.kind]}">{latest.kind}</span>
			{/if}
		</span>
		<svg class="size-3 shrink-0 text-surface-400 transition {open ? 'rotate-180' : ''}" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 4l4 4 4-4z" /></svg>
	</button>
	{#if open}
		<div id="site-news-strip"><SiteNews heading={false} class="rounded-t-none shadow-none" /></div>
	{/if}
</section>
