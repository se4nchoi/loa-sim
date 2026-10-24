<!--
	DPS mode's meter, LOA Logs style: the recorded clear's DPS as a big number that follows the Simulator's edits (it
	animates like the CP number), then one bar per skill: the recorded part, and the change from the edits highlighted.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { Tween } from 'svelte/motion';
	import { cubicOut } from 'svelte/easing';
	import { formatDamage } from '../dps-comparison';
	import type { Meter } from '../dps-meter';
	import { formatPct } from '../format';

	let { meter, skillName, skillIcon, color = 'var(--color-accent-500)', limit = 8 }: {
		meter: Meter;
		skillName: (id: number) => string;
		skillIcon: (id: number) => string | undefined;
		/** The class's meter colour. */
		color?: string;
		limit?: number;
	} = $props();

	const seconds = $derived(meter.durationMs / 1000);
	const dps = (damage: number) => damage / seconds;
	const before = $derived(dps(meter.before));
	const after = $derived(dps(meter.after));
	const pct = $derived((meter.after / meter.before - 1) * 100);
	const changed = $derived(Math.abs(pct) > 0.0005);
	/** 1.316b: a decimal more than the meter rows. */
	const headline = (n: number) => n >= 1e9 ? `${(n / 1e9).toFixed(3)}b` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}m` : formatDamage(n);

	// The headline number glides to each new value, like the Simulator's CP; it starts at the clear's own value.
	const shown = new Tween(untrack(() => after), { duration: 450, easing: cubicOut });
	$effect(() => {
		shown.target = after;
	});

	let all = $state(false);
	const rows = $derived(all ? meter.skills : meter.skills.slice(0, limit));
	const top = $derived(Math.max(1, ...meter.skills.map((s) => Math.max(s.before, s.after))));
	const share = (s: { before: number }) => (s.before / meter.before) * 100;
</script>

<div class="flex flex-col gap-3">
	<div class="flex flex-wrap items-end gap-x-3 gap-y-1">
		<!-- Recorded and simulated side by side, both large and one decimal finer than the bars, so a small change reads. -->
		<div>
			<p class="text-xs text-surface-400">Recorded</p>
			<p class="text-3xl font-semibold tabular-nums text-surface-300">{headline(before)}</p>
		</div>
		<p class="pb-1 text-2xl text-surface-500" aria-hidden="true">→</p>
		<div>
			<p class="text-xs text-surface-400">Simulated</p>
			<p class="text-4xl font-bold tabular-nums text-surface-50">{headline(shown.current)}</p>
		</div>
		<p class="pb-1.5 text-lg font-semibold tabular-nums {!changed ? 'text-surface-400' : pct > 0 ? 'text-green-400' : 'text-red-400'}">
			{#if changed}{after >= before ? '+' : ''}{formatDamage(after - before)} <span class="text-sm font-normal">({formatPct(pct)}%)</span>{:else}±0{/if}
		</p>
	</div>

	<ul class="flex flex-col gap-1" aria-label="Skills">
		{#each rows as s (s.id)}
			{@const gain = (s.after / s.before - 1) * 100}
			{@const icon = skillIcon(s.id)}
			<li class="relative overflow-hidden rounded-xs bg-surface-950/70">
				<!-- Recorded damage in the class colour; the edits' change on top of it, highlighted. -->
				<span class="absolute inset-y-0 left-0 opacity-35 transition-[width] duration-500" style:width={`${(Math.min(s.before, s.after) / top) * 100}%`} style:background={color}></span>
				{#if Math.abs(gain) > 0.0005}
					<span
						class="absolute inset-y-0 transition-[left,width] duration-500 {gain > 0 ? 'bg-green-400/60' : 'bg-red-400/60'}"
						style:left={`${(Math.min(s.before, s.after) / top) * 100}%`}
						style:width={`${(Math.abs(s.after - s.before) / top) * 100}%`}
					></span>
				{/if}
				<span class="relative flex h-8 items-center gap-2 px-2 text-sm">
					{#if icon}<img src={icon} alt="" class="size-6 shrink-0 rounded-xs" />{:else}<span class="size-6 shrink-0"></span>{/if}
					<span class="min-w-0 flex-1 truncate text-surface-100">{skillName(s.id)}</span>
					<span class="shrink-0 text-xs text-surface-400 tabular-nums">{share(s).toFixed(1)}%</span>
					<span class="w-16 shrink-0 text-right font-semibold tabular-nums text-surface-50">{formatDamage(dps(s.after))}</span>
					<span class="w-14 shrink-0 text-right text-xs tabular-nums {gain > 0.0005 ? 'text-green-400' : gain < -0.0005 ? 'text-red-400' : 'text-surface-500'}">{Math.abs(gain) > 0.0005 ? `${formatPct(gain)}%` : '—'}</span>
				</span>
			</li>
		{/each}
	</ul>
	{#if meter.skills.length > limit}
		<button type="button" class="self-start text-xs text-sky-300 hover:underline" onclick={() => (all = !all)}>{all ? 'Show top skills' : `Show all ${meter.skills.length} skills`}</button>
	{/if}

	{#if meter.notInMeter.length || meter.notes.length}
		<details class="text-xs text-amber-300/90">
			<summary class="cursor-pointer select-none hover:text-amber-200">※ Not counted yet: {meter.notInMeter.length ? meter.notInMeter.join(', ') : 'some effects'}{meter.notes.length ? ` · ${meter.notes.length} note${meter.notes.length > 1 ? 's' : ''}` : ''}</summary>
			<ul class="mt-1 space-y-0.5 pl-4 text-amber-200/80">
				{#if meter.notInMeter.length}<li>Counted in CP, not in DPS.</li>{/if}
				{#each meter.notes as note (note)}<li>{note}</li>{/each}
			</ul>
		</details>
	{/if}
</div>
