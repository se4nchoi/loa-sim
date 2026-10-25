<script lang="ts">
	import { ACTIVITY_EVENTS, EXPLORATION_EVENTS, statsBreakdown, type StatsReport } from '$lib/stats-model';
	import { CATEGORY_LABELS, type UpgradeCategory } from '$lib/upgrade-planner/upgrades';
	import { onMount } from 'svelte';
	import StatsTimeline from '$lib/StatsTimeline.svelte';
	import { CP_BUCKETS, LEVEL_BUCKETS } from '$lib/plan-stats';
	let days = $state('30');
	let report = $state<StatsReport | null>(null);
	let error = $state('');
	let busy = $state(false);
	let section = $state<'activity' | 'exploration' | 'plans'>('activity');
	let metric = $state('sim_open');
	let classSearch = $state('');
	let classSort = $state('loads');
	const fmt = (n: number) => n.toLocaleString();
	const percent = (n: number, total: number) => total ? `${(n / total * 100).toFixed(1)}%` : '0%';
	const classes = $derived(statsBreakdown(report?.totals ?? {}, 'class:'));
	const filteredClasses = $derived(classes.filter(([name]) => name.toLowerCase().includes(classSearch.trim().toLowerCase()))
		.toSorted((a, b) => classSort === 'name' ? a[0].localeCompare(b[0]) : b[1] - a[1]));
	const regions = $derived(statsBreakdown(report?.totals ?? {}, 'lookup:'));
	const upgrades = $derived(statsBreakdown(report?.totals ?? {}, 'upgrade:'));
	const classTotal = $derived(classes.reduce((n, [, value]) => n + value, 0));
	const chart = $derived([...(report?.days ?? [])].reverse());
	const chartLabel = $derived(ACTIVITY_EVENTS.find(([event]) => event === metric)?.[1] ?? 'Activity');
	const planCount = $derived(report?.totals['plan:count'] ?? 0);
	const popularTarget = $derived(LEVEL_BUCKETS.toSorted((a, b) => (report?.totals[`plan:level:${b[0]}`] ?? 0) - (report?.totals[`plan:level:${a[0]}`] ?? 0))[0]);
	const completeDays = $derived((report?.days ?? []).filter(d => d.date !== new Date().toISOString().slice(0, 10)));
	const peak = $derived([...completeDays].sort((a, b) => (b.counts.sim_open ?? 0) - (a.counts.sim_open ?? 0))[0]);
	const field = 'h-10 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-surface-100 focus:border-accent-500 focus:outline-none';

	onMount(() => { void load(); });
	async function load() {
		if (busy) return;
		busy = true;
		error = '';
		try {
			const res = await fetch(`/api/stats/public?days=${days}`);
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `Failed (${res.status})`);
			report = await res.json();
		} catch (err) {
			report = null;
			error = err instanceof Error ? err.message : String(err);
		} finally { busy = false; }
	}
</script>

