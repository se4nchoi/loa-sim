<!--
	DPS mode's Target DPS: the cheapest path of upgrades from the Simulator's state to a DPS on the picked attempt
	(dps-target.ts), by fewest steps or by least gold. A failed pull's "Plan for X DPS" calls planFor.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { autoHoningCosts } from './honing-cost';
	import { bookCost, bookPricesFor, costsForCharacter, formatGold, gold, loadGold, manualGoldCost, materialPricesFor } from './gold-costs.svelte';
	import { liveUpgrades } from './live-upgrades';
	import { rollsFor } from './acc-rolls.svelte';
	import { applyUpgrade } from './apply-upgrade';
	import { groupSteps, parseTargetDps, planToTarget, type TargetPlan } from './dps-target';
	import type { DpsSelection } from './dps-selection.svelte';
	import { formatDamage } from './dps-comparison';
	import { formatPct } from './format';
	import { classTextColor } from './class-colors';
	import { CATEGORY_LABELS, type Upgrade } from './upgrades';
	import UpgradeTitle from './UpgradeTitle.svelte';
	import Segmented from './sim/Segmented.svelte';
	import { btn } from './sim/ui';
	import type { SimState } from './simulate';
	import type { Loadout } from './types';

	let { loadout, simState, base, characterKey, selection, meterDps, onapply }: {
		loadout: Loadout;
		/** The Simulator's state (a plain copy): plans start from it. */
		simState: SimState;
		base: SimState;
		characterKey: string;
		selection: DpsSelection;
		/** The meter's simulated DPS now. */
		meterDps: number;
		/** Puts the plan's end state into the Simulator. */
		onapply: (state: SimState) => void;
	} = $props();

	onMount(loadGold);
	let text = $state('');
	let byGold = $state(false);
	let plan = $state<TargetPlan | null>(null);
	let planning = $state(false);
	let error = $state<string | null>(null);
	let box = $state<HTMLElement | null>(null);

	const materialPrices = $derived(materialPricesFor(characterKey));
	const unsetPrices = $derived(Object.keys(materialPrices).length === 0);
	/** Gold for an upgrade made from state `s`, as Next Upgrades prices it (a typed or book price, else honing from prices). */
	function goldFor(u: Upgrade, s: SimState): number | null {
		const book = bookCost(u, bookPricesFor(characterKey));
		if (book !== undefined) return book;
		const manual = manualGoldCost(u, costsForCharacter(characterKey));
		if (manual !== undefined) return manual;
		const honing = autoHoningCosts([u.key], s.gear, materialPrices, gold.bound[characterKey] ?? {}, s.karma)[u.key];
		if (honing) return honing.expected;
		return u.knownCost ?? null;
	}
	const dpsText = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(3)}b` : formatDamage(n));

	function run(start: SimState, done: (p: TargetPlan | null) => void) {
		const target = parseTargetDps(text, meterDps);
		if (target === null) { error = 'Enter a DPS like 1.4b or 1400m, or +5%.'; return; }
		error = null;
		planning = true;
		const sel = selection, gold = byGold;
		// Let the button show "Planning…" before the work (a few hundred ms per step).
		setTimeout(() => {
			try {
				done(planToTarget({ loadout, base, start, selection: sel, targetDps: target, byGold: gold, goldFor,
					upgradesFor: (st) => liveUpgrades(loadout, st, base, rollsFor(characterKey), true) }));
			} catch { error = "Couldn't plan from here."; }
			finally { planning = false; }
		}, 20);
	}
	const planNow = () => { plan = null; run(simState, (p) => (plan = p)); };
	/** Fills the box with a target and plans it (from a failed pull's card). */
	export function planFor(target: string) {
		text = target;
		box?.scrollIntoView({ block: 'nearest' });
		planNow();
	}
	/** Go on from where a capped plan stopped, adding its steps. */
	function more() {
		const previous = plan;
		if (!previous) return;
		run($state.snapshot(previous.end) as SimState, (p) => {
			if (p) plan = { ...p, startDps: previous.startDps, steps: [...($state.snapshot(previous.steps) as typeof p.steps), ...p.steps], gold: previous.gold + p.gold, unpriced: Math.max(previous.unpriced, p.unpriced) };
		});
	}
	function applyAll() {
		const next = structuredClone(simState);
		for (const st of plan?.steps ?? []) if (!applyUpgrade(loadout, next, base, st.upgrade)) break;
		onapply(next);
	}
	// A plan is for the state it was made from: edits (or Apply all) retire it.
	let plannedFrom = '';
	$effect(() => {
		const now = JSON.stringify(simState);
		if (plan && plannedFrom && now !== plannedFrom) plan = null;
		if (plan && !plannedFrom) plannedFrom = now;
		if (!plan) plannedFrom = '';
	});
</script>

<div class="rounded-xs border border-surface-700 bg-surface-950/50 p-3 text-xs" bind:this={box}>
	<div class="flex flex-wrap items-center gap-2">
		<span class="text-sm font-semibold text-surface-100">Target DPS</span>
		<form class="flex min-w-0 flex-1 gap-1.5" onsubmit={(e) => { e.preventDefault(); planNow(); }}>
			<input class="h-7 min-w-0 flex-1 rounded-xs border border-surface-700 bg-surface-950 px-2 text-xs text-surface-100 sm:max-w-48" placeholder="1.4b, 1400m or +5%" bind:value={text} aria-label="Target DPS" />
			<button type="submit" class="{btn} h-7 px-3" disabled={planning}>{planning ? 'Planning…' : 'Plan'}</button>
		</form>
		<Segmented label="Plan by" value={byGold ? 'gold' : 'steps'} options={[{ value: 'steps', label: 'Fewest steps', title: 'Biggest DPS gain at each step' }, { value: 'gold', label: 'Least gold', title: 'Least gold per 1% DPS at each step' }]} onselect={(v) => { byGold = v === 'gold'; plan = null; }} size="h-7 px-2 text-xs" />
	</div>
	{#if byGold && unsetPrices}<p class="mt-1.5 text-amber-300">No material prices yet: honing counts as free.</p>{/if}
	{#if error}<p class="mt-1.5 text-amber-300">{error}</p>{/if}
	{#if plan}
		{@const p = plan}
		<p class="mt-2 font-semibold {p.reached ? 'text-green-400' : 'text-amber-300'}">
			{#if !p.steps.length && p.reached}Already there: {dpsText(p.startDps)}.
			{:else}{dpsText(p.startDps)} → {dpsText(p.endDps)} · {p.steps.length} step{p.steps.length === 1 ? '' : 's'}{#if byGold} · {formatGold(p.gold)} gold{/if}{#if !p.reached} · not reached{/if}{/if}
		</p>
		<ol class="mt-1 grid gap-x-4 gap-y-1 sm:grid-cols-2">
			{#each groupSteps(p.steps) as g, i (i)}
				<li class="grid grid-cols-[1.25rem_1fr_max-content] items-center gap-1.5">
					<span class="text-surface-500 tabular-nums">{i + 1}.</span>
					{#if g.count === 1}
						<UpgradeTitle compact u={g.first.upgrade.subject ? g.first.upgrade : { ...g.first.upgrade, subject: CATEGORY_LABELS[g.first.upgrade.category] }} />
					{:else}
						<span class="min-w-0">
							<span class="block truncate text-[11px] text-surface-400">{g.first.upgrade.subject ?? CATEGORY_LABELS[g.first.upgrade.category]} · {g.count} steps</span>
							<span class="block truncate text-surface-100">{g.first.upgrade.title} … {g.last.upgrade.title}</span>
						</span>
					{/if}
					<span class="text-right tabular-nums"><span class="text-sky-300" style:color={classTextColor(loadout.classId)}>{formatPct(g.gainPct)}%</span>
						<span class="block text-[10px] text-surface-400">{dpsText(g.last.dps)}{#if g.gold !== null && byGold} · {g.gold ? formatGold(g.gold) : 'free'}{/if}</span></span>
				</li>
			{/each}
		</ol>
		<div class="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-surface-400">
			{#if p.steps.length}<button type="button" class="{btn} h-7 px-3" onclick={applyAll}>Apply all {p.steps.length}</button>{/if}
			{#if p.capped}<span>{dpsText(parseTargetDps(text, meterDps)! - p.endDps)} short after {p.steps.length} steps.</span><button type="button" class="{btn} h-7 px-2" disabled={planning} onclick={more}>{planning ? 'Planning…' : 'Keep planning'}</button>
			{:else if !p.reached}<span>No further upgrade the meter can value gets closer.</span>{/if}
			{#if p.unpriced && byGold}<span>{p.unpriced} unpriced left out.</span>{/if}
		</div>
	{/if}
</div>
