<!--
	"Next Upgrades" sidebar card: the best one-step upgrades for the loadout. With `onapply` (the simulator passes
	it), each row gets an Apply button that makes the edit in the simulator.
		<UpgradePlanner loadout={loadout} onapply={(u) => …} />
-->
<script lang="ts">
	import { formatPct } from './format';
	import GoldCost from './GoldCost.svelte';
	import MaterialPrices from './MaterialPrices.svelte';
	import { autoHoningCosts, materialsFor } from './honing-cost';
	import { bookCost, byGold, formatGold, gold, goldPerPct, loadGold, setRankMode } from './gold-costs.svelte';
	import Segmented from './sim/Segmented.svelte';
	import { onMount } from 'svelte';
	import { liveUpgrades } from './live-upgrades';
	import { initSimState, type SimState } from './simulate';
	import { roleOf } from './roles';
	import type { Loadout } from './types';
	import UpgradeDialog from './UpgradeDialog.svelte';
	import UpgradeTitle from './UpgradeTitle.svelte';
	import { btn } from './sim/ui';
	import { CATEGORY_LABELS, topDistinct, type Upgrade } from './upgrades';

	let {
		loadout,
		limit = 5,
		onapply,
		simState,
		simBase,
		currentCp,
		characterKey = '',
		characterName,
		class: cls = ''
	}: { class?: string; characterKey?: string; characterName?: string; loadout: Loadout; limit?: number; simState?: SimState; simBase?: SimState; currentCp?: number; /** Returns false when it couldn't be applied. */ onapply?: (u: Upgrade) => boolean } = $props();

	/** Brief feedback on the row just applied. */
	let flash = $state<{ key: string; ok: boolean } | null>(null);
	let flashTimer: ReturnType<typeof setTimeout>;
	function apply(u: Upgrade) {
		const ok = onapply?.(u) ?? false;
		flash = { key: u.key, ok };
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flash = null), 1200);
	}

	const simNow = $derived(simState ? $state.snapshot(simState) : initSimState(loadout));
	const upgrades = $derived(liveUpgrades(loadout, simNow, simBase ?? initSimState(loadout)));
	/** This character's bound honing mats. */
	const bound = $derived(gold.bound[characterKey] ?? {});
	// Honing rows are priced from material prices; a cost typed on the row wins.
	const auto = $derived(gold.mode === 'gold' ? autoHoningCosts(upgrades.map((u) => u.key), simNow.gear, gold.prices, bound) : {});
	const costs = $derived({
		...Object.fromEntries(upgrades.flatMap((u) => (u.knownCost === undefined ? [] : [[u.key, u.knownCost]]))),
		...Object.fromEntries(upgrades.flatMap((u) => (bookCost(u, gold.bookPrices) === undefined ? [] : [[u.key, bookCost(u, gold.bookPrices)!]]))),
		...Object.fromEntries(Object.entries(auto).map(([k, c]) => [k, c.expected])),
		...gold.costs
	});
	const materials = $derived(materialsFor(upgrades.map((u) => u.key), simNow.gear));
	/** Nothing priced yet: every material counts as 0 (bound). */
	const unsetPrices = $derived(materials.every((id) => gold.prices[id] === undefined && bound[id] === undefined));
	let pricesOpen = $state(false);
	const cp = $derived(currentCp ?? loadout.combatPower?.score ?? roleOf(loadout).score(loadout.battlePoint.parts));
	let dialogOpen = $state(false);

	onMount(loadGold);
	/** Most CP first, or (with gold costs entered) least gold per 1% CP first. */
	// In gold mode, unpriced rows (biggest gain first) fill the card so costs can be added right here.
	const priced = $derived(gold.mode === 'gold' ? topDistinct(byGold(upgrades, costs), limit) : []);
	const shown = $derived(
		gold.mode === 'gold'
			? [...priced, ...topDistinct(upgrades.filter((u) => costs[u.key] === undefined), limit - priced.length)]
			: topDistinct(upgrades, limit)
	);
	const unpriced = $derived(upgrades.filter((u) => costs[u.key] === undefined).length);
</script>

