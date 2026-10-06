<script lang="ts">
	import { onMount } from 'svelte';
	import AstrogemPanel from './AstrogemPanel.svelte';
	import { formatCp, formatPct, loadGold, saveGold } from './format';
	import type { Loadout } from './types';
	import { CATEGORY_LABELS, type Upgrade, type UpgradeCategory } from './upgrades';
	import WhatIfPanel from './WhatIfPanel.svelte';

	let {
		loadout,
		upgrades,
		cp,
		onclose
	}: { loadout: Loadout; upgrades: Upgrade[]; cp: number; onclose: () => void } = $props();

	let dialog: HTMLDialogElement;
	let tab = $state<'upgrades' | 'astrogems' | 'whatif'>('upgrades');
	let category = $state<UpgradeCategory | 'all'>('all');
	let gold = $state<Record<string, number>>({});

	onMount(() => {
		gold = loadGold();
		dialog.showModal();
	});

	const categories = $derived([...new Set(upgrades.map((u) => u.category))]);
	const efficiency = (u: Upgrade) => (gold[u.key] > 0 ? (u.gainPct / gold[u.key]) * 1e5 : null);
	const rows = $derived(
		upgrades
			.filter((u) => category === 'all' || u.category === category)
			.toSorted((a, b) => {
				// Rows with a gold cost rank by % per gold; the rest keep their CP order after them.
				const ea = efficiency(a);
				const eb = efficiency(b);
				if (ea !== null && eb !== null) return eb - ea;
				if (ea !== null) return -1;
				if (eb !== null) return 1;
				return b.gainPct - a.gainPct;
			})
	);
	const anyGold = $derived(upgrades.some((u) => gold[u.key] > 0));

	function setGold(key: string, value: string) {
		const n = Number(value);
		if (n > 0) gold[key] = n;
		else delete gold[key];
		saveGold($state.snapshot(gold));
	}

	const tabClass = (active: boolean) =>
		`rounded-xs px-3 py-1 text-sm transition ${active ? 'bg-surface-800 text-surface-50' : 'text-surface-300 hover:bg-black/20'}`;
	const chipClass = (active: boolean) =>
		`rounded-xs border px-2 py-0.5 text-xs transition ${active ? 'border-accent-500 bg-accent-500/15 text-accent-200' : 'border-surface-700 text-surface-300 hover:bg-black/20'}`;
</script>

<dialog
	bind:this={dialog}
	{onclose}
	onclick={(e) => e.target === dialog && dialog.close()}
	aria-labelledby="upgrade-planner-title"
	class="fixed top-[100px] m-0 max-h-none max-w-none bg-transparent p-0 text-inherit backdrop:bg-black/50 sm:left-1/2 sm:-translate-x-1/2"
>
	<div class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
		<div class="flex flex-row justify-between px-3 py-2 font-bold">
			<span id="upgrade-planner-title">Upgrade Planner</span>
			<button type="button" class="float-right text-surface-300 hover:text-surface-50" aria-label="Close" onclick={() => dialog.close()}>
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
			</button>
		</div>
		<div class="flex flex-row gap-1 px-3 py-2">
			<button type="button" class={tabClass(tab === 'upgrades')} onclick={() => (tab = 'upgrades')}>Upgrades</button>
			<button type="button" class={tabClass(tab === 'astrogems')} onclick={() => (tab = 'astrogems')}>Astrogems</button>
			<button type="button" class={tabClass(tab === 'whatif')} onclick={() => (tab = 'whatif')}>Honing What-If</button>
		</div>
		<div class="flex max-h-[60vh] w-[680px] flex-col gap-1 overflow-y-auto p-4 max-md:w-[100vw]">
			{#if tab === 'upgrades'}
				<span class="text-lg font-semibold">Next upgrades by combat power</span>
				<span class="text-sm text-surface-300">
					Each row is one step from your current loadout, scored with the same battle point system as the in-game
					Combat Power. Add a rough gold cost to any row to rank it by return per gold instead.
				</span>
				<div class="mt-2 flex flex-row flex-wrap gap-1">
					<button type="button" class={chipClass(category === 'all')} onclick={() => (category = 'all')}>All</button>
					{#each categories as c (c)}
						<button type="button" class={chipClass(category === c)} onclick={() => (category = c)}>{CATEGORY_LABELS[c]}</button>
					{/each}
				</div>
				<div class="mt-2 grid grid-cols-[1fr_max-content] items-center gap-x-3 md:grid-cols-[1fr_max-content_max-content_max-content]">
					<div class="text-xs text-surface-400">Upgrade</div>
					<div class="text-right text-xs text-surface-400">Combat Power</div>
					<div class="text-right text-xs text-surface-400 max-md:hidden">Gold (optional)</div>
					<div class="text-right text-xs text-surface-400 max-md:hidden">% / 100k</div>
					{#each rows as u (u.key)}
						<div class="col-span-full grid grid-cols-subgrid items-center rounded-xs py-1 transition duration-75 hover:bg-black/20">
							<div class="flex min-w-0 flex-col">
								<span class="text-sm text-surface-100">
									{u.title}{#if u.count > 1}<span class="ml-1 text-xs text-surface-400">×{u.count}</span>{/if}
								</span>
								<span class="text-xs text-surface-400">{u.detail}</span>
							</div>
							<div class="flex flex-col text-right">
								<span class="text-sm text-green-400">{u.approximate ? '≈' : ''}{formatPct(u.gainPct)}%</span>
								<span class="text-xs text-surface-400">→ {formatCp(cp * (1 + u.gainPct / 100))}</span>
							</div>
							<!-- Below md the gold cells drop to their own line under the row. -->
							<div class="col-span-full flex flex-row items-center justify-end gap-3 md:contents">
							<input
								type="number"
								min="0"
								step="1000"
								inputmode="numeric"
								placeholder="—"
								aria-label={`Gold cost for ${u.title}`}
								value={gold[u.key] ?? ''}
								onchange={(e) => setGold(u.key, e.currentTarget.value)}
								class="w-24 rounded-xs border border-surface-700 bg-surface-950 px-2 py-0.5 text-right text-sm text-surface-100 placeholder:text-surface-500 focus:border-accent-500 focus:outline-none"
							/>
							<span class="text-right text-sm {efficiency(u) !== null ? 'text-accent-300' : 'text-surface-500'}">
								{efficiency(u)?.toFixed(3) ?? '—'}<span class="text-xs text-surface-400 md:hidden"> % / 100k</span>
							</span>
							</div>
						</div>
					{/each}
				</div>
				<span class="mt-3 text-xs text-surface-400">
					≈ marks values that rely on an estimate (e.g. Weapon Power % depends on your total weapon power bonuses).
					{#if anyGold}Gold costs are saved in this browser only.{/if}
					DPS loadouts only. Honing and bracelets aren't listed; use Honing What-If.
				</span>
			{:else if tab === 'astrogems'}
				<AstrogemPanel {loadout} {cp} />
			{:else}
				<WhatIfPanel {loadout} {cp} />
			{/if}
		</div>
	</div>
</dialog>
