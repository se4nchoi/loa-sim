<script lang="ts">
	// The "moved" bar for visitors who came through loa-sim.vercel.app (static/migrate/ records the arrival).
	// Dismissing hides it until the next arrival from the old address, i.e. until the bookmark is still the old one.
	import { onMount } from 'svelte';

	const ARRIVED = 'loa-sim:arrived-from-old';
	const DISMISSED = 'loa-sim:moved-notice-dismissed';
	let show = $state(false);
	let carried = $state(false);

	onMount(() => {
		try {
			const arrived = Number(localStorage.getItem(ARRIVED) ?? 0);
			show = arrived > Number(localStorage.getItem(DISMISSED) ?? 0);
			carried = localStorage.getItem('loa-sim:imported') !== null;
		} catch { /* storage blocked: no bar */ }
	});

	function dismiss() {
		show = false;
		try { localStorage.setItem(DISMISSED, String(Date.now())); } catch { /* hidden for this visit */ }
	}
</script>

{#if show}
	<div role="status" class="bg-amber-400 text-neutral-950">
		<div class="mx-auto flex max-w-[1680px] items-center gap-3 px-4 py-2 text-sm">
			<span class="relative flex size-2.5 shrink-0" aria-hidden="true">
				<span class="absolute inline-flex size-full animate-ping rounded-full bg-neutral-950 opacity-60"></span>
				<span class="relative inline-flex size-2.5 rounded-full bg-neutral-950"></span>
			</span>
			<p class="flex-1">
				<b>loa-sim moved to loa-sim.pages.dev</b> · update your bookmark{#if carried}. Your browser data from the previous site was migrated safely!{/if}
			</p>
			<button type="button" onclick={dismiss} class="-mr-1 rounded-sm px-2 py-0.5 text-lg leading-none hover:bg-neutral-950/10" aria-label="Dismiss" title="Dismiss">×</button>
		</div>
	</div>
{/if}