<svelte:head>
	<title>Stats · loa-sim</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="mx-auto max-w-7xl space-y-6 text-sm">
	<header class="flex flex-wrap items-end justify-between gap-5">
		<div class="space-y-2">
			<h1 class="text-3xl font-bold tracking-tight">Simulator stats</h1>
			{#if report}<p class="text-xs text-surface-400 tabular-nums">{report.from} — {report.to} <span class="ml-2">UTC · today partial</span></p>{/if}
		</div>
		<div class="flex flex-wrap gap-2">
			<select aria-label="Date range" bind:value={days} class={field} onchange={() => load()} disabled={busy}>
				<option value="7">7 days</option><option value="30">30 days</option><option value="90">90 days</option><option value="all">All time</option>
			</select>
			<button type="button" onclick={() => load()} disabled={busy} class="h-10 rounded-md border border-accent-500/60 bg-accent-500/15 px-4 font-semibold text-accent-300 transition hover:bg-accent-500/25 disabled:opacity-50">{busy ? 'Loading…' : 'Refresh'}</button>
		</div>
	</header>
	{#if error}<p role="alert" class="rounded-md border border-red-500/30 bg-red-500/10 px-4 py-3 text-red-300">{error}</p>{/if}
	{#if !report && !error}<div role="status" class="rounded-xl border border-dashed border-neutral-800 px-5 py-16 text-center text-surface-400">Loading stats…</div>{/if}
	{#if report}
		<div class="flex gap-6 border-b border-neutral-800" aria-label="Stats views">
			{#each [['activity', 'Activity'], ['exploration', 'Exploration'], ['plans', 'Saved plans']] as [value, label]}
				<button type="button" aria-pressed={section === value} onclick={() => section = value as typeof section} class="border-b-2 pb-3 font-semibold transition {section === value ? 'border-accent-400 text-accent-300' : 'border-transparent text-surface-400 hover:text-surface-100'}">{label}</button>
			{/each}
		</div>
		{#if section === 'activity'}
			<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
				<div class="stat-card border-accent-500/30 bg-accent-500/5"><span class="stat-label" title="Approximate distinct loaded characters, not visitors. Redis HyperLogLog standard error: 0.81%.">Est. distinct characters</span><strong class="stat-value text-accent-300">{fmt(report.distinctCharacters)}</strong></div>
				{#each ACTIVITY_EVENTS.slice(0, 3) as [event, label]}<div class="stat-card"><span class="stat-label">{label}</span><strong class="stat-value">{fmt(report.totals[event] ?? 0)}</strong></div>{/each}
			</div>
			<section class="panel overflow-hidden" aria-label="Daily activity">
				<div class="flex flex-wrap items-center justify-between gap-3 p-5">
					<h2 class="font-semibold">Daily activity</h2>
					<div class="flex flex-wrap gap-1">{#each ACTIVITY_EVENTS.slice(0, 3) as [event, label]}<button type="button" aria-label={label} aria-pressed={metric === event} onclick={() => metric = event} class="rounded-md px-2.5 py-1.5 text-xs transition {metric === event ? 'bg-accent-500/15 text-accent-300' : 'text-surface-400 hover:bg-neutral-800 hover:text-surface-100'}">{event === 'lookup' ? 'Loads' : event === 'sim_open' ? 'Sim opens' : 'Saves'}</button>{/each}</div>
				</div>
				<StatsTimeline days={chart} {metric} label={chartLabel}/>
			</section>
			<div class="grid gap-3 sm:grid-cols-2">
				<div class="rounded-xl border border-amber-300/15 bg-amber-300/[0.025] px-5 py-4"><span class="stat-label">Most loaded class</span><div class="mt-2 flex items-baseline justify-between gap-3"><strong class="text-xl font-semibold text-amber-200">{classTotal >= 20 ? classes.find(([name]) => name !== 'Unknown class')?.[0] ?? '—' : '—'}</strong><span class="text-xs text-surface-400">{classTotal >= 20 ? `${fmt(classes.find(([name]) => name !== 'Unknown class')?.[1] ?? 0)} loads` : '20 loads needed'}</span></div></div>
				<div class="rounded-xl border border-neutral-800 bg-neutral-900/40 px-5 py-4"><span class="stat-label">Peak simulator day · complete days</span><div class="mt-2 flex items-baseline justify-between gap-3"><strong class="text-xl font-semibold">{peak && peak.counts.sim_open ? peak.date : '—'}</strong><span class="text-xs text-surface-400">{fmt(peak?.counts.sim_open ?? 0)} opens</span></div></div>
			</div>
			<div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
				<section class="panel p-5"><div class="mb-4 flex items-center justify-between"><h2 class="font-semibold">Loads by class</h2><span class="text-xs text-surface-400">{fmt(classTotal)} loads</span></div>
					<div class="mb-5 flex gap-2"><input aria-label="Search classes" bind:value={classSearch} placeholder="Search class" class="{field} min-w-0 flex-1"/><select aria-label="Class sort order" bind:value={classSort} class={field}><option value="loads">Most loads</option><option value="name">A–Z</option></select></div>
					<div class="grid gap-x-8 gap-y-4 md:grid-cols-2">{#each filteredClasses as [name, count]}<div class="min-w-0"><div class="mb-1.5 flex items-baseline justify-between gap-2"><span class="truncate text-surface-200">{name}</span><span class="shrink-0 tabular-nums">{fmt(count)} <span class="ml-1.5 inline-block w-12 text-right text-xs text-surface-400">{percent(count, classTotal)}</span></span></div><div class="h-1 overflow-hidden rounded-full bg-neutral-800"><div class="h-full rounded-full {name === 'Unknown class' ? 'bg-amber-400/60' : 'bg-accent-500/70'}" style:width={`${count / Math.max(1, classes[0]?.[1] ?? 1) * 100}%`}></div></div></div>{:else}<p class="text-surface-400">{classSearch ? 'No matching classes' : 'No character loads'}</p>{/each}</div>
				</section>
				<div class="space-y-5">
					<section class="panel p-5"><h2 class="mb-5 font-semibold">Loads by region</h2><div class="space-y-5">{#each regions as [name, count]}<div><div class="mb-2 flex justify-between"><span class="text-surface-200">{name === 'NA' ? 'North America' : name === 'CE' ? 'Europe Central' : name}</span><span class="tabular-nums">{fmt(count)}</span></div><div class="h-2 overflow-hidden rounded-full bg-neutral-800"><div class="h-full rounded-full {name === 'NA' ? 'bg-sky-400/70' : 'bg-amber-300/70'}" style:width={percent(count, report.totals.lookup ?? 0)}></div></div></div>{:else}<p class="text-surface-400">No character loads</p>{/each}</div></section>
					<section class="panel divide-y divide-neutral-800 px-5">{#each ACTIVITY_EVENTS.slice(3) as [event, label]}<div class="flex items-center justify-between py-4"><span class="text-surface-300">{label}</span><strong class="tabular-nums">{fmt(report.totals[event] ?? 0)}</strong></div>{/each}</section>
				</div>
			</div>
		{:else if section === 'exploration'}
			<p class="text-xs text-surface-400">{report.explorationSince ? `Collecting since ${report.explorationSince} · UTC` : 'Awaiting first exploration event'}</p>
			<div class="grid gap-3 sm:grid-cols-3">{#each EXPLORATION_EVENTS as [event, label]}<div class="stat-card"><span class="stat-label">{label}</span><strong class="stat-value text-accent-300">{report.explorationSince ? fmt(report.totals[event] ?? 0) : '—'}</strong></div>{/each}</div>
			<section class="panel p-5"><h2 class="mb-5 font-semibold">Applied upgrades</h2><div class="grid gap-x-12 gap-y-5 sm:grid-cols-2">{#each upgrades as [name, count]}<div><div class="mb-2 flex justify-between"><span>{CATEGORY_LABELS[name as UpgradeCategory] ?? name}</span><strong class="tabular-nums text-accent-300">{fmt(count)}</strong></div><div class="h-1.5 overflow-hidden rounded-full bg-neutral-800"><div class="h-full rounded-full bg-accent-500/70" style:width={`${count / Math.max(1, upgrades[0]?.[1] ?? 1) * 100}%`}></div></div></div>{:else}<p class="text-surface-400">No applied upgrades recorded</p>{/each}</div></section>
		{:else}
			<div class="grid grid-cols-2 gap-3 sm:grid-cols-3">
				<div class="stat-card"><span class="stat-label">Sampled saved plans</span><strong class="stat-value text-accent-300">{fmt(planCount)}</strong></div>
				<div class="stat-card"><span class="stat-label">Dealer / support plans</span><strong class="stat-value">{fmt(report.totals['plan:role:dealer'] ?? 0)} <span class="text-base text-surface-500">/</span> {fmt(report.totals['plan:role:support'] ?? 0)}</strong></div>
				<div class="stat-card"><span class="stat-label">Most common item-level goal</span><strong class="mt-1 text-xl font-semibold text-amber-200">{planCount >= 20 ? popularTarget[1] : '—'}</strong>{#if planCount < 20}<span class="text-xs text-surface-400">20 samples needed</span>{/if}</div>
			</div>
			{#if planCount}
				<div class="grid gap-5 lg:grid-cols-2">
					{#each [{title:'CP gain in saved plans',prefix:'plan:cp:',bins:CP_BUCKETS}, {title:'Target item level',prefix:'plan:level:',bins:LEVEL_BUCKETS}] as histogram}
						<section class="panel p-5"><h2 class="mb-5 font-semibold">{histogram.title}</h2><div class="space-y-4">{#each histogram.bins as [key,label]}{@const value = report.totals[`${histogram.prefix}${key}`] ?? 0}<div class="grid grid-cols-[6.25rem_minmax(0,1fr)_4rem] items-center gap-3"><span class="text-xs text-surface-300">{label}</span><div class="h-2 rounded-full bg-neutral-800"><div class="h-full rounded-full bg-accent-500/75" style:width={percent(value,planCount)}></div></div><span class="text-right text-xs tabular-nums">{fmt(value)} <span class="text-surface-500">plans</span></span></div>{/each}</div></section>
					{/each}
				</div>
			{:else}<div class="panel px-5 py-12 text-center text-surface-400">No eligible saved plans yet</div>{/if}
		{/if}
		<details class="panel group"><summary class="px-5 py-4 font-semibold text-surface-300">Daily data</summary><div class="overflow-x-auto border-t border-neutral-800"><table class="w-full min-w-[850px] text-left text-xs tabular-nums"><thead class="bg-neutral-900 text-surface-400"><tr><th class="px-5 py-3 font-medium">UTC date</th><th class="px-3 py-3 text-right font-medium">Est. characters</th>{#each ACTIVITY_EVENTS as [, label]}<th class="px-3 py-3 text-right font-medium">{label}</th>{/each}</tr></thead><tbody>{#each report.days as day}<tr class="border-t border-neutral-800/60 hover:bg-neutral-900/60"><td class="whitespace-nowrap px-5 py-3 text-surface-300">{day.date}{day.date === report.to ? ' · partial' : ''}</td><td class="px-3 py-3 text-right">{fmt(day.distinctCharacters)}</td>{#each ACTIVITY_EVENTS as [event]}<td class="px-3 py-3 text-right">{fmt(day.counts[event] ?? 0)}</td>{/each}</tr>{/each}</tbody></table></div></details>
		<details class="panel"><summary class="px-5 py-4 text-xs text-surface-400">Collection details</summary><ul class="list-disc space-y-2 border-t border-neutral-800 px-9 py-4 text-xs text-surface-300">
			<li>Legacy activity since October 20, 2026. Counts are actions, not people.</li>
			<li>Distinct characters are approximate. Period totals use a union, not a sum of daily counts.</li>
			<li>Unknown class includes historical “Other” loads. Their original classes were not retained.</li>
			<li>Share requests count server loads with known preview bots filtered; they do not confirm human views.</li>
			<li>Updated tracking includes pasted loads and visible simulator visits. Earlier simulator opens used tab-level deduplication.</li>
			<li>Exploration counts apply to simulations, not in-game purchases. No historical backfill.</li>
			<li>Plan samples include new named saves with settled calculations and no flagged baseline or Willpower error. Samples contain CP-gain and item-level ranges plus build role; no names or equipment.</li>
			{#if report.updatedAt}<li>Report generated {report.updatedAt.replace('T', ' ').slice(0, 19)} UTC.</li>{/if}
		</ul></details>
	{/if}
</div>

<style>
	.panel { border: 1px solid var(--color-neutral-800); border-radius: 0.75rem; background: color-mix(in oklab, var(--color-neutral-900) 45%, transparent); }
	.stat-card { display: flex; min-width: 0; flex-direction: column; gap: 0.65rem; border: 1px solid var(--color-neutral-800); border-radius: 0.75rem; background: color-mix(in oklab, var(--color-neutral-900) 45%, transparent); padding: 1.1rem 1.25rem; }
	.stat-label { color: var(--color-surface-400); font-size: 0.75rem; }
	.stat-value { font-size: clamp(1.6rem, 4vw, 2.25rem); font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.04em; line-height: 1.15; }
</style>
