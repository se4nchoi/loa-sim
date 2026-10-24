<!--
	"Next Upgrades" sidebar card: the best one-step upgrades for the loadout. With `onapply` (the simulator passes
	it), each row gets an Apply button that makes the edit in the simulator. CP mode ranks by CP or gold per 1% CP;
	DPS mode by DPS or gold per 1% DPS, each upgrade measured on the DPS meter's picked clear (dps-selection).
		<UpgradePlanner loadout={loadout} onapply={(u) => …} />
-->
<script lang="ts">
	import { formatCp, formatPct } from './format';
	import { useDrawerDrag } from './sim/BottomDrawer.svelte';
	import GoldCost from './GoldCost.svelte';
	import MaterialPrices from './MaterialPrices.svelte';
	import { autoHoningCosts, inventoryMaterials, materialsFor } from './honing-cost';
	import { bookCost, bookPricesFor, materialPricesFor, costsForCharacter, byGold, formatGold, gold, goldPerPct, loadGold, manualGoldCost, missingPriceCount, setRankMode, supportsGoldCost } from './gold-costs.svelte';
	import Segmented from './sim/Segmented.svelte';
	import { onMount } from 'svelte';
	import { liveUpgrades } from './live-upgrades';
	import { rollsFor, setAccRolls } from './acc-rolls.svelte';
	import { arkGridOverWillpower, initSimState, type SimState } from './simulate';
	import { roleOf } from './roles';
	import type { Loadout } from './types';
	import UpgradeDialog from './UpgradeDialog.svelte';
	import UpgradeTitle from './UpgradeTitle.svelte';
	import { btn } from './sim/ui';
	import { CATEGORY_LABELS, topDistinct, type Upgrade } from './upgrades';
	import { applyUpgrade } from './apply-upgrade';
	import { dpsMeter, meterGain } from './dps-meter';
	import { dpsSelection, targetRequest } from './dps-selection.svelte';
	import { untrack } from 'svelte';
	import { configuredPlanGain } from './dps-configured';
	import { formatDamage } from './dps-comparison';
	import { groupSteps, parseTargetDps, planToTarget, type TargetPlan } from './dps-target';

	let {
		dpsMode = false,
		loadout,
		limit = 5,
		onapply,
		simState,
		simBase,
		currentCp,
		characterKey = '',
		characterName,
		class: cls = '',
		scroll = false,
		pricingRequest = null,
		onpricingclose
	}: { dpsMode?: boolean; pricingRequest?: Upgrade | null; onpricingclose?: () => void; /** Scroll the list inside the card at every width (the phone drawer); otherwise only on desktop. */ scroll?: boolean; class?: string; characterKey?: string; characterName?: string; loadout: Loadout; limit?: number; simState?: SimState; simBase?: SimState; currentCp?: number; /** Returns false when it couldn't be applied. */ onapply?: (u: Upgrade) => boolean } = $props();

	/** Brief feedback on the row just applied. */
	let flash = $state<{ key: string; ok: boolean } | null>(null);
	let flashTimer: ReturnType<typeof setTimeout>;
	function apply(u: Upgrade) {
		const ok = onapply?.(u) ?? false;
		flash = { key: u.key, ok };
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flash = null), 1200);
	}

	// The simulator supplies the same settled state used for its CP, avoiding a second debounce.
	const simNow = $derived(simState ? $state.snapshot(simState) : initSimState(loadout));
	const upgrades = $derived.by(() => {
		const list = liveUpgrades(loadout, simNow, simBase ?? initSimState(loadout), rollsFor(characterKey), dpsMode);
		// A planned accessory may already be equipped in the edited state; keep its shared price editable.
		if (pricingRequest && !list.some((u) => u.key === pricingRequest.key)) list.push({ ...pricingRequest, gainPct: 0 });
		return list;
	});
	const goldUpgrades = $derived(upgrades.filter(supportsGoldCost));
	const characterCosts = $derived(costsForCharacter(characterKey));
	const materialPrices = $derived(materialPricesFor(characterKey));
	const bookPrices = $derived(bookPricesFor(characterKey));
	/** This character's bound honing mats. */
	const bound = $derived(gold.bound[characterKey] ?? {});
	const perGold = $derived(gold.mode === 'gold');
	// Equipment honing always uses material prices, ignoring previously entered totals.
	const auto = $derived(perGold ? autoHoningCosts(upgrades.map((u) => u.key), simNow.gear, materialPrices, bound, simNow.karma) : {});
	const costs = $derived({
		...Object.fromEntries(upgrades.flatMap((u) => (u.knownCost === undefined ? [] : [[u.key, u.knownCost]]))),
		...Object.fromEntries(Object.entries(auto).map(([k, c]) => [k, c.expected])),
		...Object.fromEntries(upgrades.flatMap((u) => {
			const cost = manualGoldCost(u, characterCosts);
			return cost === undefined ? [] : [[u.key, cost]];
		})),
		// Book rows: price per book × books, over any total typed on the row before book prices existed.
		...Object.fromEntries(upgrades.flatMap((u) => (bookCost(u, bookPrices) === undefined ? [] : [[u.key, bookCost(u, bookPrices)!]])))
	});
	const materials = $derived(materialsFor(upgrades.map((u) => u.key), simNow.gear));
	/** Nothing priced yet: every material counts as 0 (bound). */
	/** No character-bound mats entered for this character: honing is priced as if every mat were bought. */
	const noBound = $derived(materials.every((id) => !bound[id]));
	const unsetPrices = $derived(materials.every((id) => materialPrices[id] === undefined && bound[id] === undefined));
	let pricesOpen = $state(false);
	const cp = $derived(currentCp ?? loadout.combatPower?.score ?? roleOf(loadout).score(loadout.battlePoint.parts));
	let dialogOpen = $state(false);
	const drawerDrag = useDrawerDrag();
	/** Upgrade to scroll to when All Upgrades opens from a row click. */
	let focusKey = $state<string | null>(null);
	$effect(() => {
		if (!pricingRequest) return;
		setRankMode('gold');
		focusKey = pricingRequest.key;
		dialogOpen = true;
	});

	onMount(loadGold);
	// DPS mode: each upgrade on the meter's picked clear (the same numbers the meter shows after Apply).
	const support = $derived(roleOf(loadout).support);
	const selection = $derived(dpsMode && !support ? dpsSelection(characterKey) : undefined);
	const dpsGains = $derived.by(() => {
		const out = new Map<string, { gainPct: number; atLeast: boolean }>();
		if (!selection) return out;
		const base = simBase ?? initSimState(loadout);
		const now = dpsMeter(loadout, selection.baseline, simNow, selection.buildRuns, selection.runs, selection.arkGrid, selection.context);
		for (const u of upgrades) {
			const next = structuredClone(simNow);
			if (!applyUpgrade(loadout, next, base, u)) continue;
			const g = !selection.runs.length && selection.context
				? {gainPct: configuredPlanGain(loadout, selection.baseline, simNow, next, selection.context), atLeast: false}
				: meterGain(loadout, selection.baseline, simNow, next, selection.buildRuns, selection.runs, selection.arkGrid, now, selection.context);
			if (g.gainPct !== null) out.set(u.key, { gainPct: g.gainPct, atLeast: g.atLeast });
		}
		return out;
	});
	const dps = $derived(new Map([...dpsGains].map(([key, g]) => [key, g.gainPct] as const)));
	/** The gain the list ranks and prices by: DPS in DPS mode (null = not estimated), CP otherwise. */
	const gainOf = (u: Upgrade) => (selection ? (dps.get(u.key) ?? null) : u.gainPct);
	// DPS mode: estimated upgrades by DPS, then the rest by CP.
	const ranked = $derived(selection ? upgrades.toSorted((a, b) => (dps.get(b.key) ?? -Infinity) - (dps.get(a.key) ?? -Infinity) || b.gainPct - a.gainPct) : upgrades);
	const pricedFor = (u: Upgrade) => supportsGoldCost(u) && costs[u.key] !== undefined && gainOf(u) !== null;
	const priced = $derived(perGold ? topDistinct(byGold(upgrades, costs, gainOf), limit) : []);
	const shown = $derived(perGold ? [...priced, ...topDistinct(ranked.filter((u) => !pricedFor(u)), limit - priced.length)] : topDistinct(ranked, limit));
	const unpriced = $derived(missingPriceCount(goldUpgrades, costs));
	const unit = $derived(selection ? 'DPS' : 'CP');

	// Target DPS: the path of upgrades to a DPS on the picked clear (dps-target.ts), by gold or by fewest steps.
	/** 1.331b: as the meter's headline. */
	const dpsText = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(3)}b` : formatDamage(n));
	const canTarget = $derived(!!selection?.runs.length && !!onapply);
	const meterDps = $derived.by(() => {
		if (!selection?.runs.length) return null;
		const m = dpsMeter(loadout, selection.baseline, simNow, selection.buildRuns, selection.runs, selection.arkGrid, selection.context);
		return m ? m.after / (m.durationMs / 1000) : null;
	});
	let targetText = $state('');
	let targetOpen = $state(false);
	let targetBox = $state<HTMLElement | null>(null);
	// A target sent from the DPS panel ("what would have killed this pull") fills the box and opens it; the copy of this
	// card on screen (there's one per layout) scrolls to it and plans right away.
	$effect(() => {
		const request = targetRequest(characterKey);
		if (!request) return;
		untrack(() => {
			targetText = request.text;
			targetOpen = true;
			targetPlan = null;
			setTimeout(() => {
				if (!targetBox?.offsetParent) return;
				// Scroll the sidebar column that holds the card (it scrolls on its own), not the page under it.
				const column = targetBox.closest('[class*="overflow-y-auto"]') as HTMLElement | null;
				if (column) column.scrollTo({ top: targetBox.getBoundingClientRect().top - column.getBoundingClientRect().top + column.scrollTop - 8 });
				// Still off screen (the column sits below the DPS panel): bring the page to it, as the player asked for this plan.
				// Planning blocks the page for a moment, so it starts once the scroll is done.
				setTimeout(() => {
					const r = targetBox?.getBoundingClientRect();
					if (r && (r.top < 0 || r.top > innerHeight - 80)) targetBox!.scrollIntoView({ block: 'center' });
					setTimeout(planTarget, 600);
				}, 350);
			}, 50);
		});
	});
	let targetPlan = $state<TargetPlan | null>(null);
	let planning = $state(false);
	let targetError = $state<string | null>(null);
	/** Gold for an upgrade made from state `s`, as the rows price it (a typed or book price, else honing from prices). */
	function goldFor(u: Upgrade, s: SimState): number | null {
		const book = bookCost(u, bookPrices);
		if (book !== undefined) return book;
		const manual = manualGoldCost(u, characterCosts);
		if (manual !== undefined) return manual;
		const honing = autoHoningCosts([u.key], s.gear, materialPrices, bound, s.karma)[u.key];
		if (honing) return honing.expected;
		return u.knownCost ?? null;
	}
	function planTarget() {
		targetError = null;
		const target = meterDps === null ? null : parseTargetDps(targetText, meterDps);
		if (!selection || target === null) { targetError = 'Enter a DPS like 1.4b or 1400m, or +5%.'; return; }
		planning = true;
		targetPlan = null;
		const sel = selection, from = simNow, byGold = perGold;
		// Let the button show "Planning…" before the work (a few hundred ms per step).
		setTimeout(() => {
			try {
			targetPlan = planToTarget({
				loadout, base: simBase ?? initSimState(loadout), start: from, selection: sel, targetDps: target, byGold,
				upgradesFor: (st) => liveUpgrades(loadout, st, simBase ?? initSimState(loadout), rollsFor(characterKey), true),
				goldFor
			});
			if (!targetPlan) targetError = 'The meter needs a picked attempt to plan from.';
			} catch { targetError = "Couldn't plan from here."; }
			finally { planning = false; }
		}, 20);
	}
	// A plan is for the state it was made from: edits (or Apply all) retire it.
	let plannedFrom = '';
	$effect(() => {
		const now = JSON.stringify(simNow);
		if (targetPlan && plannedFrom && now !== plannedFrom) targetPlan = null;
		if (targetPlan && !plannedFrom) plannedFrom = now;
		if (!targetPlan) plannedFrom = '';
	});
	/** Go on from where a capped plan stopped, adding its steps. */
	function continuePlan() {
		const previous = targetPlan;
		const target = meterDps === null ? null : parseTargetDps(targetText, meterDps);
		if (!previous || !selection || target === null) return;
		planning = true;
		const sel = selection, byGold = perGold;
		// The plan is reactive state: its end state goes in as a plain copy.
		const start = $state.snapshot(previous.end) as SimState;
		setTimeout(() => {
			try {
				const more = planToTarget({
					loadout, base: simBase ?? initSimState(loadout), start, selection: sel, targetDps: target, byGold,
					upgradesFor: (st) => liveUpgrades(loadout, st, simBase ?? initSimState(loadout), rollsFor(characterKey), true),
					goldFor
				});
				if (more) targetPlan = { ...more, startDps: previous.startDps, steps: [...$state.snapshot(previous.steps) as typeof more.steps, ...more.steps], gold: previous.gold + more.gold, unpriced: Math.max(previous.unpriced, more.unpriced) };
			} catch { targetError = "Couldn't plan further from here."; }
			finally { planning = false; }
		}, 20);
	}
	function applyPlan() {
		const steps = targetPlan?.steps ?? [];
		for (const st of steps) if (!(onapply?.(st.upgrade) ?? false)) break;
	}
</script>

<div class="flex min-h-0 flex-col rounded-xs bg-surface-900 shadow-sm shadow-neutral-800 {cls}">
	<!-- In the phone drawer this row is also a drag-to-close zone (its toggle buttons still tap). -->
	<div class="sim-modal-header flex shrink-0 flex-col gap-1.5 bg-surface-900 px-3 py-2 font-semibold" use:drawerDrag>
		<div>Next Upgrades</div>
		<div>
			<Segmented
				value={gold.mode}
				options={dpsMode
					? [
						{ value: 'cp', label: 'Most DPS', title: 'Biggest estimated damage gain first; upgrades without an estimate follow, by CP' },
						{ value: 'gold', label: 'Per gold', title: 'Least gold per 1% DPS first (enter gold costs on the rows)' }
					]
					: [
						{ value: 'cp', label: 'Most CP', title: 'Biggest Combat Power gain first' },
						{ value: 'gold', label: 'Per gold', title: 'Least gold per 1% Combat Power first (enter gold costs on the rows)' }
					]}
				onselect={(mode) => setRankMode(mode as 'cp' | 'gold')}
				label="Rank upgrades by"
				full
				size="h-7 px-2 text-xs"
			/>
		</div>
	</div>
	{#if dpsMode && support}
		<p class="shrink-0 border-b border-neutral-950 px-2.5 py-1.5 text-xs text-surface-400">DPS mode is for damage dealers; supports are ranked by CP.</p>
	{:else if dpsMode && !selection}
		<p class="shrink-0 border-b border-neutral-950 px-2.5 py-1.5 text-xs text-surface-400">Configure combat totals or confirm an attempt's equipment to rank by damage gain. Ranked by CP until then.</p>
	{/if}
	{#if arkGridOverWillpower(simNow.arkGrid)}
		<p class="shrink-0 border-b border-neutral-950 px-2.5 py-1.5 text-xs text-amber-300" title="An astrogem doesn't fit its core's Willpower, so Ark Grid steps can't be worked out from here">
			Ark Grid upgrades are left out: a core needs more Willpower than it has.
		</p>
	{/if}
	{#if canTarget}
		<details class="shrink-0 border-b border-neutral-950 px-2.5 py-1.5 text-xs" bind:open={targetOpen} bind:this={targetBox}>
			<summary class="cursor-pointer font-semibold text-surface-200">Target DPS{#if meterDps}<span class="font-normal text-surface-400"> · now {dpsText(meterDps)}</span>{/if}</summary>
			<form class="mt-1.5 flex gap-1.5" onsubmit={(e) => { e.preventDefault(); planTarget(); }}>
				<input class="h-7 min-w-0 flex-1 rounded-xs border border-surface-700 bg-surface-950 px-2 text-xs text-surface-100" placeholder="1.4b, 1400m or +5%" bind:value={targetText} aria-label="Target DPS" />
				<button type="submit" class="{btn} h-7 px-2.5" disabled={planning}>{planning ? 'Planning…' : 'Plan'}</button>
			</form>
			<p class="mt-1 text-[11px] text-surface-500">{perGold ? 'Least gold per 1% DPS at each step' : 'Biggest DPS gain at each step'}, measured on the picked attempt. Switch above to plan {perGold ? 'by gain' : 'by gold'}.</p>
			{#if perGold && unsetPrices}<p class="mt-1 text-[11px] text-amber-300">No material prices yet: honing counts as free. Load market prices first.</p>{/if}
			{#if targetError}<p class="mt-1 text-amber-300">{targetError}</p>{/if}
			{#if targetPlan}
				{@const p = targetPlan}
				<p class="mt-2 font-semibold {p.reached ? 'text-green-400' : 'text-amber-300'}">
					{#if !p.steps.length && p.reached}Already there: {dpsText(p.startDps)}.
					{:else}{dpsText(p.startDps)} → {dpsText(p.endDps)} in {p.steps.length} step{p.steps.length === 1 ? '' : 's'}{#if perGold} · {formatGold(p.gold)} gold{/if}{#if !p.reached} · target not reached{/if}{/if}
				</p>
				<ol class="mt-1 space-y-1">
					{#each groupSteps(p.steps) as g, i (i)}
						<li class="grid grid-cols-[1.25rem_1fr_max-content] items-center gap-1.5">
							<span class="text-surface-500 tabular-nums">{i + 1}.</span>
							{#if g.count === 1}
								<UpgradeTitle compact u={g.first.upgrade.subject ? g.first.upgrade : { ...g.first.upgrade, subject: CATEGORY_LABELS[g.first.upgrade.category] }} />
							{:else}
								<!-- A run of steps on one item: its name, how many, from the first to the last. -->
								<span class="min-w-0">
									<span class="block truncate text-[11px] text-surface-400">{g.first.upgrade.subject ?? CATEGORY_LABELS[g.first.upgrade.category]} · {g.count} steps</span>
									<span class="block truncate text-surface-100">{g.first.upgrade.title} … {g.last.upgrade.title}</span>
								</span>
							{/if}
							<span class="text-right tabular-nums"><span class="text-sky-300">{formatPct(g.gainPct)}%</span>
								<span class="block text-[10px] text-surface-400">{dpsText(g.last.dps)}{#if g.gold !== null && perGold} · {g.gold ? formatGold(g.gold) : 'free'}{/if}</span></span>
						</li>
					{/each}
				</ol>
				{#if p.capped}<p class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-surface-400"><span>Stopped after {p.steps.length} steps, {dpsText(parseTargetDps(targetText, meterDps ?? 0)! - p.endDps)} short.</span><button type="button" class="{btn} h-6 px-2" disabled={planning} onclick={continuePlan}>{planning ? 'Planning…' : 'Keep planning'}</button></p>{:else if !p.reached}<p class="mt-1 text-[11px] text-surface-400">{p.steps.length ? 'No further one-step upgrade the meter can value gets closer.' : 'No upgrade the meter can value raises DPS from here.'}{#if p.unpriced} {p.unpriced} unpriced upgrade{p.unpriced === 1 ? ' was' : 's were'} left out.{/if}</p>{:else if p.unpriced}<p class="mt-1 text-[11px] text-surface-400">{p.unpriced} upgrade{p.unpriced === 1 ? '' : 's'} without a gold cost {p.unpriced === 1 ? 'was' : 'were'} left out.</p>{/if}
				{#if p.steps.length}<button type="button" class="{btn} mt-1.5 h-7 w-full" onclick={applyPlan}>Apply all {p.steps.length}</button>{/if}
			{/if}
		</details>
	{/if}
	{#if upgrades.length === 0}
		<p class="p-2 text-sm text-surface-300">No one-step upgrades found for this loadout.</p>
	{:else}
		<!-- Kept above the list so they stay in reach when the list scrolls; they split the card's width. -->
		<div class="grid shrink-0 gap-1.5 px-2 py-1.5 {perGold && materials.length ? 'grid-cols-2' : 'grid-cols-1'}">
			{#if perGold && materials.length}
				<button
					type="button"
					class="flex h-7 min-w-0 items-center justify-center gap-1 truncate rounded-xs border px-2 text-xs font-semibold transition {unsetPrices
						? 'border-dashed border-amber-400/60 text-amber-300 hover:bg-amber-500/10'
						: 'border-surface-700 bg-surface-800 text-surface-100 hover:border-surface-500 hover:bg-surface-700'}"
					aria-haspopup="dialog"
					onclick={() => (pricesOpen = true)}
					title={noBound
						? `No character-bound mats set for ${characterName ?? 'this character'}: honing costs assume every mat is bought`
						: 'Honing material prices (character-bound and market)'}
				>
					{#if noBound}
						<!-- Red badge: honing costs are inflated until this character's bound mats are entered. -->
						<span class="flex size-4 shrink-0 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white" aria-hidden="true">!</span>
					{/if}
					Material prices<span class="font-normal opacity-70">{unsetPrices ? '· all 0' : ''}</span>
				</button>
			{/if}
			<button
				type="button"
				class="flex h-7 min-w-0 items-center justify-center gap-1 truncate rounded-xs border border-surface-700 bg-surface-800 px-2 text-xs font-semibold text-surface-100 transition hover:border-surface-500 hover:bg-surface-700"
				aria-haspopup="dialog"
				onclick={() => (dialogOpen = true)}
				title={perGold && unpriced ? `All Upgrades (${upgrades.length}): ${unpriced} have no gold cost yet` : undefined}
			>
				{#if perGold && unpriced}<span class="text-amber-300">{unpriced} missing price{unpriced > 1 ? 's' : ''}</span>{:else}All Upgrades ({upgrades.length}){/if}
			</button>
		</div>
		<div class="grid gap-x-2 p-1 {scroll ? 'min-h-0 overflow-y-auto overscroll-contain' : 'lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain'} {onapply ? 'grid-cols-[1fr_max-content_max-content]' : 'grid-cols-[1fr_max-content]'}">
			{#each shown as u, i (u.key)}
				{@const honing = perGold && auto[u.key] && manualGoldCost(u, characterCosts) === undefined ? auto[u.key] : null}
				{@const g = dpsGains.get(u.key)}
				{@const per = gainOf(u)}
				{#if perGold && i === priced.length}
					{#if priced.length}
						<p class="col-span-full mt-1 border-t border-neutral-950 px-1.5 pt-2 pb-0.5 text-[11px] font-semibold tracking-wide text-surface-500 uppercase">Other {unit} upgrades</p>
					{:else}
						<p class="col-span-full px-1.5 py-1.5 text-xs text-surface-400">
							Enter upgrade costs to rank by gold per 1% {unit}. Ark Grid suggestions are ranked by {unit} only.
						</p>
					{/if}
				{/if}
				<!-- A click on the row (not its Apply / gold controls) opens All Upgrades at this upgrade; keyboard users have the
				     All Upgrades button above. -->
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
				<div
					class="col-span-full grid cursor-pointer grid-cols-subgrid items-center rounded-xs px-1.5 transition duration-75 hover:bg-black/20 {perGold ? 'py-1.5' : 'py-1'}"
					title={u.detail}
					onclick={(e) => {
						if ((e.target as HTMLElement).closest('button, input, a')) return;
						focusKey = u.key;
						dialogOpen = true;
					}}
				>
					<div class="flex min-w-0 flex-col">
						<!-- Rows without a subject (karma, gems, engravings) show their category in the same spot, above the title. -->
						<UpgradeTitle compact u={u.subject ? u : { ...u, subject: CATEGORY_LABELS[u.category] }} />
						{#if perGold && supportsGoldCost(u)}<GoldCost {characterKey} {u} auto={auto[u.key]} showPer={false} />{/if}
					</div>
					<!-- On calculated honing rows the gold per 1% lines sit level with the avg / pity boxes. -->
					<span class="text-right whitespace-nowrap tabular-nums {honing ? 'self-end' : ''}">
						{#if selection}
							{#if g}
								<span class="text-sky-300" title={g.atLeast ? 'Estimated damage gain. Part of this upgrade is not valued yet.' : selection.runs.length ? 'Estimated damage gain on the selected attempt' : 'Estimated damage gain from configured combat totals'}>{g.atLeast ? '≥' : '≈'}{formatPct(g.gainPct)}<span class="text-xs">% DPS</span></span>
							{:else}
								<span class="block text-[11px] font-normal text-surface-400" title="This upgrade changes something the DPS meter doesn’t value yet">DPS not estimated</span>
							{/if}
							{#if u.count > 1}<span class="block text-[11px] text-surface-400">each</span>{/if}
							<span class="block text-[10px] text-green-400">{u.approximate ? '≈' : ''}{formatPct(u.gainPct)}% CP</span>
						{:else}
							<span class="text-green-400">{u.approximate ? '≈' : ''}{formatPct(u.gainPct)}<span class="text-xs">%</span></span>
							{#if u.count > 1}<span class="block text-[11px] text-surface-400">each</span>{/if}
							<span class="block text-[10px] text-surface-100">{formatCp(cp * (1 + u.gainPct / 100))} <span class={u.gainPct < 0 ? 'text-red-400' : 'text-green-400'}>({formatPct(cp * u.gainPct / 100)})</span></span>
						{/if}
						{#if honing && per !== null && per > 0}
							<span class="mt-0.5 flex h-6 items-center justify-end text-[11px] text-amber-300/90" title="Gold per 1% {unit}, from the average honing cost"
								>{formatGold(honing.expected / per)} / 1% {unit}</span
							>
							<span class="mt-0.5 flex h-6 items-center justify-end text-[11px] text-orange-300" title="Gold per 1% {unit} at pity"
								>{formatGold(honing.worst / per)} / 1% {unit}</span
							>
						{:else if perGold && goldPerPct(u, costs, gainOf)}
							<span class="block text-[11px] text-amber-300/90" title="Gold per 1% {unit}">{formatGold(goldPerPct(u, costs, gainOf)!)} / 1% {unit}</span>
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
	<MaterialPrices ids={inventoryMaterials(simNow.gear, !!simNow.bracer)} {characterKey} {characterName} onclose={() => (pricesOpen = false)} />
{/if}

{#if dialogOpen}
	<UpgradeDialog {characterKey} upgrades={ranked} {cp} isSupport={roleOf(loadout).support} skins={simNow.skins} accRolls={rollsFor(characterKey)} onaccrolls={(r) => setAccRolls(characterKey, r)} {auto} {costs} mode={gold.mode} {dpsMode} {dps} dpsRank={!!selection} onapply={onapply ? apply : undefined} {flash} {focusKey} onclose={() => { dialogOpen = false; focusKey = null; if (pricingRequest) onpricingclose?.(); }} />
{/if}
