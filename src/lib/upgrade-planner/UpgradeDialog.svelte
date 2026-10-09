<script lang="ts">
	import { sheetDrag } from './sim/sheet-drag';
	import { onMount } from 'svelte';
	import { formatCp, formatPct } from './format';
	import { btn } from './sim/ui';
	import UpgradeTitle from './UpgradeTitle.svelte';
	import GoldCost from './GoldCost.svelte';
	import { byGold, formatGold, goldPerPct, supportsGoldCost, type RankMode, gold, setHideTripleHigh } from './gold-costs.svelte';
	import type { HoningCost } from './honing-cost';
	import { CATEGORY_LABELS, type Upgrade, type UpgradeCategory } from './upgrades';

	let {
		upgrades,
		cp,
		onclose,
		onapply,
		flash = null,
		mode = 'cp',
		focusKey = null,
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
		/** Scroll to and highlight this upgrade on open. */
		focusKey?: string | null;
		/** Honing rows priced from material prices. */
		auto?: Record<string, HoningCost>;
		/** Gold cost per row: typed, else calculated. */
		costs?: Record<string, number>;
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
	const groups = $derived.by(() => {
		const by = new Map<UpgradeCategory, Upgrade[]>();
		for (const u of upgrades) by.set(u.category, [...(by.get(u.category) ?? []), u]);
		return [...by.entries()]
			.map(([category, list]) => ({ category, list: list.toSorted((a, b) => b.gainPct - a.gainPct) }))
			.sort((a, b) => b.list[0].gainPct - a.list[0].gainPct);
	});
	// Sticky category bar: jump to a section; the one scrolled to is highlighted.
	let scroller = $state<HTMLDivElement>();
	let bar = $state<HTMLDivElement>();
	let active = $state<UpgradeCategory | null>(null);
	const sectionId = (c: UpgradeCategory) => `upgrades-${c}`;
	/** Shorter names so the bar fits on one line. */
	const SHORT: Partial<Record<UpgradeCategory, string>> = { core: 'Cores' };
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
	/** Accessory rows by piece (Necklace, Earring 1, …), each best first. */
	const bySlot = (list: Upgrade[]) => {
		const by = new Map<string, Upgrade[]>();
		for (const u of list) by.set(u.subject ?? '', [...(by.get(u.subject ?? '') ?? []), u]);
		return [...by.entries()].map(([slot, items]) => ({ slot, list: items }));
	};
	const best = $derived(mode === 'gold' ? byGold(upgrades, costs).slice(0, 3) : upgrades.slice(0, 3));
</script>

{#snippet row(u: Upgrade)}
	<div
		data-key={u.key}
		class="flex flex-row items-center gap-3 border-t border-neutral-950 py-2 {u.key === focusKey ? 'animate-[upgrade-focus_1.6s_ease-out] rounded-xs' : ''}"
	>
		<div class="flex min-w-0 flex-1 flex-col">
				<UpgradeTitle {u} />
			{#if u.detail}<span class="text-xs text-surface-400">{u.detail}</span>{/if}
			{#if mode === 'gold' && supportsGoldCost(u)}<GoldCost {u} auto={auto[u.key]} />{/if}
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
							{SHORT[g.category] ?? CATEGORY_LABELS[g.category]} <span class="font-normal text-surface-500">{g.list.length}</span>
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
							{#if mode === 'gold'}<span class="text-xs text-amber-300/90 tabular-nums">{formatGold(goldPerPct(u, costs)!)} gold per 1%</span>{/if}
						</div>
					{/each}
				</div>
			{/if}
			{#each groups as g (g.category)}
				<section id={sectionId(g.category)} class="flex flex-col">
					<h3 class="mb-1 text-xs font-semibold tracking-wide text-surface-400 uppercase">{CATEGORY_LABELS[g.category]}</h3>
					{#if g.category === 'accessory'}
						<label class="mb-1 flex w-fit cursor-pointer flex-row items-center gap-1.5 text-xs text-surface-400 hover:text-surface-100">
							<input type="checkbox" class="accent-accent-500" checked={gold.hideTripleHigh} onchange={(e) => setHideTripleHigh(e.currentTarget.checked)} />
							Hide High-High-High
						</label>
					{/if}
					{#if g.category === 'accessory'}
						<!-- Whole-accessory buys fold per piece: the best buy on the summary line, the full ladder inside. -->
						{#each bySlot(g.list) as piece (piece.slot)}
							<details class="group border-t border-neutral-950" open={piece.list.some((u) => u.key === focusKey)}>
								<summary class="flex cursor-pointer list-none flex-row items-center gap-3 py-2 hover:bg-black/15 [&::-webkit-details-marker]:hidden">
									<span class="w-3 text-xs text-surface-500 transition-transform group-open:rotate-90">▸</span>
									<span class="min-w-0 flex-1"><UpgradeTitle compact u={piece.list[0]} /></span>
									<span class="text-xs text-surface-500">{piece.list.length} option{piece.list.length > 1 ? 's' : ''}</span>
									<span class="text-sm font-semibold text-green-400 tabular-nums">up to {piece.list[0].approximate ? '≈' : ''}{formatPct(piece.list[0].gainPct)}%</span>
								</summary>
								<div class="pl-6">
									{#each piece.list as u (u.key)}{@render row(u)}{/each}
								</div>
							</details>
						{/each}
					{:else}
						{#each g.list as u (u.key)}{@render row(u)}{/each}
					{/if}
				</section>
			{/each}
		</div>
	</div>
</dialog>
