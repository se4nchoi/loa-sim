<script lang="ts">
	import { onMount } from 'svelte';
	import { formatCp, formatPct } from './format';
	import { btn } from './sim/ui';
	import UpgradeTitle from './UpgradeTitle.svelte';
	import GoldCost from './GoldCost.svelte';
	import { byGold, formatGold, goldPerPct, type RankMode } from './gold-costs.svelte';
	import type { HoningCost } from './honing-cost';
	import { CATEGORY_LABELS, type Upgrade, type UpgradeCategory } from './upgrades';

	let {
		upgrades,
		cp,
		onclose,
		onapply,
		flash = null,
		mode = 'cp',
		auto = {},
		costs = {}
	}: {
		upgrades: Upgrade[];
		cp: number;
		onclose: () => void;
		onapply?: (u: Upgrade) => void;
		/** The row just applied, for feedback. */
		flash?: { key: string; ok: boolean } | null;
		/** Which upgrades the top three cards show: biggest gain, or least gold per 1% CP. */
		mode?: RankMode;
		/** Honing rows priced from material prices. */
		auto?: Record<string, HoningCost>;
		/** Gold cost per row: typed, else calculated. */
		costs?: Record<string, number>;
	} = $props();

	let dialog: HTMLDialogElement;
	onMount(() => dialog.showModal());

	// Groups in order of their best upgrade, each sorted by CP gain.
	const groups = $derived.by(() => {
		const by = new Map<UpgradeCategory, Upgrade[]>();
		for (const u of upgrades) by.set(u.category, [...(by.get(u.category) ?? []), u]);
		return [...by.entries()]
			.map(([category, list]) => ({ category, list: list.toSorted((a, b) => b.gainPct - a.gainPct) }))
			.sort((a, b) => b.list[0].gainPct - a.list[0].gainPct);
	});
	const best = $derived(mode === 'gold' ? byGold(upgrades, costs).slice(0, 3) : upgrades.slice(0, 3));
</script>

<dialog
	bind:this={dialog}
	{onclose}
	onclick={(e) => e.target === dialog && dialog.close()}
	aria-labelledby="upgrade-planner-title"
	class="fixed top-[80px] m-0 max-h-none max-w-none bg-transparent p-0 text-inherit backdrop:bg-black/60 sm:left-1/2 sm:-translate-x-1/2"
>
	<div class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
		<div class="flex flex-row items-center justify-between px-4 py-2.5 font-bold">
			<span id="upgrade-planner-title">Next upgrades</span>
			<button type="button" class="text-surface-300 hover:text-surface-50" aria-label="Close" onclick={() => dialog.close()}>
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
			</button>
		</div>
		<div class="flex max-h-[70vh] w-[620px] flex-col gap-4 overflow-y-auto px-4 py-4 max-md:w-[100vw]">
			{#if best.length}
				<div class="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
					{#each best as u, i (u.key)}
						<div class="flex flex-col gap-0.5 rounded-xs border border-surface-700 bg-black/20 p-2.5">
							<span class="text-[11px] font-semibold tracking-wide text-surface-400 uppercase">#{i + 1} · {CATEGORY_LABELS[u.category]}</span>
								<UpgradeTitle {u} />
							<span class="text-lg font-bold text-green-400">{u.approximate ? '≈' : ''}{formatPct(u.gainPct)}%{#if u.count > 1}<span class="ml-1 text-xs font-normal text-surface-400">each</span>{/if}</span>
							{#if mode === 'gold'}<span class="text-xs text-amber-300/90 tabular-nums">{formatGold(goldPerPct(u, costs)!)} gold per 1%</span>{/if}
						</div>
					{/each}
				</div>
			{/if}
			{#each groups as g (g.category)}
				<section class="flex flex-col">
					<h3 class="mb-1 text-xs font-semibold tracking-wide text-surface-400 uppercase">{CATEGORY_LABELS[g.category]}</h3>
					{#each g.list as u (u.key)}
						<div class="flex flex-row items-center gap-3 border-t border-neutral-950 py-2">
							<div class="flex min-w-0 flex-1 flex-col">
									<UpgradeTitle {u} />
								<span class="text-xs text-surface-400">{u.detail}</span>
								{#if mode === 'gold'}<GoldCost {u} auto={auto[u.key]} />{/if}
							</div>
							<div class="flex shrink-0 flex-col text-right">
								<span class="text-sm font-semibold text-green-400 tabular-nums">{u.approximate ? '≈' : ''}{formatPct(u.gainPct)}%{#if u.count > 1}<span class="ml-1 text-xs font-normal text-surface-400">each</span>{/if}</span>
								<span class="text-xs text-surface-500 tabular-nums">{formatCp(cp * (1 + u.gainPct / 100))}</span>
							</div>
							{#if onapply}
								<button type="button" class="{btn} w-14 shrink-0 px-1.5" onclick={() => onapply(u)} title="Make this change in the simulator">
									{flash?.key === u.key ? (flash.ok ? '✓' : 'Done') : 'Apply'}
								</button>
							{/if}
						</div>
					{/each}
				</section>
			{/each}
		</div>
	</div>
</dialog>
