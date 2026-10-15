<script lang="ts">
	import type { CraftMarket } from './storage';
	import { CRAFT_MATERIALS, inventoryDisplayMaterials, inventoryGroups, inventoryValue, materialUsage } from './inventory';
	import { itemGrade } from './item-grade';
	import { GRADE_GRADIENTS, iconUrl } from '$lib/upgrade-planner/icons';
	let { market = $bindable() }: { market: CraftMarket } = $props();
	let query = $state('');
	const term = $derived(query.trim().toLowerCase());
	const listed = $derived(inventoryDisplayMaterials(market));
	const groups = $derived(inventoryGroups(market).map(group => ({ ...group, materials: group.materials.filter(material => `${group.name} ${material.name}`.toLowerCase().includes(term)) })).filter(group => group.materials.length));
	const matches = $derived(term ? CRAFT_MATERIALS.filter(material => material.name.toLowerCase().includes(term) && !listed.some(item => item.id === material.id)) : []);
	const value = $derived(inventoryValue(market));
	const ambiguous = new Set(CRAFT_MATERIALS.filter(material => CRAFT_MATERIALS.some(other => other.id !== material.id && other.name === material.name)).map(material => material.id));
	const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 2 });
	function edit(column: 'owned' | 'prices', id: string, text: string) {
		if (!text.trim()) delete market[column][id];
		else if (Number.isFinite(Number(text))) market[column][id] = Math.max(0, Math.floor(Number(text)));
	}
</script>

<div class="flex flex-wrap items-start justify-between gap-3">
	<p class="max-w-xs text-xs text-surface-400">Usual battle-item and fusion materials are listed below. Stock and prices are shared across recipes and saved in this browser.</p>
	<div class="text-right text-xs text-surface-300">Priced stock value<p class="mt-1 font-semibold text-amber-300">{fmt(value.gold)} gold</p>{#if value.unpriced}<p class="mt-1 text-amber-300">{value.unpriced} owned material{value.unpriced === 1 ? '' : 's'} without a price</p>{/if}</div>
</div>
<label class="mt-4 block"><span class="sr-only">Search crafting materials</span><input type="search" bind:value={query} placeholder="Filter materials or search for extras…" class="h-10 w-full rounded-xs border border-surface-600 bg-surface-950 px-3 text-sm outline-none focus:border-accent-500" /></label>
{#if matches.length}
	<div class="mt-2 max-h-48 overflow-y-auto rounded-xs border border-surface-700" aria-label="Material search results">
		{#each matches.slice(0, 30) as material (material.id)}
			<button type="button" class="flex w-full items-center justify-between gap-2 border-b border-surface-800 px-3 py-2 text-left text-sm hover:bg-surface-800" aria-label={`Add ${material.name} to inventory${ambiguous.has(material.id) ? ` (${materialUsage(material.id)})` : ''}`} onclick={() => { market.owned[material.id] ??= 0; query = ''; }}><span><span class="block" style:color={itemGrade(material.grade).color}>{material.name}</span><span class="mt-1 block text-[11px] text-surface-400">{materialUsage(material.id)} · quote / {material.bundle}</span></span><span class="text-xs text-amber-300">+ Add</span></button>
		{/each}
		{#if matches.length > 30}<p class="px-3 py-2 text-xs text-surface-400">Keep typing to narrow {matches.length} matches.</p>{/if}
	</div>
{/if}
{#if groups.length}
	<div class="mt-4" aria-label="Crafting material rows">
		<div class="grid grid-cols-[minmax(0,1fr)_5rem_5.5rem] items-start gap-x-2 gap-y-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]">
			<span class="text-xs text-surface-400">{listed.length} materials</span><span class="text-xs text-surface-200">Owned</span><span class="text-xs text-surface-200">Market</span>
			{#each groups as group (group.name)}
				<h3 class="col-span-full border-t border-surface-700 pt-3 text-xs font-semibold text-surface-200">{group.name}</h3>
				{#each group.materials as material (material.id)}
				<div class="flex min-w-0 items-center gap-2 py-1"><img src={iconUrl(material.icon)} alt="" class="size-8 shrink-0 rounded-xs border border-white/15" style:background={GRADE_GRADIENTS[material.grade]} /><div class="min-w-0 py-1"><p class="text-sm leading-tight" style:color={itemGrade(material.grade).color}>{material.name}</p><p class="mt-1 text-[11px] text-surface-400">{itemGrade(material.grade).name}{group.name === 'Other materials' && ambiguous.has(material.id) ? ` · ${materialUsage(material.id)}` : ''}</p></div></div>
				<input type="number" min="0" step="1" placeholder="0" value={market.owned[material.id] ?? 0} oninput={e => edit('owned', material.id, e.currentTarget.value)} class="inventory-input mt-1" aria-label={`${material.name} inventory owned`} />
				<label class="pt-1 text-[10px] text-surface-400"><input type="number" min="0" step="1" placeholder="Price" value={market.prices[material.id] ?? ''} oninput={e => edit('prices', material.id, e.currentTarget.value)} class="inventory-input" aria-label={`${material.name} inventory price per ${material.bundle}`} />Gold / {material.bundle}</label>
				{/each}
			{/each}
		</div>
	</div>
{:else}
	<p class="mt-4 text-sm text-surface-400">No listed materials match. Try another name or add an extra from the search results.</p>
{/if}
<p class="mt-3 text-xs text-surface-400">Stock value uses your market quotes before selling fees. A blank quote is unknown; 0 is an explicit zero value.</p>

<style>
	.inventory-input { display: block; width: 100%; min-width: 0; height: 2rem; border: 1px solid var(--color-surface-600); border-radius: 2px; background: var(--color-surface-950); padding: 0 .5rem; color: var(--color-surface-100); font-size: .875rem; font-variant-numeric: tabular-nums; }
	.inventory-input:focus { outline: 1px solid var(--color-accent-500); border-color: var(--color-accent-500); }
	input[type='number'] { appearance: textfield; }
	input::-webkit-inner-spin-button, input::-webkit-outer-spin-button { appearance: none; margin: 0; }
</style>
