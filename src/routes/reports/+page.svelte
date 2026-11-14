<script lang="ts">
	import Segmented from '$lib/upgrade-planner/sim/Segmented.svelte';
	import ReportDialog from '$lib/ReportDialog.svelte';
	import { day, STATUS_TONE } from '$lib/reports';

	let { data } = $props();
	let tab = $state<'open' | 'closed'>('open');
	let reporting = $state(false);
	const isOpen = (s: string) => s === 'open' || s === 'in progress';
	const openCount = $derived(data.reports.filter((r) => isOpen(r.status)).length);
	const shown = $derived(data.reports.filter((r) => isOpen(r.status) === (tab === 'open')));
</script>

<svelte:head>
	<title>Reports · loa-sim</title>
</svelte:head>

<section aria-label="Reports" class="mx-auto flex max-w-3xl flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
	<div class="flex min-h-12 flex-row flex-wrap items-center gap-x-3 gap-y-2 bg-black/10 px-3 py-2">
		<h1 class="font-bold">Reports</h1>
		<Segmented
			value={tab}
			options={[
				{ value: 'open', label: `Open ${openCount}` },
				{ value: 'closed', label: `Closed ${data.reports.length - openCount}` }
			]}
			onselect={(v) => (tab = v)}
			label="Open or closed reports"
			size="h-7 px-3 text-xs whitespace-nowrap"
		/>
		<button type="button" class="ml-auto h-7 rounded-xs bg-accent-700 px-3 text-xs font-semibold text-white hover:bg-accent-600" aria-haspopup="dialog" onclick={() => (reporting = true)}>Report it</button>
	</div>
	<ul class="flex flex-col divide-y divide-neutral-950">
		{#each shown as r (r.number)}
			<li>
				<a href="/reports/{r.number}" class="flex flex-row items-center gap-2 px-3 py-2.5 text-sm hover:bg-white/[0.03]">
					<span class="hidden w-8 shrink-0 text-xs text-surface-500 tabular-nums sm:block">#{r.number}</span>
					<span class="shrink-0 rounded-xs border px-1.5 py-0.5 sm:w-[6.5rem] sm:px-0 text-center text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase {STATUS_TONE[r.status]}">{r.status}</span>
					<span class="line-clamp-2 min-w-0 flex-1 text-surface-100 sm:truncate">{r.title}</span>
					{#if r.kind}<span class="hidden shrink-0 text-xs text-surface-400 sm:inline">{r.kind}</span>{/if}
					<span class="flex w-8 shrink-0 items-center justify-end gap-1 text-xs text-surface-400 tabular-nums" title="{r.comments} replies">
						{#if r.comments}<svg class="size-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M2 2h12v9H6l-4 3z" /></svg>{r.comments}{/if}
					</span>
					<span class="w-14 shrink-0 text-right text-xs text-surface-500 tabular-nums" title="Last activity">{day(r.updated)}</span>
				</a>
			</li>
		{:else}
			<li class="px-3 py-6 text-center text-sm text-surface-400">No {tab} reports</li>
		{/each}
	</ul>
</section>
{#if reporting}<ReportDialog onclose={() => (reporting = false)} />{/if}
