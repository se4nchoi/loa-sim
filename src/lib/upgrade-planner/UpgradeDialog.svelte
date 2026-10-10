<script lang="ts">
	import { sheetDrag } from './sim/sheet-drag';
	import { onMount, untrack } from 'svelte';
	import { formatCp, formatPct } from './format';
	import { btn, btnAccent, ROLL_COLORS } from './sim/ui';
	import UpgradeTitle from './UpgradeTitle.svelte';
	import MenuPicker from './sim/MenuPicker.svelte';
	import GoldCost from './GoldCost.svelte';
	import { PHEON_ICON } from './icons';
	import { byGold, clearUpgradePrices, restoreUpgradePrices, formatGold, goldPerPct, missingPriceCount, supportsGoldCost, type ClearedPrices, type RankMode } from './gold-costs.svelte';
	import type { HoningCost } from './honing-cost';
	import { ACC_ROLLS, groupAccessoryUpgrades, type AccRoll } from './accessory-sets';
	import { CATEGORY_LABELS, type Upgrade, type UpgradeCategory } from './upgrades';
	import { adjustSkinSetup, skinGrade, skinParts, type SimSkins } from './skins';

	let {
		upgrades,
		characterKey = '',
		cp,
		onclose,
		onapply,
		flash = null,
		mode = 'cp',
		focusKey = null,
		auto = {},
		costs = {},
		accRolls,
		onaccrolls,
		skins,
		isSupport = false
	}: {
		upgrades: Upgrade[];
		characterKey?: string;
		cp: number;
		onclose: () => void;
		onapply?: (u: Upgrade) => void;
		/** The row just applied, for feedback. */
		flash?: { key: string; ok: boolean } | null;
		/** Which upgrades the top three cards show: biggest gain, or least gold per 1% CP. */
		mode?: RankMode;
		/** Scroll to and highlight this upgrade on open. */
		focusKey?: string | null;
		/** Honing rows priced from material prices. */
		auto?: Record<string, HoningCost>;
		/** Gold cost per row: typed, else calculated. */
		costs?: Record<string, number>;
		/** Main-line rolls the accessory ladder offers; the picker changes them on Apply. */
		accRolls?: AccRoll[];
		onaccrolls?: (rolls: AccRoll[]) => void;
		skins?: SimSkins;
		isSupport?: boolean;
	} = $props();

	let dialog: HTMLDialogElement;
	let card = $state<HTMLDivElement>();
	onMount(() => {
		dialog.showModal();
		dialog.focus(); // the dialog itself, not a control: no keyboard popping up, no focus ring on Close
		if (focusKey) dialog.querySelector(`[data-key="${CSS.escape(focusKey)}"]`)?.scrollIntoView({ block: 'center' });
		track();
	});

	// Groups in order of their best upgrade, each sorted by CP gain.
	const sorted = (list: Upgrade[]) => {
		const by = new Map<UpgradeCategory, Upgrade[]>();
		for (const u of list) by.set(u.category, [...(by.get(u.category) ?? []), u]);
		// Keep the picker and quick navigation in place even when no accessory rolls are offered.
		if (accRolls && !by.has('accessory')) by.set('accessory', []);
		if (skins?.bonus !== 8 && !by.has('skin')) by.set('skin', []);
		return [...by.entries()]
			.map(([category, items]) => ({ category, list: items.toSorted((a, b) => b.gainPct - a.gainPct) }))
			.sort((a, b) => (b.list[0]?.gainPct ?? 0) - (a.list[0]?.gainPct ?? 0));
	};
	// While open, the order stays as it was when the dialog opened (an Apply or a filter would otherwise reshuffle
	// rows under the cursor); values still update, gone rows drop out, new ones join the end. Reopening re-sorts.
	const opened = untrack(() => sorted(upgrades));
	const categoryAt = new Map(opened.map((g, i) => [g.category, i]));
	const rowAt = new Map(opened.flatMap((g) => g.list).map((u, i) => [u.key, i]));
	/** Order by where it was at opening; newcomers (unknown) after, by gain. */
	const byOpened = <T,>(at: Map<T, number>, x: T, y: T, tie = 0) => {
		const a = at.get(x), b = at.get(y);
		return a !== undefined && b !== undefined ? a - b : a !== undefined ? -1 : b !== undefined ? 1 : tie;
	};
	const groups = $derived(
		sorted(upgrades)
			.map((g) => ({ ...g, list: g.list.toSorted((a, b) => byOpened(rowAt, a.key, b.key, b.gainPct - a.gainPct)) }))
			.sort((a, b) => byOpened(categoryAt, a.category, b.category, (b.list[0]?.gainPct ?? 0) - (a.list[0]?.gainPct ?? 0)))
	);
	// Sticky category bar: jump to a section; the one scrolled to is highlighted.
	let scroller = $state<HTMLDivElement>();
	let bar = $state<HTMLDivElement>();
	let active = $state<UpgradeCategory | null>(null);
	const sectionId = (c: UpgradeCategory) => `upgrades-${c}`;
	/** Shorter names so the bar fits on one line. */
	const SHORT: Partial<Record<UpgradeCategory, string>> = { core: 'Cores', quality: 'Quality' };
	function jump(c: UpgradeCategory) {
		const el = scroller?.querySelector<HTMLElement>(`#${sectionId(c)}`);
		if (!el || !scroller) return;
		scroller.scrollTo({ top: el.offsetTop - (bar?.offsetHeight ?? 0) - 8 });
		active = c;
	}
	function track() {
		if (!scroller) return;
		const line = scroller.getBoundingClientRect().top + (bar?.offsetHeight ?? 0) + 12;
		let current: UpgradeCategory | null = null;
		for (const g of groups) {
			const el = scroller.querySelector<HTMLElement>(`#${sectionId(g.category)}`);
			if (el && el.getBoundingClientRect().top <= line) current = g.category;
		}
		active = current ?? groups[0]?.category ?? null;
	}
	// Accessory roll picker: toggles stay a draft until Apply rebuilds the ladder.
	let draft = $state<AccRoll[]>(untrack(() => [...(accRolls ?? [])]));
	let missingOnly = $state<Record<string, boolean>>({});
	let lastClear = $state<{ scope: string; prices: ClearedPrices } | null>(null);
	const priceScope = (category: UpgradeCategory, family?: 'neck' | 'ear' | 'finger') => `${characterKey}:${category}:${family ?? ''}`;
	function clearPrices(category: UpgradeCategory, family?: 'neck' | 'ear' | 'finger') {
		const prices = clearUpgradePrices(category, family, characterKey);
		if (Object.keys(prices.costs).length || Object.keys(prices.bookPrices).length) lastClear = { scope: priceScope(category, family), prices };
	}
	function undoClear() {
		if (!lastClear) return;
		restoreUpgradePrices(lastClear.prices);
		lastClear = null;
	}
	const same = (a: AccRoll[], b: AccRoll[]) => a.length === b.length && a.every((r) => b.includes(r));
	const pending = $derived(!!accRolls && !same(draft, accRolls));
	function applyRolls() {
		// The rebuilt ladder sorts by gain (its rows are new to the frozen order).
		for (const key of [...rowAt.keys()]) if (key.startsWith('accset:')) rowAt.delete(key);
		onaccrolls?.([...draft]);
	}
	const best = $derived(mode === 'gold' ? byGold(upgrades, costs).slice(0, 3) : upgrades.slice(0, 3));
	const missingTotal = $derived(missingPriceCount(upgrades, costs));
	function adjustSkin(index: number, bonus: number) {
		if (!skins) return;
		const parts = adjustSkinSetup(skins, index, bonus);
		if (parts) onapply?.({ key: `skin-config:${parts.join(',')}`, category: 'skin', title: 'Skin setup', detail: '', count: 1, approximate: false, gainPct: 0 });
	}
	const skinColor = (bonus: number | null) => bonus === 2 ? '#ff8a2a' : bonus === 1 ? '#b780ff' : bonus === 0.5 ? '#65a5ff' : undefined;
