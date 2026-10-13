<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { breathStrategy, materialIcon, materialName, type HoningCost } from './honing-cost';
	import { HONING_BOOKS } from './honing-books-data';
	import { GOLD_ICON, iconUrl } from './icons';
	import { btn, btnAccent } from './sim/ui';
	import { sheetDialog, sheetDrag } from './sim/sheet-drag';
	let { cost, title, initialMode = 'average', onclose }: { cost: HoningCost; title: string; initialMode?: 'average' | 'pity'; onclose: () => void } = $props();
	let dialog: HTMLDialogElement;
	let mode = $state<'average' | 'pity'>(untrack(() => initialMode));
	const details = $derived(cost.breakdown?.[mode]);
	const tapCount = $derived(mode === 'average' ? cost.taps : cost.maxTaps);
	const strategies = $derived((cost.strategies ?? [{ label: breathStrategy(cost), materialIds: [], selected: true }])
		.toSorted((a, b) => Number(b.selected) - Number(a.selected)));
	const chosenIds = $derived(strategies.find(strategy => strategy.selected)?.materialIds ?? []);
	const breathIds = $derived([...new Set(strategies.flatMap(strategy => strategy.materialIds))].filter(id => !HONING_BOOKS.some(book => book.id === id)));
	const bookId = $derived(chosenIds.find(id => HONING_BOOKS.some(book => book.id === id)) ?? HONING_BOOKS.find(book => book.name === cost.book?.name)?.id);
	const quantity = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 1 });
	// Whole gold: decimals only add width (and shift the table on phones as the numbers change).
	const money = (n: number) => Math.round(n).toLocaleString();
	const unitPrice = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
	let card = $state<HTMLDivElement>();
	onMount(() => {
		dialog.showModal();
		dialog.focus(); // the dialog itself: no keyboard popping up, no focus ring
	});
</script>

