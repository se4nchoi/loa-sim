<!--
	"Next Upgrades" sidebar card: the best one-step upgrades for the loadout. With `onapply` (the simulator passes
	it), each row gets an Apply button that makes the edit in the simulator.
		<UpgradePlanner loadout={loadout} onapply={(u) => …} />
-->
<script lang="ts">
	import { formatPct } from './format';
	import GoldCost from './GoldCost.svelte';
	import { byGold, formatGold, gold, goldPerPct, loadGold, setRankMode } from './gold-costs.svelte';
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
		currentCp
	}: { loadout: Loadout; limit?: number; simState?: SimState; simBase?: SimState; currentCp?: number; /** Returns false when it couldn't be applied. */ onapply?: (u: Upgrade) => boolean } = $props();

	/** Brief feedback on the row just applied. */
	let flash = $state<{ key: string; ok: boolean } | null>(null);
	let flashTimer: ReturnType<typeof setTimeout>;
	function apply(u: Upgrade) {
		const ok = onapply?.(u) ?? false;
		flash = { key: u.key, ok };
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flash = null), 1200);
	}

	const upgrades = $derived(liveUpgrades(loadout, simState ? $state.snapshot(simState) : initSimState(loadout), simBase ?? initSimState(loadout)));
	const cp = $derived(currentCp ?? loadout.combatPower?.score ?? roleOf(loadout).score(loadout.battlePoint.parts));
	let dialogOpen = $state(false);

	onMount(loadGold);
	/** Most CP first, or (with gold costs entered) least gold per 1% CP first. */
	// In gold mode, unpriced rows (biggest gain first) fill the card so costs can be added right here.
	const priced = $derived(gold.mode === 'gold' ? topDistinct(byGold(upgrades, gold.costs), limit) : []);
	const shown = $derived(
		gold.mode === 'gold'
			? [...priced, ...topDistinct(upgrades.filter((u) => !gold.costs[u.key]), limit - priced.length)]
			: topDistinct(upgrades, limit)
	);
	const unpriced = $derived(upgrades.filter((u) => !gold.costs[u.key]).length);
</script>

<div class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
	<div class="flex flex-row items-center gap-2 bg-black/10 px-3 py-2 font-bold">
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
		<div class="grid gap-x-2 p-1 {onapply ? 'grid-cols-[1fr_max-content_max-content]' : 'grid-cols-[1fr_max-content]'}">
			{#each shown as u, i (u.key)}
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
						{#if gold.mode === 'gold'}<GoldCost {u} showPer={false} />{/if}
					</div>
					<span class="text-right whitespace-nowrap text-green-400 tabular-nums">
						{u.approximate ? '≈' : ''}{formatPct(u.gainPct)}<span class="text-xs">%</span>
						{#if u.count > 1}<span class="block text-[11px] text-surface-400">each</span>{/if}
						{#if gold.mode === 'gold' && goldPerPct(u, gold.costs)}
							<span class="block text-[11px] text-amber-300/90" title="Gold per 1% Combat Power">{formatGold(goldPerPct(u, gold.costs)!)} / 1%</span>
						{/if}
					</span>
					{#if onapply}
						<button type="button" class="{btn} w-14 px-1.5" onclick={() => apply(u)} title="Make this change in the simulator">
							{flash?.key === u.key ? (flash.ok ? '✓' : 'Done') : 'Apply'}
						</button>
					{/if}
				</div>
			{/each}
			<div class="col-span-full flex w-full flex-row items-center gap-2 px-1">
				{#if gold.mode === 'gold' && priced.length && unpriced}
					<button
						type="button"
						class="text-xs text-amber-300/80 underline hover:text-amber-200"
						aria-haspopup="dialog"
						onclick={() => (dialogOpen = true)}
						title="Upgrades with no gold cost yet; add prices in All Upgrades to rank them"
					>
						Price {unpriced} more
					</button>
				{/if}
				<span class="flex-1"></span>
				<button
					class="text-xs text-surface-300 underline hover:text-surface-300"
					type="button"
					aria-haspopup="dialog"
					onclick={() => (dialogOpen = true)}
				>
					All Upgrades ({upgrades.length})
				</button>
			</div>
		</div>
	{/if}
</div>

{#if dialogOpen}
	<UpgradeDialog {upgrades} {cp} mode={gold.mode} onapply={onapply ? apply : undefined} {flash} onclose={() => (dialogOpen = false)} />
{/if}
