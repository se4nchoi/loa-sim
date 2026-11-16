<!-- The /stats "Fun facts" tab: headline facts from existing counters, plus the fun-stats ranges (see $lib/fun-stats). -->
<script lang="ts">
	import { EFFICIENCY_BUCKETS, POWER_BUCKETS, VISIT_CHARACTER_BUCKETS, VISIT_UPGRADE_BUCKETS } from '$lib/fun-stats';
	import { LEVEL_BUCKETS } from '$lib/plan-stats';
	import { statsBreakdown, type StatsReport } from '$lib/stats-model';
	import { CATEGORY_LABELS, type UpgradeCategory } from '$lib/upgrade-planner/upgrades';
	import { classIconUrl } from '$lib/upgrade-planner/class-icons';

	let { report }: { report: StatsReport } = $props();
	const t = $derived(report.totals);
	const n = (key: string) => t[key] ?? 0;
	const fmt = (v: number) => v.toLocaleString();
	const pct = (a: number, b: number) => b ? `${Math.round(a / b * 100)}%` : '—';
	const sum = (prefix: string, keys: readonly (readonly [string, string])[]) => keys.reduce((s, [k]) => s + n(prefix + k), 0);

	const SUPPORT_CLASSES = ['Bard', 'Paladin', 'Artist', 'Valkyrie'];
	const classes = $derived(statsBreakdown(t, 'class:').filter(([c]) => c !== 'Unknown class'));
	const classTotal = $derived(classes.reduce((s, [, v]) => s + v, 0));
	const supportLoads = $derived(classes.filter(([c]) => SUPPORT_CLASSES.includes(c)).reduce((s, [, v]) => s + v, 0));
	const rarest = $derived(classes.at(-1));
	const hours = $derived(Array.from({ length: 24 }, (_, h) => [String(h).padStart(2, '0'), n(`hour:${String(h).padStart(2, '0')}`)] as const));
	const hourTotal = $derived(hours.reduce((s, [, v]) => s + v, 0));
	const busiestHour = $derived(hours.toSorted((a, b) => b[1] - a[1])[0]);
	const hourMax = $derived(Math.max(1, ...hours.map(([, v]) => v)));
	const recommendedTotal = $derived(statsBreakdown(t, 'opportunity:best:').reduce((s, [, v]) => s + v, 0));
	const appliedTotal = $derived(statsBreakdown(t, 'upgrade:').reduce((s, [, v]) => s + v, 0));
	const gap = $derived((['honing', 'karma', 'quality', 'engraving', 'accessory', 'gem'] as UpgradeCategory[])
		.map(c => ({ c, recommended: n(`opportunity:best:${c}`) / Math.max(1, recommendedTotal), applied: n(`upgrade:${c}`) / Math.max(1, appliedTotal) }))
		.filter(r => r.recommended || r.applied));
	const goldPicks = $derived(n('decision:rank:gold:best') + n('decision:rank:gold:other'));
	const cpPicks = $derived(n('decision:rank:cp:best') + n('decision:rank:cp:other'));

	const classMax = $derived(classes[0]?.[1] ?? 1);
	/** Highest average item-level range per class; only classes with enough ranged lookups qualify. */
	const gearedClass = $derived(classes.map(([c]) => {
		const counts = LEVEL_BUCKETS.map(([k]) => n(`level:class:${c}:${k}`));
		const total = counts.reduce((a, b) => a + b, 0);
		return { c, total, score: total ? counts.reduce((a, v, i) => a + v * i, 0) / total : 0 };
	}).filter(r => r.total >= 20).toSorted((a, b) => b.score - a.score)[0]);
	const gearedLabel = $derived(gearedClass ? LEVEL_BUCKETS[Math.round(gearedClass.score)][1] : '');

	const histograms = $derived([
		{ title: 'Item level of loaded characters', prefix: 'level:', bins: LEVEL_BUCKETS, unit: 'loads' },
		{ title: 'Combat Power · dealers', prefix: 'power:dealer:', bins: POWER_BUCKETS, unit: 'loads' },
		{ title: 'Combat Power · supports', prefix: 'power:support:', bins: POWER_BUCKETS, unit: 'loads' },
		{ title: 'Gold paid for +1% CP (applied, priced)', prefix: 'efficiency:', bins: EFFICIENCY_BUCKETS, unit: 'upgrades' },
		{ title: 'Upgrades applied per visit', prefix: 'visit:upgrades:', bins: VISIT_UPGRADE_BUCKETS, unit: 'visits' },
		{ title: 'Characters loaded per visit', prefix: 'visit:characters:', bins: VISIT_CHARACTER_BUCKETS, unit: 'visits' },
	].map(h => ({ ...h, total: sum(h.prefix, h.bins) })));