<dialog bind:this={dialog} use:sheetDialog={() => card} {onclose} onclick={(e) => { e.stopPropagation(); if (e.target === dialog) dialog.close(); }} aria-label="Honing material breakdown" tabindex="-1" class="m-auto max-h-[85vh] w-[640px] max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-sm border border-surface-700 bg-transparent p-0 text-surface-100 outline-none backdrop:bg-black/60 max-sm:mx-0 max-sm:mt-auto max-sm:mb-0 max-sm:w-full max-sm:max-w-full max-sm:rounded-none max-sm:border-0">
<!-- Phones: a bottom sheet; the header is the drag-to-close zone, with a grabber. -->
<div bind:this={card} class="flex max-h-[85vh] flex-col bg-surface-900 max-sm:rounded-t-xl max-sm:border-t max-sm:border-surface-700 max-sm:animate-[sheet-up_320ms_cubic-bezier(0.22,1,0.36,1)]">
	<div class="flex flex-wrap items-start gap-3 border-b border-neutral-950 px-4 py-3 max-sm:pt-2" use:sheetDrag={{ sheet: () => card, close: () => dialog.close(), enabled: () => matchMedia('(max-width: 639px)').matches }}>
		<span class="flex basis-full justify-center pb-1 sm:hidden"><span class="h-1.5 w-12 rounded-full bg-surface-500"></span></span>
		<div class="min-w-0 flex-1">
			<h2 class="font-semibold">Honing material breakdown</h2>
			<p class="mt-1 text-xs text-surface-400">{title}</p>
		</div>
		<button type="button" class={btn} onclick={() => dialog.close()} aria-label="Close material breakdown">Close</button>
	</div>
	<div class="space-y-3 overflow-y-auto overscroll-contain p-4">
		<div class="flex flex-wrap items-center gap-2">
			<button type="button" class={mode === 'average' ? btnAccent : btn} aria-pressed={mode === 'average'} onclick={() => (mode = 'average')}>Average</button>
			<button type="button" class={mode === 'pity' ? btnAccent : btn} aria-pressed={mode === 'pity'} onclick={() => (mode = 'pity')}>Pity</button>
			<span class="ml-auto flex items-baseline gap-1.5"><span class="text-lg font-semibold text-accent-300 tabular-nums">{quantity(tapCount)}</span><span class="text-xs text-surface-200">taps</span></span>
		</div>
		{#if details}
			<div class="overflow-x-auto">
				<table class="w-full text-xs tabular-nums">
					<thead class="text-surface-400"><tr class="border-b border-surface-700"><th class="py-2 text-left font-normal">Material</th><th class="px-2 py-2 text-right font-normal">Per tap</th><th class="px-2 py-2 text-right font-normal">Bound used</th><th class="px-2 py-2 text-right font-normal">Market buy</th><th class="py-2 text-right font-normal">Gold spent</th></tr></thead>
					<tbody>
						<tr class="border-b border-surface-800" title="Gold paid directly across all taps">
							<th scope="row" class="py-2 text-left font-normal text-surface-300"><span class="flex items-center gap-1.5"><img src={GOLD_ICON} alt="" class="size-5 shrink-0" />Tap gold</span></th>
							<td class="px-2 py-2 text-right text-surface-400">{money(tapCount > 0 ? details.tapGold / tapCount : 0)}</td>
							<td class="px-2 py-2 text-right text-surface-400">—</td>
							<td class="px-2 py-2 text-right text-surface-400">—</td>
							<td class="py-2 text-right text-amber-200">{money(details.tapGold)}</td>
						</tr>
						{#each details.materials as material (material.id)}
							{@const icon = materialIcon(material.id)}
							<tr class="border-b border-surface-800">
								<th scope="row" class="py-2 text-left font-normal"><span class="flex items-center gap-1.5">{#if icon}<img src={iconUrl(icon)} alt="" class="size-5 shrink-0" />{/if}{materialName(material.id)}</span></th>
								<td class="px-2 py-2 text-right text-surface-400">{quantity(material.perTap)}{#if material.until !== undefined && cost.breathMode !== 'full'}<span class="block whitespace-nowrap text-[10px]">first {material.until} taps</span>{/if}</td>
								<td class="px-2 py-2 text-right text-surface-300">{quantity(material.bound)}</td>
								<td class="px-2 py-2 text-right">{quantity(material.bought)}</td>
								<td class="py-2 text-right text-amber-200" title={`${unitPrice(material.price)} gold per unit`}>{money(material.gold)}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
			<div class="space-y-1 text-xs tabular-nums">
				<p class="flex justify-between gap-3 border-t border-surface-700 pt-2 font-semibold text-amber-200"><span>Total gold</span><span>{money(mode === 'average' ? cost.expected : cost.worst)}</span></p>
			</div>
		{/if}
		{#if cost.book}
			<section class="rounded-xs border border-amber-500/30 p-3 text-xs" aria-label="Honing book efficiency">
				<h3 class="mb-1 font-semibold text-amber-200">{cost.book.name}</h3>
				{#if cost.book.unavailable}
					<p>Books excluded from strategies: no bound stock or market price entered. Enter a price of 0 to compare free market books.</p>
				{:else}
				<p>Saves {money(cost.book.savedGold)} gold on average versus no books.</p>
				<p>Average books used: {quantity(cost.book.used)} · Market buys: {quantity(cost.book.bought)}</p>
				{#if cost.book.breakEven !== null}<p>Market break-even: {money(cost.book.breakEven)} gold per book versus the best bound-only option.</p>{/if}
				{/if}
			</section>
		{/if}
		<section aria-label="Breath strategy" class="space-y-2 rounded-xs border border-accent-500/30 bg-accent-500/5 p-3">
			<h3 class="flex items-center gap-1.5 text-sm font-semibold text-accent-300">
				{#each breathIds as id}{@const icon = materialIcon(id)}{#if icon}<img src={iconUrl(icon)} alt={materialName(id)} title={materialName(id)} class="size-5 shrink-0" />{/if}{/each}
				<span class="min-w-0 flex-1">Chosen {cost.book ? 'Honing' : 'Breath'} Strategy</span>
				{#if bookId}{@const icon = materialIcon(bookId)}{#if icon}<img src={iconUrl(icon)} alt={materialName(bookId)} title={materialName(bookId)} class="size-5 shrink-0" />{/if}{/if}
			</h3>
			<ul class="space-y-1.5 text-xs">
				{#each strategies as strategy}
					<li title={strategy.label} class={strategy.selected ? 'rounded-xs border border-accent-500/50 bg-accent-500/15 p-2 font-semibold text-accent-200' : 'px-2 py-1 text-surface-400'}>
						{strategy.summary ?? strategy.label}
						{#if strategy.expected !== undefined && strategy.firstTapChance !== undefined}<span class="mt-0.5 block font-normal text-surface-400 tabular-nums">{money(strategy.expected)} gold avg · {(strategy.firstTapChance * 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}% first-tap success</span>{/if}
					</li>
				{/each}
			</ul>
			<hr class="border-surface-700" />
			<p class="text-xs text-surface-400">Chosen strategy has the best gold efficiency among these options given your prices and bound stock.</p>
			{#if cost.book}<p class="text-xs text-surface-400">Compares full quantities for an initial run of taps, then stops. Combined breath and book options share a cutoff; arbitrary per-tap mixes are not searched.</p>{/if}
		</section>
		<ul class="list-disc space-y-1 pl-4 text-xs text-surface-400">
			<li>{mode === 'average' ? 'Average quantities are weighted across possible outcomes.' : 'Pity assumes every try fails until the next try is guaranteed.'}</li>
			<li>Bound materials are used first. These estimates do not deduct materials from your saved inventory.</li>
			<li>Market gold uses your entered prices; unset prices count as 0.</li>
		</ul>
	</div>
</div>
</dialog>
