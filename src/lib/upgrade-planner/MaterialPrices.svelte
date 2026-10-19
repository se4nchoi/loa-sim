<!--
	Honing material prices: loaded from loa-buddy or typed, kept in this browser, used to price every honing
	row in Next Upgrades. Entered the way the market lists them (stones per 100, shards per 1,000); 0 = bound.
-->
<script lang="ts">
	import ModalClose from './sim/ModalClose.svelte';
	import DrawerHandle from './sim/DrawerHandle.svelte';
	import { HONING_BOOKS } from './honing-books-data';
	import { sheetDialog, sheetDrag } from './sim/sheet-drag';
	import { aboveKeyboard, enterToNext, numberField } from './sim/field';
	import { onMount, tick } from 'svelte';
	import { applyMarketPrices, undoMarketPrices, bookPricesFor, materialPricesFor, clearMaterialInventory, restoreMaterialInventory, clearMaterialPrices, restoreMaterialPrices, gold, parseOwned, parsePrice, setMaterialBound, setMaterialPrice, type ClearedMaterialInventory, type MarketImportUndo } from './gold-costs.svelte';
	import { MARKET_NAMES, MARKET_STALE_MS, marketForCharacter } from '$lib/market-prices';
	import { marketLoader } from '$lib/market-client';
	import { btn, btnAccent } from './sim/ui';
	import { PLENTY, SHARDS, materialIcon, materialName, type MaterialPrices } from './honing-cost';
	import { HONING_MATERIALS } from './honing-cost-data';
	import { iconUrl } from './icons';

	let {
		ids,
		characterKey,
		characterName,
		onclose
	}: {
		/** Material ids to ask for (plus 'shards'). */
		ids: string[];
		/** Bound mats are kept per character; market prices are shared. */
		characterKey: string;
		characterName?: string;
		onclose: () => void;
	} = $props();
	const bound = $derived(gold.bound[characterKey] ?? {});
	const prices = $derived(materialPricesFor(characterKey));
	const market = $derived(marketForCharacter(characterKey));
	const source = $derived(gold.marketSources[market]);
	const books = $derived(bookPricesFor(characterKey));
	const usedQuotes = $derived(Object.entries(source?.quotes ?? {}).filter(([id, quote]) => (id.startsWith('book:') ? books[id.slice(5)] : prices[id]) === quote.price));
	const observedAt = $derived(usedQuotes.length ? Math.min(...usedQuotes.map(([, quote]) => quote.updatedAt)) : null);
	let now = $state(Date.now());
	const stale = $derived(observedAt !== null && now - observedAt > MARKET_STALE_MS);
	const hoursAgo = $derived(observedAt === null ? 0 : Math.max(0, Math.floor((now - observedAt) / 3_600_000)));
	const retrySeconds = $derived(Math.max(0, Math.ceil((marketLoader.retryAt(market) - now) / 1000)));
	const priceDate = (at: number) => new Date(at).toLocaleString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
	let flashedIds = $state<Set<string>>(new Set());
	let flashTimer: ReturnType<typeof setTimeout>;
	let fetching = $state(false);
	let marketError = $state('');
	let marketNote = $state('');
	let marketUndo = $state<MarketImportUndo | null>(null);
	async function fetchPrices() {
		if (fetching || retrySeconds > 0) return;
		const key = characterKey;
		const region = market;
		fetching = true; marketError = ''; marketNote = '';
		try {
			const body = await marketLoader.load(region);
			if (key !== characterKey) return;
			flashedIds = new Set();
			await tick();
			marketUndo = applyMarketPrices(body, key);
			const keys = Object.keys(body.quotes);
			const bookCount = keys.filter(id => id.startsWith('book:')).length;
			marketNote = `Loaded ${keys.length - bookCount} material prices and ${bookCount} relic book prices`;
			flashedIds = new Set(Object.keys(body.quotes));
			clearTimeout(flashTimer);
			flashTimer = setTimeout(() => { flashedIds = new Set(); }, 2000);
		} catch (error) {
			marketError = error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'Market prices are unavailable. Try again later.';
		} finally { fetching = false; now = Date.now(); }
	}
	function undoImport() {
		if (!marketUndo) return;
		undoMarketPrices(marketUndo);
		flashedIds = new Set();
		marketUndo = null; marketNote = 'Market import undone';
	}
	function priceSource(id: string) {
		const quote = source?.quotes[id];
		if (!quote || prices[id] !== quote.price) return 'Manually entered price';
		return `loa-buddy · ${quote.slug} · ${new Date(quote.updatedAt).toLocaleString()}`;
	}
	let clearedInventory = $state<ClearedMaterialInventory | null>(null);
	let clearedPrices = $state<MaterialPrices | null>(null);
	function clearPrices() {
		const cleared = clearMaterialPrices(characterKey);
		if (Object.keys(cleared).length) clearedPrices = cleared;
	}
	function undoPrices() {
		if (!clearedPrices) return;
		restoreMaterialPrices(clearedPrices, characterKey);
		clearedPrices = null;
	}
	function clearInventory() {
		const cleared = clearMaterialInventory(characterKey);
		if (Object.keys(cleared.owned).length) clearedInventory = cleared;
	}
	function undoInventory() {
		if (!clearedInventory) return;
		restoreMaterialInventory(clearedInventory);
		clearedInventory = null;
	}
	const upperIds = ['66110226', '66102007', '66102107', '6861013', '66111131', '66111132', SHARDS];
	const lowerIds = ['66110225', '66102006', '66102106', '6861012', ...HONING_BOOKS.map(b => b.id)];
	const editableIds = $derived([...new Set([...upperIds, ...lowerIds, ...ids, ...Object.keys(HONING_MATERIALS)])]);

	let dialog: HTMLDialogElement;
	let card = $state<HTMLDivElement>();
	let instructionsOpen = $state(false);
	onMount(() => {
		try {
			const key = 'loa-sim:material-pricing-help-seen';
			instructionsOpen = localStorage.getItem(key) !== '1';
			localStorage.setItem(key, '1');
		} catch { instructionsOpen = true; }
		dialog.showModal();
		dialog.focus(); // the dialog itself, not a control: no keyboard popping up, no focus ring on Close
		const clock = setInterval(() => { now = Date.now(); }, 1000);
		return () => { clearInterval(clock); clearTimeout(flashTimer); };
	});

	/** Units the market sells in: destruction / guardian stones by 100, shards by 1,000. */
	const unit = (id: string) => (id === SHARDS ? 1000 : id.startsWith('66102') ? 100 : 1);
	const unitLabel = (id: string) => (unit(id) === 1 ? 'each' : `per ${unit(id).toLocaleString()}`);
	const shown = (id: string) => prices[id] === undefined ? '' : `${Number((prices[id] * unit(id)).toFixed(4))}`;

	const shownOwned = (id: string) => (!bound[id] ? '0' : bound[id] >= PLENTY ? '∞' : bound[id].toLocaleString());
	function commitOwned(id: string, text: string) {
		const v = parseOwned(text);
		if (v !== null) setMaterialBound(characterKey, id, v);
	}

	function commit(id: string, text: string) {
		if (!text.trim()) return setMaterialPrice(id, null, characterKey);
		const v = parsePrice(text);
		if (v !== null) setMaterialPrice(id, v / unit(id), characterKey);
	}
	const changed = $derived(
		gold.pricesAt
			? new Date(gold.pricesAt).toLocaleString(undefined, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
			: '—'
	);
</script>

{#snippet clearControls(label: string, clear: () => void, undo: () => void, canUndo: boolean)}
	<div class="flex items-center justify-start gap-1">
		<button type="button" class={btn} aria-label={`Clear ${label}`} title={`Clear ${label}`} onclick={clear}>Clear</button>
		<button type="button" class={`${btn} disabled:cursor-default disabled:opacity-30`} style:padding="0 6px" disabled={!canUndo} aria-label={`Undo clearing ${label}`} title={`Undo clearing ${label}`} onclick={undo}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h11a6 6 0 0 1 0 12" /><path d="m7 3-4 4 4 4" /></svg>
		</button>
	</div>
{/snippet}

<!-- Focusable itself (tabindex -1) so opening focuses the dialog, not its first input or Close. -->
<dialog
	bind:this={dialog} use:sheetDialog={() => card}
	use:aboveKeyboard
	tabindex="-1"
	{onclose}
	onclick={(e) => e.target === dialog && dialog.close()}
	aria-labelledby="material-prices-title"
	class="fixed top-[80px] m-0 max-h-none outline-none max-w-none bg-transparent p-0 text-inherit backdrop:bg-black/60 max-sm:top-auto max-sm:bottom-[var(--keyboard,0px)] max-sm:left-0 max-sm:w-full sm:left-1/2 sm:-translate-x-1/2"
>
	<div bind:this={card} class="sim-modal-card sm:rounded-sm sm:shadow-xl sm:shadow-black/40 sm:ring-1 sm:ring-surface-700 flex w-[600px] flex-col rounded-xs bg-surface-900 shadow-sm shadow-neutral-800 max-sm:w-full max-sm:rounded-t-xl max-sm:rounded-b-none max-sm:animate-[sheet-up_320ms_cubic-bezier(0.22,1,0.36,1)]">
		<DrawerHandle sheet={() => card} close={() => dialog.close()} label="material prices" />
		<!-- Phones: the header is the drag-to-close zone, with a grabber. -->
		<div class="sim-modal-header sm:px-4 sm:py-3 sm:text-base sm:font-semibold sm:text-surface-100 flex flex-row flex-wrap items-center justify-between px-4 py-2.5 font-bold" use:sheetDrag={{ sheet: () => card, close: () => dialog.close(), enabled: () => matchMedia('(max-width: 639px)').matches }}>

			<span id="material-prices-title">Honing material prices</span>
			<ModalClose close={() => dialog.close()} label="Close" />
		</div>
		<div class="flex max-h-[70vh] flex-col gap-3 overflow-y-auto px-4 py-3 text-sm max-sm:max-h-[min(70vh,calc(var(--visible,100vh)-4.5rem))]">
			<div class="space-y-1.5 rounded-xs border border-surface-700 bg-surface-950/40 p-2.5">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<span class="text-xs font-semibold text-surface-200" title="Selected from this character’s region">Market · {MARKET_NAMES[market]}</span>
					<div class="flex flex-wrap items-center gap-1.5">
						<button type="button" class="{btnAccent} disabled:opacity-40" disabled={fetching || retrySeconds > 0} onclick={fetchPrices}>{fetching ? 'Loading…' : retrySeconds > 0 ? `Retry in ${retrySeconds}s` : 'Load market prices'}</button>
						{#if marketUndo}<button type="button" class={btn} onclick={undoImport}>Undo import</button>{/if}
					</div>
				</div>
				<p class="text-xs text-surface-400">Loads honing materials and relic engraving books. Replaces returned prices for this region.</p>
				{#if marketNote}<p role="status" class="text-xs text-green-400">{marketNote}</p>{/if}
				{#if marketError}<p role="alert" class="text-xs text-red-300">{marketError}</p>{/if}
				{#if observedAt}
					<p class="text-xs text-surface-400">Price from {priceDate(observedAt)} <a href="https://loa-buddy.pages.dev/market" target="_blank" rel="noopener" class="ml-1 underline hover:text-surface-100">loa-buddy</a></p>
					<p class="text-xs {stale ? 'text-amber-300' : 'text-surface-400'}">({hoursAgo} {hoursAgo === 1 ? 'hour' : 'hours'} ago)</p>
				{/if}
			</div>
			<details bind:open={instructionsOpen} class="text-xs">
				<summary class="cursor-pointer font-semibold text-surface-300 select-none hover:text-surface-100">How pricing works</summary>
				<ul class="mt-2 list-disc pl-5 text-surface-100">
				<li>Character-bound mats are used first, then the market buy is simulated</li>
				<li>Put a big number (9999999999) to force 0 gold for the mat</li>
				<li>Calculates the average-tap and pity-tap cost of each honing step</li>
				<li>Character-bound mats are saved per character; market prices are shared within each region</li>
				<li class="text-amber-300/80">Each upgrade is priced on its own: every one assumes all of this character's bound mats are available to it (3k leapstones count in full for an armor tap or a weapon tap)</li>
				</ul>
			</details>
			<!-- Phones: icon only (the name is its tooltip / label), so the two inputs keep their room. -->
			<div class="grid grid-cols-[2rem_minmax(0,1fr)_8rem_6rem_3.5rem] items-center gap-x-2 gap-y-1.5 max-sm:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_3.25rem]">
				<span></span>
				<span class="max-sm:hidden"></span>
				<div class="flex flex-col items-start gap-1.5">
					{@render clearControls(`${characterName ?? 'this character'}'s material inventory`, clearInventory, undoInventory, clearedInventory?.characterKey === characterKey)}
					<span class="text-left text-[11px] font-semibold tracking-wide text-surface-100 uppercase">Character-bound</span>
				</div>
				<div class="flex flex-col items-start gap-1.5">
					{@render clearControls('market material prices', clearPrices, undoPrices, clearedPrices !== null)}
					<span class="text-left text-[11px] font-semibold tracking-wide text-surface-100 uppercase">Market</span>
				</div>
				<span></span>
				{#each editableIds as id (id)}
					{@const book = HONING_BOOKS.find(b => b.id === id)}
					{#if book}<span class="col-span-full mt-2 text-xs text-surface-100 sm:hidden">{book.name}</span>{/if}
					{#if id === lowerIds[0]}<span class="col-span-full mt-2 border-t border-surface-700 pt-2 text-xs font-semibold text-surface-400">Lower T4 materials</span>{/if}
					<div class="contents">
						{#if materialIcon(id)}
							<img src={iconUrl(materialIcon(id))} alt={materialName(id)} title={book ? `${book.name}: ${Object.entries(book.rates).map(([level, rate]) => `+${level}: +${rate / 100}%`).join(', ')}` : materialName(id)} class="size-8 shrink-0 rounded-xs bg-black/30" />
						{:else}
							<span class="size-8 shrink-0 rounded-xs bg-black/30"></span>
						{/if}
						<span class="min-w-0 leading-tight text-surface-100 max-sm:hidden">{materialName(id)}</span>
						{#if ids.includes(id)}
						<input
							use:numberField
							data-next
							enterkeyhint="next"
							value={shownOwned(id)}
							onchange={(e) => commitOwned(id, e.currentTarget.value)}
							onkeydown={(e) => enterToNext(e, card)}
							aria-label={`${materialName(id)} bound`}
							class="h-8 w-full rounded-xs border border-surface-600 bg-surface-800 px-2 text-right tabular-nums hover:border-surface-400 focus:border-accent-500 focus:outline-none {bound[id]
								? 'text-surface-50'
								: 'text-surface-400'}"
						/>
						{:else}<span class="text-right text-surface-600" title="Not used by current gear">—</span>{/if}
						<input
							use:numberField
							data-next
							enterkeyhint="next"
							value={shown(id)}
							aria-label={`${materialName(id)} market price (${unitLabel(id)})`}
							title={priceSource(id)}
							placeholder="Price"
							class:market-reloaded={flashedIds.has(id)}
							onchange={(e) => commit(id, e.currentTarget.value)}
							onkeydown={(e) => enterToNext(e, card)}
							class="h-8 w-full rounded-xs border border-surface-600 bg-surface-800 px-2 text-right tabular-nums hover:border-surface-400 focus:border-accent-500 focus:outline-none {prices[id]
								? 'text-surface-50'
								: 'text-surface-400'}"
						/>
						<span class="text-xs text-surface-400">{unitLabel(id)}</span>
					</div>
				{/each}
			</div>
			<p class="text-xs text-surface-500">Last changed: {changed}</p>
		</div>
	</div>
</dialog>

<style>
	.market-reloaded { animation: market-reloaded 2s ease-out; }
	@keyframes market-reloaded {
		0%, 35% { border-color: var(--color-accent-400); box-shadow: inset 0 0 0 1px var(--color-accent-400); }
		100% { border-color: var(--color-surface-600); box-shadow: inset 0 0 0 1px transparent; }
	}
	@media (prefers-reduced-motion: reduce) {
		.market-reloaded { animation: none; border-color: var(--color-accent-400); box-shadow: inset 0 0 0 1px var(--color-accent-400); }
	}
</style>