<div class="flex min-h-0 flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800 {cls}">
	<div class="flex shrink-0 flex-row items-center gap-2 bg-black/10 px-3 py-2 font-bold">
		<div class="flex flex-row items-start">Next Upgrades</div>
		<div class="ml-auto">
			<Segmented
				value={gold.mode}
				options={[
					{ value: 'cp', label: 'Most CP', title: 'Biggest Combat Power gain first' },
					{ value: 'gold', label: 'Per gold', title: 'Least gold per 1% Combat Power first (enter gold costs on the rows)' }
				]}
				onselect={setRankMode}
				label="Rank upgrades by"
				size="h-6 px-2 text-xs"
			/>
		</div>
	</div>
	{#if upgrades.length === 0}
		<p class="p-2 text-sm text-surface-300">No one-step upgrades found for this loadout.</p>
	{:else}
		<!-- Kept above the list so they stay in reach when the list scrolls; they split the card's width. -->
		<div class="grid shrink-0 gap-1.5 px-2 py-1.5 {gold.mode === 'gold' && materials.length ? 'grid-cols-2' : 'grid-cols-1'}">
			{#if gold.mode === 'gold' && materials.length}
				<button
					type="button"
					class="flex h-7 min-w-0 items-center justify-center gap-1 truncate rounded-xs border px-2 text-xs font-semibold transition {unsetPrices
						? 'border-dashed border-amber-400/60 text-amber-300 hover:bg-amber-500/10'
						: 'border-surface-700 bg-surface-800 text-surface-100 hover:border-surface-500 hover:bg-surface-700'}"
					aria-haspopup="dialog"
					onclick={() => (pricesOpen = true)}
					title="Honing material prices (character-bound and market)"
				>
					Material prices<span class="font-normal opacity-70">{unsetPrices ? '· all 0' : ''}</span>
				</button>
			{/if}
			<button
				type="button"
				class="flex h-7 min-w-0 items-center justify-center gap-1 truncate rounded-xs border border-surface-700 bg-surface-800 px-2 text-xs font-semibold text-surface-100 transition hover:border-surface-500 hover:bg-surface-700"
				aria-haspopup="dialog"
				onclick={() => (dialogOpen = true)}
				title={gold.mode === 'gold' && unpriced ? `All Upgrades (${upgrades.length}): ${unpriced} have no gold cost yet` : undefined}
			>
				{#if gold.mode === 'gold' && unpriced}<span class="text-amber-300">Price {unpriced} more</span>{:else}All Upgrades ({upgrades.length}){/if}
			</button>
		</div>
		<div class="grid min-h-0 gap-x-2 overflow-y-auto overscroll-contain p-1 {onapply ? 'grid-cols-[1fr_max-content_max-content]' : 'grid-cols-[1fr_max-content]'}">
			{#each shown as u, i (u.key)}
				{@const honing = gold.mode === 'gold' && auto[u.key] && !gold.costs[u.key] ? auto[u.key] : null}
				{#if gold.mode === 'gold' && i === priced.length}
					{#if priced.length}
						<p class="col-span-full mt-1 border-t border-neutral-950 px-1.5 pt-2 pb-0.5 text-[11px] font-semibold tracking-wide text-surface-500 uppercase">Not priced yet</p>
					{:else}
						<p class="col-span-full px-1.5 py-1.5 text-xs text-surface-400">
							NA has no market data, so enter what each upgrade costs you to rank by gold per 1% CP.
						</p>
					{/if}
				{/if}
				<div
					class="col-span-full grid grid-cols-subgrid items-center rounded-xs px-1.5 transition duration-75 hover:bg-black/20 {gold.mode === 'gold' ? 'py-1.5' : 'py-1'}"
					title={u.detail}
				>
					<div class="flex min-w-0 flex-col">
						<UpgradeTitle {u} />
						{#if !u.subject}<span class="text-xs text-surface-500">{CATEGORY_LABELS[u.category]}</span>{/if}
						{#if gold.mode === 'gold'}<GoldCost {u} auto={auto[u.key]} showPer={false} />{/if}
					</div>
					<!-- On calculated honing rows the gold per 1% lines sit level with the avg / pity boxes. -->
					<span class="text-right whitespace-nowrap text-green-400 tabular-nums {honing ? 'self-end' : ''}">
						{u.approximate ? '≈' : ''}{formatPct(u.gainPct)}<span class="text-xs">%</span>
						{#if u.count > 1}<span class="block text-[11px] text-surface-400">each</span>{/if}
						{#if honing}
							<span class="mt-0.5 flex h-6 items-center justify-end text-[11px] text-amber-300/90" title="Gold per 1% Combat Power, from the average honing cost"
								>{formatGold(honing.expected / u.gainPct)} / 1%</span
							>
							<span class="mt-0.5 flex h-6 items-center justify-end text-[11px] text-orange-300" title="Gold per 1% Combat Power at pity"
								>{formatGold(honing.worst / u.gainPct)} / 1%</span
							>
						{:else if gold.mode === 'gold' && goldPerPct(u, costs)}
							<span class="block text-[11px] text-amber-300/90" title="Gold per 1% Combat Power">{formatGold(goldPerPct(u, costs)!)} / 1%</span>
						{/if}
					</span>
					{#if onapply}
						<button type="button" class="{btn} w-14 px-1.5" onclick={() => apply(u)} title="Make this change in the simulator">
							{flash?.key === u.key ? (flash.ok ? '✓' : 'Done') : 'Apply'}
						</button>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if pricesOpen}
	<MaterialPrices ids={materials} {characterKey} {characterName} onclose={() => (pricesOpen = false)} />
{/if}

{#if dialogOpen}
	<UpgradeDialog {upgrades} {cp} {auto} {costs} mode={gold.mode} onapply={onapply ? apply : undefined} {flash} onclose={() => (dialogOpen = false)} />
{/if}