</script>

<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
	<div class="card"><span class="label">Came back another day</span><strong class="value text-accent-300">{pct(report.returningCharacters ?? 0, report.distinctCharacters)}</strong><span class="hint">{fmt(report.returningCharacters ?? 0)} of {fmt(report.distinctCharacters)} characters</span></div>
	<div class="card"><span class="label">Most loyal character</span><strong class="value">{report.mostDaysOneCharacter ?? 0} <span class="text-base text-surface-500">days</span></strong><span class="hint">of {report.days.length} in range · anonymous</span></div>
	<div class="card"><span class="label">Support classes' share of loads</span><strong class="value text-amber-200">{pct(supportLoads, classTotal)}</strong><span class="hint">{SUPPORT_CLASSES.join(', ')}</span></div>
	<div class="card"><span class="label">Rarest class</span><strong class="value flex items-center gap-2 text-lg">{#if rarest && classIconUrl(rarest[0])}<img src={classIconUrl(rarest[0])} alt="" class="size-7" />{/if}{rarest?.[0] ?? '—'}</strong><span class="hint">{rarest && classes[0] ? `${(classes[0][1] / Math.max(1, rarest[1])).toFixed(1)}× fewer loads than ${classes[0][0]}` : ''}</span></div>
</div>

<section class="panel p-5">
	<div class="mb-4 flex flex-wrap items-baseline justify-between gap-2">
		<h2 class="font-semibold">Class popularity</h2>
		<span class="text-xs text-surface-400">{fmt(classTotal)} character loads</span>
	</div>
	<ol class="gap-x-8 sm:columns-2 lg:columns-3">
		{#each classes as [c, v], i}
			<li class="mb-2.5 grid break-inside-avoid grid-cols-[1.5rem_1.75rem_minmax(0,1fr)_3rem] items-center gap-2">
				<span class="text-right text-xs tabular-nums {i < 3 ? 'font-semibold text-amber-200' : 'text-surface-500'}">{i + 1}</span>
				{#if classIconUrl(c)}<img src={classIconUrl(c)} alt="" class="size-7" loading="lazy" />{:else}<span></span>{/if}
				<div class="min-w-0"><div class="truncate text-xs text-surface-200">{c}</div><div class="mt-1 h-1 rounded-full bg-neutral-800"><div class="h-full rounded-full bg-accent-500/70" style:width="{v / classMax * 100}%"></div></div></div>
				<span class="text-right text-xs tabular-nums text-surface-400">{pct(v, classTotal)}</span>
			</li>
		{/each}
	</ol>
	{#if gearedClass}<p class="mt-4 flex items-center gap-2 text-xs text-surface-300">{#if classIconUrl(gearedClass.c)}<img src={classIconUrl(gearedClass.c)} alt="" class="size-5" />{/if}<span>Best-geared class: <strong class="text-surface-100">{gearedClass.c}</strong>, typically {gearedLabel}</span></p>{/if}
</section>

<section class="panel p-5">
	<div class="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h2 class="font-semibold">Loads by hour (UTC)</h2><span class="text-xs text-surface-400">{hourTotal ? `Busiest: ${busiestHour[0]}:00 UTC · ${pct(busiestHour[1], hourTotal)} of loads` : 'Collecting since the Nov 16 release'}</span></div>
	<div class="flex h-32 items-end gap-0.5" role="img" aria-label="Character loads by UTC hour">
		{#each hours as [h, v]}<div class="flex h-full flex-1 flex-col justify-end" title="{h}:00 UTC · {fmt(v)} loads"><div class="rounded-t-sm {h === busiestHour[0] && v ? 'bg-amber-300/80' : 'bg-accent-500/60'}" style:height="{v / hourMax * 100}%"></div></div>{/each}
	</div>
	<div class="mt-1 flex justify-between text-[10px] text-surface-500 tabular-nums"><span>00</span><span>06</span><span>12</span><span>18</span><span>23</span></div>
</section>

<div class="grid gap-5 lg:grid-cols-2">
	<section class="panel p-5">
		<h2 class="mb-1 font-semibold">Recommended vs applied</h2>
		<p class="mb-4 text-xs text-surface-400">Share of top recommendations vs share of what players actually applied.</p>
		<div class="space-y-3">{#each gap as r}<div class="grid grid-cols-[6.5rem_minmax(0,1fr)_5.5rem] items-center gap-3 text-xs"><span class="text-surface-300">{CATEGORY_LABELS[r.c] ?? r.c}</span><div class="space-y-1"><div class="h-1.5 rounded-full bg-neutral-800"><div class="h-full rounded-full bg-sky-400/70" style:width="{r.recommended * 100}%"></div></div><div class="h-1.5 rounded-full bg-neutral-800"><div class="h-full rounded-full bg-accent-500/75" style:width="{r.applied * 100}%"></div></div></div><span class="text-right tabular-nums">{Math.round(r.recommended * 100)}% → {Math.round(r.applied * 100)}%</span></div>{/each}</div>
		<p class="mt-3 text-[11px] text-surface-500"><span class="text-sky-300">■</span> recommended · <span class="text-accent-300">■</span> applied</p>
	</section>
	<section class="panel p-5">
		<h2 class="mb-4 font-semibold">Do players take the top pick?</h2>
		<div class="grid grid-cols-2 gap-3">
			<div><span class="label">Gold ranking</span><strong class="value block text-accent-300">{pct(n('decision:rank:gold:best'), goldPicks)}</strong><span class="hint">{fmt(goldPicks)} priced choices</span></div>
			<div><span class="label">CP ranking</span><strong class="value block">{pct(n('decision:rank:cp:best'), cpPicks)}</strong><span class="hint">{fmt(cpPicks)} choices</span></div>
		</div>
		<p class="mt-4 text-xs text-surface-400">Gold mode is used for {pct(n('decision:mode:gold'), n('decision:mode:gold') + n('decision:mode:cp'))} of choices. Only {pct(n('opportunity:coverage:complete'), n('opportunity:coverage:complete') + n('opportunity:coverage:partial'))} of recommendations had every price filled in.</p>
	</section>
</div>

<div class="grid gap-5 lg:grid-cols-2">
	{#each histograms as h}
		<section class="panel p-5"><div class="mb-4 flex items-baseline justify-between gap-2"><h2 class="font-semibold">{h.title}</h2><span class="text-xs text-surface-400">{fmt(h.total)} {h.unit}</span></div>
			{#if h.total}<div class="space-y-3">{#each h.bins as [key, label]}{@const v = n(h.prefix + key)}<div class="grid grid-cols-[6.25rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-xs"><span class="text-surface-300">{label}</span><div class="h-2 rounded-full bg-neutral-800"><div class="h-full rounded-full bg-accent-500/75" style:width="{v / h.total * 100}%"></div></div><span class="text-right tabular-nums">{pct(v, h.total)}</span></div>{/each}</div>
			{:else}<p class="py-6 text-center text-surface-400">Collecting since the Nov 16 release</p>{/if}
		</section>
	{/each}
</div>

<style>
	.panel { border: 1px solid var(--color-neutral-800); border-radius: 0.75rem; background: color-mix(in oklab, var(--color-neutral-900) 45%, transparent); }
	.card { display: flex; min-width: 0; flex-direction: column; gap: 0.4rem; border: 1px solid var(--color-neutral-800); border-radius: 0.75rem; background: color-mix(in oklab, var(--color-neutral-900) 45%, transparent); padding: 1.1rem 1.25rem; }
	.label { color: var(--color-surface-400); font-size: 0.75rem; }
	.hint { color: var(--color-surface-500); font-size: 0.7rem; }
	.value { font-size: clamp(1.4rem, 3.5vw, 2rem); font-weight: 650; font-variant-numeric: tabular-nums; letter-spacing: -0.03em; line-height: 1.15; }
</style>
