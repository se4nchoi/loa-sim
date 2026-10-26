<!--
	DPS mode's Target DPS: the cheapest path of upgrades from the Simulator's state to a DPS on the picked attempt
	(dps-target.ts), by fewest steps or by least gold. A failed pull's "Plan for X DPS" calls planFor.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { autoHoningCosts, inventoryMaterials } from './honing-cost';
	import MaterialPrices from './MaterialPrices.svelte';
	import { bookCost, bookPricesFor, costsForCharacter, formatGold, gold, loadGold, manualGoldCost, materialPricesFor } from './gold-costs.svelte';
	import { liveUpgrades } from './live-upgrades';
	import { rollsFor } from './acc-rolls.svelte';
	import { applyUpgrade } from './apply-upgrade';
	import { gearCeiling, groupSteps, parseTargetDps, planToTarget, type TargetPlan } from './dps-target';
	import type { DpsSelection } from './dps-selection.svelte';
	import { formatDamage } from './dps-comparison';
	import { formatPct } from './format';
	import { classTextColor } from './class-colors';
	import { CATEGORY_LABELS, type Upgrade } from './upgrades';
	import UpgradeTitle from './UpgradeTitle.svelte';
	import Spinner from './sim/Spinner.svelte';
	import Segmented from './sim/Segmented.svelte';
	import { btn } from './sim/ui';
	import type { SimState } from './simulate';
	import type { Loadout } from './types';

	let { loadout, simState, base, characterKey, characterName, selection, meterDps, onapply }: {
		loadout: Loadout;
		/** The Simulator's state (a plain copy): plans start from it. */
		simState: SimState;
		base: SimState;
		characterKey: string;
		characterName?: string;
		/** null until the run's gear is confirmed: the card keeps its place, disabled. */
		selection: DpsSelection | null;
		/** The meter's simulated DPS now. */
		meterDps: number;
		/** Puts the plan's end state into the Simulator. */
		onapply: (state: SimState) => void;
	} = $props();

	onMount(loadGold);
	let text = $state('');
	let byGold = $state(false);
	let plan = $state<TargetPlan | null>(null);
	// What the plan aims at. target null: none typed, so the best upgrades. ceiling: the target is out of reach with gear,
	// which tops out around this DPS on the run; the plan then lists the best upgrades instead of chasing it.
	let goal = $state<{ target: number | null; ceiling: number | null } | null>(null);
	const listing = $derived(!goal || goal.target === null || goal.ceiling !== null);
	let planning = $state(false);
	// Planning holds the page for a moment; clicks made meanwhile arrive after it. Those (made before it ended) are dropped.
	let plannedAt = 0;
	const stale = (e: Event) => planning || e.timeStamp <= plannedAt;
	let error = $state<string | null>(null);
	let box = $state<HTMLElement | null>(null);

	const materialPrices = $derived(materialPricesFor(characterKey));
	const unsetPrices = $derived(Object.keys(materialPrices).length === 0);
	let pricesOpen = $state(false);
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

	function run(start: SimState, target: number, done: (p: TargetPlan | null) => void) {
		if (planning || !selection) return;
		error = null;
		planning = true;
		const sel = selection, gold = byGold;
		// Let the button show "Planning…" before the work (a few hundred ms per step).
		setTimeout(() => {
			try {
				done(planToTarget({ loadout, base, start, selection: sel, targetDps: target, byGold: gold, goldFor,
					upgradesFor: (st) => liveUpgrades(loadout, st, base, rollsFor(characterKey), true) }));
			} catch { error = "Couldn't plan from here."; }
			finally { planning = false; plannedAt = performance.now(); }
		}, 20);
	}
	function planNow() {
		const typed = text.trim();
		const target = typed ? parseTargetDps(typed, meterDps) : null;
		if (typed && target === null) { error = 'Enter a DPS like 1.4b or 1400m, or +5%, or leave it empty.'; return; }
		if (!selection) return;
		const ceiling = target !== null && target > meterDps ? gearCeiling(loadout, simState, selection) : null;
		// A little room over the measured ceiling: accessories, the bracelet and Ark Grid can add some.
		const out = target !== null && ceiling !== null && target > ceiling * 1.05;
		goal = { target, ceiling: out ? ceiling : null };
		plan = null;
		run(simState, target !== null && !out ? target : Infinity, (p) => (plan = p));
	}
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
		const aim = goal && goal.target !== null && goal.ceiling === null ? goal.target : Infinity;
		run($state.snapshot(previous.end) as SimState, aim, (p) => {
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


<div class="rounded-xs border border-surface-700 bg-surface-950/50 p-3 text-sm" bind:this={box}>
	<p class="text-sm font-semibold text-surface-100">Target DPS</p>
	<!-- One control: how to plan, then what to plan for. Switching the method re-plans a plan already shown. -->
	<form class="mt-1.5 flex w-full max-w-sm flex-col gap-1.5" onsubmit={(e) => { e.preventDefault(); planNow(); }}>
		<div class="relative" onclickcapture={(e) => { if (stale(e)) { e.stopPropagation(); e.preventDefault(); } }}>
		<Segmented label="Plan by" full disabled={planning || !selection} value={byGold ? 'gold' : 'steps'} options={[{ value: 'steps', label: 'Fewest steps', title: 'Biggest DPS gain at each step' }, { value: 'gold', label: 'Least gold', title: 'Least gold per 1% DPS at each step' }]} onselect={(v) => { byGold = v === 'gold'; if (plan) planNow(); }} size="h-7 px-2 text-xs" />
		{#if planning}<span class="absolute inset-0 flex items-center justify-center" role="status" aria-label="Planning"><Spinner class="size-4 text-accent-300" /></span>{/if}
		</div>
		<div class="flex gap-1.5">
			<input disabled={planning || !selection} class="h-8 min-w-0 flex-1 disabled:opacity-60 rounded-xs border border-surface-700 bg-surface-950 px-2 text-sm text-surface-100 tabular-nums" placeholder="1.4b, +5%, or empty: best upgrades" bind:value={text} aria-label="Target DPS" />
			<button type="submit" class="{btn} h-8 gap-1.5 px-4" disabled={planning || !selection}>{#if planning}<Spinner class="size-3.5" />Planning…{:else}Plan{/if}</button>
		</div>
	</form>
	{#if plan && goal?.ceiling}
		<!-- Out of reach with gear: said once, plainly, with what gear can do. -->
		<p class="mt-2.5 rounded-xs border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-xs text-amber-100">
			{dpsText(goal.target!)} is out of reach with gear: about <span class="font-semibold tabular-nums">{dpsText(goal.ceiling)}</span> <span class="tabular-nums">({formatPct((goal.ceiling / plan.startDps - 1) * 100)}%)</span> at most.
		</p>
	{/if}
	{#if byGold && unsetPrices}
		<!-- The same price editor as Next Upgrades' Per gold. -->
		<p class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-amber-300">
			No material prices: honing counted as free.
			<button type="button" class="flex h-7 items-center rounded-xs border border-dashed border-amber-400/60 px-2 text-xs font-semibold text-amber-300 transition hover:bg-amber-500/10" aria-haspopup="dialog" onclick={() => (pricesOpen = true)}>Material prices</button>
		</p>
	{/if}
	{#if error}<p class="mt-1.5 text-amber-300">{error}</p>{/if}
	{#if plan}
		{@const p = plan}
		<!-- Each figure its own colour: DPS before and after, steps, gold. -->
		<p class="mt-2.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm">
			{#if listing}<span class="font-semibold text-surface-100">Best {p.steps.length} upgrades</span><span class="text-surface-600" aria-hidden="true">·</span>{/if}
			{#if !p.steps.length && p.reached}<span class="font-semibold text-green-400">Already there: {dpsText(p.startDps)}</span>
			{:else}
				<span class="text-surface-400 tabular-nums">{dpsText(p.startDps)}</span>
				<span class="text-surface-500" aria-hidden="true">→</span>
				<span class="font-bold tabular-nums {listing ? 'text-surface-50' : p.reached ? 'text-green-400' : 'text-amber-300'}">{dpsText(p.endDps)}</span>
				<span class="text-xs text-surface-400 tabular-nums">({formatPct((p.endDps / p.startDps - 1) * 100)}%)</span>
				{#if !listing && !p.reached}<span class="text-xs text-amber-300">not reached</span>{/if}
				{#if !listing}<span class="text-surface-600" aria-hidden="true">·</span>
				<span class="text-surface-100">{p.steps.length} step{p.steps.length === 1 ? '' : 's'}</span>{/if}
				{#if byGold}<span class="text-surface-600" aria-hidden="true">·</span><span class="font-semibold text-yellow-300 tabular-nums">{formatGold(p.gold)} gold</span>{/if}
			{/if}
		</p>
		<!-- Each step on its own light card, so the steps read apart. -->
		<ol class="mt-1.5 grid gap-1.5 sm:grid-cols-2">
			{#each groupSteps(p.steps) as g, i (i)}
				<li class="grid grid-cols-[1.5rem_1fr_max-content] items-center gap-2 rounded-md border border-surface-700/60 bg-surface-800/60 px-2.5 py-1.5">
					<span class="flex size-6 items-center justify-center rounded-full bg-accent-700/70 text-xs font-bold text-white tabular-nums">{i + 1}</span>
					{#if g.count === 1}
						<UpgradeTitle compact u={g.first.upgrade.subject ? g.first.upgrade : { ...g.first.upgrade, subject: CATEGORY_LABELS[g.first.upgrade.category] }} />
					{:else}
						<span class="min-w-0">
							<span class="block truncate text-xs text-surface-400">{g.first.upgrade.subject ?? CATEGORY_LABELS[g.first.upgrade.category]} · {g.count} steps</span>
							<span class="block truncate text-surface-100">{g.first.upgrade.title} … {g.last.upgrade.title}</span>
						</span>
					{/if}
					<span class="text-right tabular-nums"><span class="font-semibold" style:color={classTextColor(loadout.classId)}>{formatPct(g.gainPct)}%</span>
						<span class="block text-sm font-semibold text-surface-50">{dpsText(g.last.dps)}</span>
						{#if g.gold !== null && byGold}<span class="block text-xs text-yellow-300/90">{g.gold ? `${formatGold(g.gold)} gold` : 'free'}</span>{/if}</span>
				</li>
			{/each}
		</ol>
		<div class="mt-2 flex flex-wrap items-center gap-2 text-xs text-surface-400">
			{#if p.steps.length}<button type="button" class="{btn} h-7 px-3" onclick={applyAll}>Apply all {p.steps.length}</button>{/if}
			{#if p.capped && listing}<button type="button" class="{btn} h-7 px-2" disabled={planning} onclick={more}>{planning ? 'Planning…' : 'More upgrades'}</button>
			{:else if p.capped}<span>{dpsText(goal!.target! - p.endDps)} short after {p.steps.length} steps.</span><button type="button" class="{btn} h-7 px-2" disabled={planning} onclick={more}>{planning ? 'Planning…' : 'Keep planning'}</button>
			{:else if !p.reached && !listing}<span>Nothing gets closer.</span>{/if}
			{#if p.unpriced && byGold}<span>{p.unpriced} unpriced left out.</span>{/if}
		</div>
	{/if}
</div>

{#if pricesOpen}
	<MaterialPrices ids={inventoryMaterials(simState.gear, !!simState.bracer)} {characterKey} {characterName} onclose={() => (pricesOpen = false)} />
{/if}
