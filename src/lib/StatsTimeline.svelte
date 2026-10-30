<script lang="ts">
	import { chartGeometry } from './stats-chart';
	import type { StatsDay } from './stats-model';
	let {days, metric, label}: {days: StatsDay[]; metric: string; label: string} = $props();
	let active = $state<number | null>(null);
	const geometry = $derived(chartGeometry(days.map(day => day.counts[metric] ?? 0)));
	const index = $derived(Math.min(active ?? days.length - 1, days.length - 1));
	const selected = $derived(days[index]);
	const point = $derived(geometry.points[index]);
	const fmt = (n: number) => n.toLocaleString();
	const partial = (date: string) => date === new Date().toISOString().slice(0, 10);
	function navigate(event: KeyboardEvent, i: number) {
		let next = i;
		if (event.key === 'ArrowLeft') next--;
		else if (event.key === 'ArrowRight') next++;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = days.length - 1;
		else return;
		event.preventDefault();
		next = Math.max(0, Math.min(days.length - 1, next));
		((event.currentTarget as HTMLElement).parentElement?.children[next] as HTMLElement | undefined)?.focus();
	}
</script>

<div class="px-4 pb-4 sm:px-5" aria-label={`${label} by UTC day`}>
	<div class="mb-3 flex items-baseline justify-between gap-3 pl-[3.25rem] text-xs tabular-nums">
		<span class="text-surface-400">{selected?.date ?? '—'}{selected && partial(selected.date) ? ' · partial' : ''}</span>
		<strong class="text-base text-accent-300">{fmt(selected?.counts[metric] ?? 0)} <span class="text-xs font-normal text-surface-400">{label.toLowerCase()}</span></strong>
	</div>
	<div class="flex h-40 gap-3 sm:h-48">
		<div class="flex w-10 shrink-0 flex-col justify-between py-4 text-right text-[11px] text-surface-400 tabular-nums"><span>{fmt(geometry.ceiling)}</span><span>{fmt(Math.round(geometry.ceiling / 2))}</span><span>0</span></div>
		<div class="relative min-w-0 flex-1">
			<div class="pointer-events-none absolute inset-x-0 top-[14%] border-t border-neutral-800"></div><div class="pointer-events-none absolute inset-x-0 top-[53%] border-t border-neutral-800"></div><div class="pointer-events-none absolute inset-x-0 bottom-[7%] border-t border-neutral-800"></div>
			<svg viewBox="0 0 1000 190" preserveAspectRatio="none" aria-hidden="true" class="pointer-events-none absolute inset-0 h-full w-full overflow-visible">
				<defs><linearGradient id="stats-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="var(--color-accent-500)" stop-opacity="0.24"/><stop offset="100%" stop-color="var(--color-accent-500)" stop-opacity="0.015"/></linearGradient></defs>
				<path d={geometry.area} fill="url(#stats-area)"/>
				<path d={geometry.line} fill="none" stroke="var(--color-accent-400)" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round"/>
			</svg>
			{#if point}<div class="pointer-events-none absolute inset-y-0 w-px bg-accent-400/20" style:left={`${point.x / 10}%`}></div><div class="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-neutral-950 {selected && partial(selected.date) ? 'bg-amber-300' : 'bg-accent-300'}" style:left={`${point.x / 10}%`} style:top={`${point.y / 190 * 100}%`}></div>{/if}
			<div class="absolute inset-0 grid" style:grid-template-columns={`repeat(${Math.max(1, days.length)}, minmax(0, 1fr))`}>
				{#each days as day, i (day.date)}<button type="button" class="min-w-0 rounded-sm focus-visible:outline-1 focus-visible:outline-accent-400/60" aria-label={`${day.date}: ${fmt(day.counts[metric] ?? 0)} ${label.toLowerCase()}${partial(day.date) ? ', partial day' : ''}`} tabindex={i === index ? 0 : -1} onpointerenter={() => active = i} onfocus={() => active = i} onclick={() => active = i} onkeydown={event => navigate(event, i)}></button>{/each}
			</div>
		</div>
	</div>
	<div class="mt-2 ml-[3.25rem] flex justify-between text-[11px] text-surface-400 tabular-nums"><span>{days[0]?.date.slice(5).replace('-', '/') ?? ''}</span>{#if days.length > 2}<span>{days[Math.floor(days.length / 2)].date.slice(5).replace('-', '/')}</span>{/if}{#if days.length > 1}<span>{days.at(-1)!.date.slice(5).replace('-', '/')}</span>{/if}</div>
</div>
