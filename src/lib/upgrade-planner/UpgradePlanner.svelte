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
	import { dpsSelection } from './dps-selection.svelte';
	import { configuredPlanGain } from './dps-configured';
	import { classTextColor } from './class-colors';

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
	/** DPS gains in the class's meter colour, as on the DPS sim's bars. */
	const meterColor = $derived(classTextColor(loadout.classId));

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
		<p class="shrink-0 border-b border-neutral-950 px-2.5 py-1.5 text-xs text-surface-400">Pick a run in the DPS meter to rank by DPS. Ranked by CP until then.</p>
	{/if}
	{#if arkGridOverWillpower(simNow.arkGrid)}
		<p class="shrink-0 border-b border-neutral-950 px-2.5 py-1.5 text-xs text-amber-300" title="An astrogem doesn't fit its core's Willpower, so Ark Grid steps can't be worked out from here">
			Ark Grid upgrades are left out: a core needs more Willpower than it has.
		</p>
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
								<span class="text-sky-300" style:color={meterColor} title={g.atLeast ? 'Estimated damage gain. Part of this upgrade is not valued yet.' : selection.runs.length ? 'Estimated damage gain on the selected attempt' : 'Estimated damage gain from configured combat totals'}>{g.atLeast ? '≥' : '≈'}{formatPct(g.gainPct)}<span class="text-xs">% DPS</span></span>
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
