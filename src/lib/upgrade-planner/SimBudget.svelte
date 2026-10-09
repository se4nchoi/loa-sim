<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { sheetDrag } from './sim/sheet-drag';
	import { formatCp } from './format';
	import { formatGold, gold, loadGold, parsePrice, setBookPrice, setGoldCost } from './gold-costs.svelte';
	import { GOLD_ICON, iconUrl } from './icons';
	import { PLENTY, materialIcon, materialName } from './honing-cost';
	import { accessoryPriceKey } from './accessory-sets';
	import MaterialPrices from './MaterialPrices.svelte';
	import GoldCost from './GoldCost.svelte';
	import type { Upgrade } from './upgrades';
	import { priceBudget, type BudgetChange } from './sim-budget';
	import { btn, goldPriceButton, ROLL_COLORS } from './sim/ui';
	let { changes, inventoryIds, priceUpgrades = [], onprice, current, simulated, characterKey = '', characterName, onclose }: {
		changes: BudgetChange[]; inventoryIds?: string[]; priceUpgrades?: Upgrade[]; onprice?: (upgrade: Upgrade) => void; current: number; simulated: number; characterKey?: string; characterName?: string; onclose: () => void;
	} = $props();
	let dialog: HTMLDialogElement;
	let card = $state<HTMLDivElement>();
	let pricesOpen = $state(false);
	let editing = $state<string | null>(null);
	let editText = $state('');
	let priceInput = $state<HTMLInputElement>();
	onMount(() => { loadGold(); dialog.showModal(); dialog.focus(); });
	const lines = $derived(priceBudget(changes, gold.prices, gold.bound[characterKey] ?? {}, gold.costs, gold.bookPrices));
	const average = $derived(lines.reduce((sum, row) => sum + (row.average ?? 0), 0));
	const pending = $derived(lines.filter((row) => row.status === 'unavailable' || (!row.status && (row.average === undefined || row.missing.length > 0))).length);
	const materials = $derived(inventoryIds ?? [...new Set(changes.flatMap((row) => row.tap ? [...Object.keys(row.tap.mats), ...[row.tap.breath, row.tap.moreBreath].filter((b) => b && b.max > 0).map((b) => String(b!.id)), 'shards'] : []))]);
	const groups = $derived([...new Set(lines.map((row) => row.section))]);
	const quantity = (value: number) => value >= PLENTY ? '∞' : value.toLocaleString(undefined, { maximumFractionDigits: 1 });
	async function editPrice(row: BudgetChange) {
		editing = row.key;
		editText = String((row.books ? gold.bookPrices[row.books.id] : gold.costs[accessoryPriceKey(row.sourceKey ?? row.key, gold.costs)] ?? gold.costs[row.key]) ?? '');
		await tick(); priceInput?.select();
	}
	function quote(row: BudgetChange, text: string) {
		const value = text.trim() ? parsePrice(text) : null;
		if (text.trim() && value === null) return;
		if (row.books) setBookPrice(row.books.id, value);
		else setGoldCost(row.sourceKey ?? row.key, value);
	}
</script>

