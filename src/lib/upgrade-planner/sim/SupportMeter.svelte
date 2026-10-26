<!--
	The DPS sim for a support: the party DPS their buffs added in the run, recorded and with the edits, then by kind of
	buff and by dealer (in their class colour), with each buff's uptime.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import type { SupportKind } from '$lib/logs/protocol';
	import { classColorByName } from '../class-colors';
	import { formatDamage } from '../dps-comparison';
	import { formatPct } from '../format';
	import type { SupportMeter } from '../support-meter';

	let { meter, color = 'var(--color-accent-500)' }: { meter: SupportMeter; color?: string } = $props();

	const seconds = $derived(meter.durationMs / 1000);
	const dps = (damage: number) => damage / seconds;
	const before = $derived(dps(meter.before));
	const after = $derived(dps(meter.after));
	const pct = $derived((meter.after / meter.before - 1) * 100);
	const changed = $derived(Math.abs(pct) > 0.0005);
	const headline = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(3)}b` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : formatDamage(n));
	const shown = new Tween(untrack(() => after), { duration: 450, easing: cubicOut });
	$effect(() => {
		shown.target = after;
	});

	const KIND_NAMES: Record<SupportKind, string> = { attack: 'Attack Power buffs', damage: 'Damage buffs', brand: 'Brand', other: 'Other effects' };
	const KIND_STATS: Record<SupportKind, string> = { attack: 'Attack Power · Ally Atk. Power Enhancement', damage: 'Ally Damage Enhancement', brand: 'Brand Power', other: 'Not moved by gear' };
	const top = $derived(Math.max(1, ...meter.kinds.map((k) => Math.max(k.before, k.after))));
	const topDealer = $derived(Math.max(1, ...meter.dealers.map((d) => Math.max(d.before, d.after))));
	const gainOf = (a: number, b: number) => (a > 0 ? (b / a - 1) * 100 : 0);
	const up = $derived(meter.uptime);
	const pctOf = (x: number) => `${Math.round(x * 100)}%`;
</script>

{#snippet bar(label: string, sub: string, b: number, a: number, max: number, fill: string, share: string)}
	{@const gain = gainOf(b, a)}
	<li class="relative overflow-hidden rounded-xs bg-surface-950/70">
		<span class="absolute inset-y-0 left-0 opacity-35 transition-[width] duration-500" style:width={`${(Math.min(b, a) / max) * 100}%`} style:background={fill}></span>
		{#if Math.abs(gain) > 0.0005}
			<span class="absolute inset-y-0 transition-[left,width] duration-500 {gain > 0 ? 'bg-green-400/60' : 'bg-red-400/60'}" style:left={`${(Math.min(b, a) / max) * 100}%`} style:width={`${(Math.abs(a - b) / max) * 100}%`}></span>
		{/if}
		<span class="relative flex h-9 items-center gap-2 px-2 text-sm">
			<span class="min-w-0 flex-1"><span class="block truncate text-surface-100">{label}</span><span class="block truncate text-[11px] text-surface-400">{sub}</span></span>
			<span class="shrink-0 text-xs text-surface-400 tabular-nums">{share}</span>
			<span class="w-16 shrink-0 text-right font-semibold tabular-nums text-surface-50">{formatDamage(dps(a))}</span>
			<span class="w-14 shrink-0 text-right text-xs tabular-nums {gain > 0.0005 ? 'text-green-400' : gain < -0.0005 ? 'text-red-400' : 'text-surface-500'}">{Math.abs(gain) > 0.0005 ? `${formatPct(gain)}%` : '—'}</span>
		</span>
	</li>
{/snippet}

<div class="flex flex-col gap-3">
	<div class="flex flex-wrap items-end gap-x-3 gap-y-1">
		<div>
			<p class="text-xs text-surface-400">Recorded</p>
			<p class="text-3xl font-semibold tabular-nums text-surface-300">{headline(before)}</p>
		</div>
		<p class="pb-1 text-2xl text-surface-500" aria-hidden="true">→</p>
		<div>
			<p class="text-xs text-surface-400">Simulated · party DPS added</p>
			<p class="text-4xl font-bold tabular-nums text-surface-50">{headline(shown.current)}</p>
		</div>
		<p class="pb-1.5 text-lg font-semibold tabular-nums {!changed ? 'text-surface-400' : pct > 0 ? 'text-green-400' : 'text-red-400'}">
			{#if changed}{after >= before ? '+' : ''}{formatDamage(after - before)} <span class="text-sm font-normal">({formatPct(pct)}%)</span>{:else}±0{/if}
		</p>
	</div>

	{#if up}
		<p class="flex flex-wrap gap-1.5 text-xs" aria-label="Buff uptime">
			{#each [['Attack', up.attack], ['Brand', up.brand], ['Identity', up.identity], ['Hyper', up.hyper]] as [name, v] (name)}
				<span class="rounded-xs border border-surface-700 bg-surface-950/60 px-1.5 py-0.5 text-surface-300">{name} <span class="font-semibold text-surface-50 tabular-nums">{Math.round(Number(v) * 100)}%</span></span>
			{/each}
		</p>
	{/if}

	<ul class="flex flex-col gap-1" aria-label="By buff">
		{#each meter.kinds.filter((k) => k.before > 0) as k (k.kind)}
			{@render bar(KIND_NAMES[k.kind], KIND_STATS[k.kind], k.before, k.after, top, color, `${((k.before / meter.before) * 100).toFixed(1)}%`)}
		{/each}
	</ul>

	<ul class="flex flex-col gap-1" aria-label="By dealer">
		{#each meter.dealers as d, i (i)}
			{@const dealerUp = d.uptime ? ` · uptime Atk ${pctOf(d.uptime.attack)} · Brand ${pctOf(d.uptime.brand)} · Identity ${pctOf(d.uptime.identity)} · Hyper ${pctOf(d.uptime.hyper)}` : ''}
			{@render bar(d.cls || 'Dealer', `${((d.before / Math.max(1, d.damage)) * 100).toFixed(1)}% of their damage${dealerUp}`, d.before, d.after, topDealer, classColorByName(d.cls) ?? color, '')}
		{/each}
	</ul>
</div>