</script>

{#snippet priceActions(category: UpgradeCategory, family?: 'neck' | 'ear' | 'finger')}
	<div class="flex shrink-0 items-center gap-1">
		<button type="button" class={btn} title={`Clear saved ${family ?? CATEGORY_LABELS[category].toLowerCase()} prices in this browser`} onclick={() => clearPrices(category, family)}>Clear prices</button>
		<button type="button" class={`${btn} disabled:cursor-default disabled:opacity-30`} style:padding="0 6px" disabled={lastClear?.scope !== priceScope(category, family)} aria-label="Undo clearing prices" title="Undo clearing prices" onclick={undoClear}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h11a6 6 0 0 1 0 12" /><path d="m7 3-4 4 4 4" /></svg>
		</button>
	</div>
{/snippet}

{#snippet cpAfter(u: Upgrade)}
	<span class="block text-xs text-surface-100 tabular-nums">{formatCp(cp * (1 + u.gainPct / 100))} <span class={isSupport ? 'text-green-400' : 'text-red-400'}>({formatPct(cp * u.gainPct / 100)})</span></span>
{/snippet}

{#snippet rollPicker()}
	<p class="mb-1 text-xs text-amber-300/90">※ Only options that beat the current snapshot are considered.</p>
	{#if mode === 'gold'}<p class="mb-2 flex items-center gap-1.5 text-xs text-amber-300/90"><img src={PHEON_ICON} alt="" class="size-4 shrink-0" />Accessory prices exclude Pheon costs.</p>{/if}
	<hr class="mb-2 border-surface-700" />
	<div class="mb-1.5 flex flex-row flex-wrap items-center gap-1.5" role="group" aria-label="Accessory rolls to offer">
		{#each ACC_ROLLS as r (r)}
			{@const on = draft.includes(r)}
			{@const tiers = [...r].map((c) => ({ h: 'high', m: 'mid', l: 'low' })[c] as keyof typeof ROLL_COLORS)}
			<button
				type="button"
				aria-pressed={on}
				title={tiers.map((t) => t[0].toUpperCase() + t.slice(1)).join('-')}
				class="flex h-12 w-14 flex-row items-center justify-center rounded-xs text-sm font-bold hover:bg-surface-800 {on
					? 'bg-accent-500/20 ring-1 ring-accent-500'
					: 'bg-surface-950 opacity-45'}"
				onclick={() => (draft = on ? draft.filter((x) => x !== r) : [...draft, r])}
			>
				{#each tiers as t, i (i)}{#if i}<span class="text-surface-500">-</span>{/if}<span style:color={ROLL_COLORS[t]}>{t[0].toUpperCase()}</span>{/each}
			</button>
		{/each}
		<button type="button" class="{btnAccent} ml-1 px-3 disabled:cursor-not-allowed disabled:opacity-40" disabled={!pending} onclick={applyRolls}>Apply</button>
	</div>
{/snippet}

{#snippet row(u: Upgrade)}
	<div
		data-key={u.key}
		class="flex flex-row items-center gap-3 border-t border-neutral-950 py-2 {u.key === focusKey ? 'animate-[upgrade-focus_1.6s_ease-out] rounded-xs' : ''}"
	>
		<div class="flex min-w-0 flex-1 flex-col">
				<UpgradeTitle {u} />
			{#if u.detail}<span class="text-xs text-surface-400">{u.detail}</span>{/if}
			{#if (mode === 'gold' || u.category === 'skin') && supportsGoldCost(u)}<GoldCost {characterKey} {u} auto={auto[u.key]} />{/if}
		</div>
		<div class="flex shrink-0 flex-col text-right">
			<span class="text-sm font-semibold text-green-400 tabular-nums">{u.approximate ? '≈' : ''}{formatPct(u.gainPct)}%{#if u.count > 1}<span class="ml-1 text-xs font-normal text-surface-400">each</span>{/if}</span>
			{@render cpAfter(u)}
		</div>
		{#if onapply}
			<button type="button" class="{btn} w-14 shrink-0 px-1.5" onclick={() => onapply(u)} title="Make this change in the simulator">
				{flash?.key === u.key ? (flash.ok ? '✓' : 'Done') : 'Apply'}
			</button>
		{/if}
	</div>
{/snippet}

{#snippet accessoryRow(variants: Upgrade[])}
	{@const u = variants.find((v) => v.key === focusKey) ?? variants[0]}
	<div data-key={u.key} class="flex items-start gap-3 border-t border-neutral-950 py-2 {variants.some((v) => v.key === focusKey) ? 'animate-[upgrade-focus_1.6s_ease-out] rounded-xs' : ''}">
		<div class="flex min-w-0 flex-1 flex-col gap-0.5">
			{#each u.lines ?? [] as line (line.name)}
				<div class="grid grid-cols-[minmax(0,8.5rem)_max-content] items-baseline gap-2 text-sm leading-snug"><span class="min-w-0 text-surface-100">{line.name}</span><span class="font-semibold" style:color={ROLL_COLORS[line.tier as keyof typeof ROLL_COLORS]}>{line.value ?? line.tier}</span></div>
			{/each}
			{#if (u.lines?.length ?? 0) < 3}<span class="text-xs text-surface-500">None</span>{/if}
			{#if mode === 'gold'}<GoldCost {characterKey} {u} />{/if}
		</div>
		<div class="flex shrink-0 flex-col gap-2">
			{#each variants as target (target.key)}<div class="flex items-center gap-2"><div class="text-right"><span class="block text-[11px] text-surface-400">{target.subject}</span><span class="text-sm font-semibold text-green-400 tabular-nums">{target.approximate ? '≈' : ''}{formatPct(target.gainPct)}%</span>{@render cpAfter(target)}</div>{#if onapply}<button type="button" class="{btn} w-14 px-1.5" onclick={() => onapply(target)} title={`Apply to ${target.subject}`}>{flash?.key === target.key ? (flash.ok ? '✓' : 'Done') : 'Apply'}</button>{/if}</div>{/each}
		</div>
	</div>
{/snippet}

<!-- Focusable itself (tabindex -1) so opening focuses the dialog, not its first input or Close. -->
<dialog
	bind:this={dialog}
	tabindex="-1"
	{onclose}
	onclick={(e) => e.target === dialog && dialog.close()}
	aria-labelledby="upgrade-planner-title"
	class="fixed top-[80px] m-0 max-h-none outline-none max-w-none bg-transparent p-0 text-inherit backdrop:bg-black/60 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full sm:left-1/2 sm:-translate-x-1/2"
>
	<div bind:this={card} class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800 max-sm:w-full max-sm:rounded-t-xl max-sm:rounded-b-none max-sm:animate-[sheet-up_320ms_cubic-bezier(0.22,1,0.36,1)]">
		<!-- Phones: the header is the drag-to-close zone, with a grabber. -->
		<div class="flex flex-row flex-wrap items-center justify-between px-4 py-2.5 font-bold max-sm:pt-2" use:sheetDrag={{ sheet: () => card, close: () => dialog.close(), slideOut: true, enabled: () => matchMedia('(max-width: 639px)').matches }}>
			<span class="flex basis-full justify-center pb-1 sm:hidden"><span class="h-1.5 w-12 rounded-full bg-surface-500"></span></span>
			<span id="upgrade-planner-title">Next upgrades</span>
			<button type="button" class="text-surface-300 hover:text-surface-50" aria-label="Close" onclick={() => dialog.close()}>
				<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
			</button>
		</div>
		{#if mode === 'gold' && missingTotal}
			<div class="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-200" role="status" aria-live="polite" aria-atomic="true">
				<span class="font-semibold">{missingTotal} missing price{missingTotal === 1 ? '' : 's'}</span>
				{#each groups as g (g.category)}
					{@const missing = missingPriceCount(g.list, costs)}
					{#if missing}<button type="button" class="underline decoration-amber-400/40 underline-offset-2 hover:text-amber-100" onclick={() => jump(g.category)}>{SHORT[g.category] ?? CATEGORY_LABELS[g.category]} · {missing}</button>{/if}
				{/each}
			</div>
		{/if}
		<div bind:this={scroller} onscroll={track} class="relative flex max-h-[70vh] w-[620px] flex-col gap-4 overflow-y-auto px-4 pb-4 max-md:w-[100vw]">
			{#if groups.length > 1}
				<div bind:this={bar} class="sticky top-0 z-10 -mx-4 flex flex-row flex-wrap gap-1 border-b border-neutral-950 bg-surface-900 px-4 py-2" role="navigation" aria-label="Upgrade categories">
					{#each groups as g (g.category)}
						<button
							type="button"
							onclick={() => jump(g.category)}
							aria-current={active === g.category ? 'true' : undefined}
							class="rounded-xs border px-1.5 py-1 text-[11px] font-semibold whitespace-nowrap transition {active === g.category
								? 'border-accent-500/60 bg-surface-800 text-surface-50'
								: 'border-surface-700 text-surface-300 hover:border-surface-500 hover:text-surface-50'}"
						>
								{SHORT[g.category] ?? CATEGORY_LABELS[g.category]} <span class="font-normal text-surface-500">{g.category === 'accessory' ? groupAccessoryUpgrades(g.list).reduce((n, piece) => n + piece.options.length, 0) : g.list.length}</span>
						</button>
					{/each}
				</div>
			{:else}
				<div class="h-0"></div>
			{/if}
			{#if best.length}
				<div class="grid grid-cols-3 gap-2 max-sm:grid-cols-1">
					{#each best as u, i (u.key)}
						<div class="flex flex-col gap-0.5 rounded-xs border border-surface-700 bg-black/20 p-2.5">
							<span class="text-[11px] font-semibold tracking-wide text-surface-400 uppercase">#{i + 1} · {CATEGORY_LABELS[u.category]}</span>
								<UpgradeTitle {u} />
							<span class="text-lg font-bold text-green-400">{u.approximate ? '≈' : ''}{formatPct(u.gainPct)}%{#if u.count > 1}<span class="ml-1 text-xs font-normal text-surface-400">each</span>{/if}</span>
							{@render cpAfter(u)}
							{#if mode === 'gold'}<span class="text-xs text-amber-300/90 tabular-nums">{formatGold(goldPerPct(u, costs)!)} gold per 1%</span>{/if}
						</div>
					{/each}
				</div>
			{/if}
			{#each groups as g (g.category)}
				<section id={sectionId(g.category)} class="flex flex-col">
					<div class="mb-1 flex items-center justify-between gap-2">
						<h3 class="text-xs font-semibold tracking-wide text-surface-400 uppercase">{CATEGORY_LABELS[g.category]}</h3>
						{#if mode === 'gold' && g.category === 'karma'}
							{@render priceActions(g.category)}
						{/if}
					</div>
					{#if g.category === 'skin' && skins}
						{#if skins.bonus !== null && onapply}
							<div class="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
								{#each ['Head', 'Chest', 'Pants', 'Weapon'] as piece, i}
									{@const current = skinParts(skins)[i]}
									<div class="flex min-w-0 flex-col gap-1 text-xs text-surface-400">
										<span class="text-surface-200">{piece}</span>
										<MenuPicker value={current ?? 0} options={[0, 0.5, 1, 2].map((bonus) => ({ value: bonus, label: skinGrade(bonus), suffix: { label: `+${bonus}%`, color: skinColor(bonus) }, disabled: !adjustSkinSetup(skins, i, bonus) }))} onpick={(bonus) => adjustSkin(i, bonus)} label={`${piece} skin grade`} full>
											{#snippet trigger()}<span class="text-xs text-surface-100">{skinGrade(current)}<span class="ml-1" style:color={skinColor(current)}>+{current ?? 0}%</span></span>{/snippet}
										</MenuPicker>
									</div>
								{/each}
							</div>
						{/if}
						{#if !g.list.length}<p class="text-xs text-surface-400">{skins.bonus === null ? 'Set the current skin bonus in the Skins card to calculate upgrades.' : 'No remaining skin upgrades.'}</p>{/if}
					{/if}
					{#if g.category === 'accessory' && accRolls}{@render rollPicker()}{/if}
					{#if mode === 'gold' && g.list.length && !supportsGoldCost(g.list[0])}
						<p class="mb-1 text-xs text-amber-300/90">※ Gold efficiency can't be reliably calculated for cores and astrogems.</p>
					{/if}
					{#if g.category === 'accessory'}
						<!-- Whole-accessory buys fold per piece: the best buy on the summary line, the full ladder inside. -->
						{#each groupAccessoryUpgrades(g.list) as piece (piece.name)}
							{@const missing = missingPriceCount(piece.options.flatMap((o) => o.variants), costs)}
							{@const options = mode === 'gold' && missing > 0 && missingOnly[piece.name] ? piece.options.filter((o) => missingPriceCount(o.variants, costs) > 0) : piece.options}
							<details class="group border-t border-neutral-950" open={piece.options.some((o) => o.variants.some((u) => u.key === focusKey))}>
								<summary class="flex cursor-pointer list-none flex-row flex-wrap items-center gap-x-3 gap-y-1 py-2 hover:bg-black/15 [&::-webkit-details-marker]:hidden">
									<span class="w-3 text-xs text-surface-500 transition-transform group-open:rotate-90">▸</span>
									<span class="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs"><span class="w-22 shrink-0 text-sm text-surface-100">{piece.name}</span>{#each accRolls ?? [] as roll (roll)}<span class="inline-flex items-center rounded-xs border border-surface-600 bg-black/15 px-1.5 py-0.5 font-semibold">{#each [...roll] as tier, i (i)}{#if i}<span class="text-surface-500">-</span>{/if}<span style:color={ROLL_COLORS[({ h: 'high', m: 'mid', l: 'low' } as const)[tier as 'h' | 'm' | 'l']]}>{tier.toUpperCase()}</span>{/each}</span>{/each}</span>
									<span class="text-xs text-surface-500">{piece.options.length} option{piece.options.length === 1 ? '' : 's'}</span>
									{#if piece.options.length}<span class="text-sm font-semibold text-green-400 tabular-nums">up to {piece.options.some((o) => o.variants.some((u) => u.approximate)) ? '≈' : ''}{formatPct(Math.max(...piece.options.flatMap((o) => o.variants.map((u) => u.gainPct))))}%</span>{/if}
									{#if mode === 'gold' && missing}<span class="basis-full pl-6 text-xs text-amber-300">{missing} missing price{missing === 1 ? '' : 's'}</span>{/if}
								</summary>
								<div class="pl-6">
									{#if mode === 'gold'}
										<div class="flex flex-wrap items-center justify-end gap-1.5 py-2">
											{#if missing > 0}<button type="button" class={`inline-flex h-7 items-center justify-center rounded-xs border border-amber-400 bg-amber-400/20 px-2.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/30 ${missingOnly[piece.name] ? 'opacity-100' : 'opacity-50 hover:opacity-75'}`} aria-pressed={missingOnly[piece.name] ?? false} aria-label={`Show only missing prices for ${piece.name}`} onclick={() => missingOnly[piece.name] = !missingOnly[piece.name]}>Missing prices only</button>{/if}
											{@render priceActions('accessory', piece.name === 'Necklace' ? 'neck' : piece.name.startsWith('Earrings') ? 'ear' : 'finger')}
										</div>
									{/if}
									{#each options as option (option.key)}{@render accessoryRow(option.variants)}{/each}
								</div>
							</details>
						{/each}
						{#if !g.list.length}<p class="mt-2 text-xs text-surface-400">No accessory with the applied rolls beats what you have.</p>{/if}
					{:else}
						{#each g.list as u (u.key)}{@render row(u)}{/each}
					{/if}
				</section>
			{/each}
		</div>
	</div>
</dialog>