{#snippet goldAmount(value: number)}
	<span class="flex w-36 items-center whitespace-nowrap text-base font-bold text-amber-200 tabular-nums"><span class="flex min-w-0 flex-1 justify-center"><img src={GOLD_ICON} alt="Gold" class="size-4" /></span><span class="min-w-0 flex-1 text-right">{formatGold(value)}</span><span class="min-w-0 flex-1 pl-2 text-xs font-normal text-surface-400">avg</span></span>
{/snippet}

<dialog bind:this={dialog} tabindex="-1" {onclose} onclick={(e) => { e.stopPropagation(); if (e.target === dialog) dialog.close(); }} aria-label="Current changes budget" class="fixed top-[60px] m-0 max-h-none max-w-none bg-transparent p-0 text-surface-100 outline-none backdrop:bg-black/60 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full sm:left-1/2 sm:-translate-x-1/2">
	<div bind:this={card} class="flex max-h-[85dvh] w-[660px] max-w-[calc(100vw-1.5rem)] flex-col rounded-xs bg-surface-900 shadow-sm shadow-neutral-800 max-sm:w-full max-sm:max-w-none max-sm:rounded-t-xl max-sm:rounded-b-none max-sm:animate-[sheet-up_320ms_cubic-bezier(0.22,1,0.36,1)]">
	<div class="flex shrink-0 flex-wrap items-start gap-3 border-b border-neutral-950 px-4 py-3 max-sm:gap-y-1" use:sheetDrag={{ sheet: () => card, close: () => dialog.close(), slideOut: true, enabled: () => matchMedia('(max-width: 639px)').matches }}>
		<span class="flex basis-full justify-center pb-1 sm:hidden"><span class="h-1.5 w-12 rounded-full bg-surface-500"></span></span>
		<div class="min-w-0 flex-1"><h2 class="flex items-center gap-2 font-semibold text-amber-200"><img src={GOLD_ICON} alt="" class="size-5" />Current changes budget</h2><p class="mt-1 flex flex-wrap items-baseline gap-2 tabular-nums"><span class="text-2xl font-bold">{formatCp(current)}</span><span class="text-surface-400">→</span><span class="text-2xl font-bold text-red-400">{formatCp(simulated)}</span></p></div>
		<button type="button" class={btn} onclick={() => dialog.close()} aria-label="Close budget">Close</button>
	</div>
	<div class="min-h-0 space-y-4 overflow-y-auto p-4">
		<div class="tabular-nums">
			<div><p class="text-xs text-surface-400">{pending ? 'Priced subtotal · average' : 'Estimated total · average'}</p><p class="mt-1 flex items-center gap-1.5 text-xl font-bold text-amber-200"><img src={GOLD_ICON} alt="Gold" class="size-5" />{formatGold(average)}</p></div>
		</div>
		{#if pending}<p class="text-xs text-amber-300">{pending} unpriced change{pending === 1 ? '' : 's'}.</p>{/if}
		<section aria-label="Current inventory" class="text-xs text-surface-500">
			<div class="mb-1.5 flex flex-wrap items-center justify-between gap-2"><h3>Current inventory</h3><button type="button" class="{btn} ml-auto" onclick={() => pricesOpen = true}>Edit material prices / inventory</button></div>
			<div class="flex flex-wrap gap-x-4 gap-y-1">{#each materials as id}<span class="inline-flex items-center gap-1 tabular-nums" title={materialName(id)}>{#if materialIcon(id)}<img src={iconUrl(materialIcon(id))} alt={materialName(id)} class="size-4 shrink-0 opacity-60" />{:else}<span>{materialName(id)}</span>{/if}{quantity(gold.bound[characterKey]?.[id] ?? 0)}</span>{/each}</div>
		</section>
		{#if !lines.length}<p class="py-6 text-center text-sm text-surface-400">No changes.</p>{/if}
		{#each groups as section}
			<section><h3 class="mb-2 text-xs font-semibold uppercase text-surface-400">{section}</h3>
				{#each lines.filter((row) => row.section === section) as row (row.key)}
					{#if row.section === 'Accessories'}
						{@const upgrade = priceUpgrades.find((u) => u.key === (row.sourceKey ?? row.key))}
						<div class="border-t border-surface-800 py-2">
							<div class="flex items-start gap-2"><p class="min-w-0 flex-1 text-sm font-semibold">{row.title}</p><span class="min-w-0 flex-1"></span><div class="flex min-w-0 flex-1 justify-end">{#if upgrade}<GoldCost u={upgrade} showPer={false} onedit={() => onprice?.(upgrade)} />{/if}</div></div>
							{#each row.rolls ?? [] as roll}<div class="mt-0.5 flex items-baseline gap-2 text-xs"><span class="min-w-0 flex-1 text-surface-200">{roll.name}</span><span class="min-w-0 flex-1 font-semibold" style:color={ROLL_COLORS[roll.tier as keyof typeof ROLL_COLORS]}>{roll.value ?? ''}</span><span class="min-w-0 flex-1"></span></div>{/each}
						</div>
					{:else}
					<div class="flex flex-wrap items-start gap-3 border-t border-surface-800 py-2">
						<div class="min-w-0 flex-1"><p class="text-sm font-semibold">{row.title}</p>{#if row.detail}<p class="mt-0.5 text-xs text-surface-400">{row.detail}</p>{/if}{#if row.missing.length}<p class="mt-0.5 text-xs text-amber-300">Missing prices: {row.missing.join(', ')}</p>{/if}</div>
						{#if row.status}<span class="text-xs text-surface-400">{row.status === 'rng' ? 'RNG · excluded' : row.status === 'excluded' ? 'Excluded' : 'Cost unavailable'}</span>
						{:else if row.tap || row.sourceKey?.startsWith('karma:') || row.fixed !== undefined}{@render goldAmount(row.average ?? 0)}
						{:else if editing === row.key}<input bind:this={priceInput} bind:value={editText} aria-label={`Gold price for ${row.title}`} placeholder={row.books ? 'Gold / book' : 'Gold price'} onblur={() => { if (editing === row.key) { quote(row, editText); editing = null; } }} onkeydown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.preventDefault(); editing = null; } }} class="h-6 w-24 rounded-xs border border-surface-600 bg-surface-800 px-1.5 text-xs text-surface-100 tabular-nums focus:border-accent-500 focus:outline-none" />
						{:else}<button type="button" class={goldPriceButton(row.average)} aria-label={`Edit gold price for ${row.title}`} title={row.books ? 'Edit price per book' : 'Edit gold cost'} onclick={() => editPrice(row)}><img src={GOLD_ICON} alt="" class="size-4 shrink-0" />{row.average === undefined ? row.books ? 'Add book price' : 'Add gold cost' : formatGold(row.average)}</button>{/if}
					</div>
					{#if row.inventory?.length}<details class="pb-3 text-xs text-surface-400"><summary class="cursor-pointer">Details</summary>
						{#if !row.inventory.some((m) => m.average > 0)}<p class="mt-2">No bound materials used. All materials are bought from the market.</p>{/if}
						{#if !row.inventory.some((m) => m.averageBuy > 0)}<p class="mt-2">Bound inventory covers all materials. No market purchases.</p>{/if}
						<table class="mt-2 w-full text-right tabular-nums"><thead><tr><th class="w-8 text-left font-normal">Mat.</th><th class="pb-1 font-normal">Bound used</th><th class="pb-1 font-normal">Market buy</th></tr></thead><tbody>{#each row.inventory as m}<tr class="border-t border-surface-800"><th class="py-1.5 text-left font-normal" title={materialName(m.id)}>{#if materialIcon(m.id)}<img src={iconUrl(materialIcon(m.id))} alt={materialName(m.id)} class="size-5" />{:else}{materialName(m.id)}{/if}</th><td class="px-1 text-surface-300">{quantity(m.average)}</td><td class="px-1 text-amber-200">{quantity(m.averageBuy)}</td></tr>{/each}</tbody></table>
					</details>{/if}
					{/if}
				{/each}
			</section>
		{/each}
		<ul class="list-disc space-y-1 border-t border-surface-700 pt-3 pl-4 text-xs text-surface-400">
			<li>Bound materials are used first, across steps in the order listed.</li>
			<li>Average costs carry forward estimated material use; actual honing results and remaining inventory will vary.</li>
			<li>Saved bound material inventory is not deducted.</li>
		</ul>
	</div>
	</div>
</dialog>
{#if pricesOpen}<MaterialPrices ids={materials} {characterKey} {characterName} onclose={() => pricesOpen = false} />{/if}
