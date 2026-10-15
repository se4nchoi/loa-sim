<script lang="ts">
	import { onMount } from 'svelte';
	import { calculateCraftScenarios, saleFee } from '$lib/crafting/calculate';
	import { RECIPES, craftingScope, type CraftMaterial } from '$lib/crafting/data';
	import RecipeBrowser from '$lib/crafting/RecipeBrowser.svelte';
	import InventoryDialog from '$lib/crafting/InventoryDialog.svelte';
	import Estimate from '$lib/crafting/Estimate.svelte';
	import { inventoryDisplayMaterials } from '$lib/crafting/inventory';
	import { recipeVariantLabel } from '$lib/crafting/recipe-labels';
	import { itemGrade } from '$lib/crafting/item-grade';
	import Manor from '$lib/crafting/Manor.svelte';
	import { manorTotals } from '$lib/crafting/manor';
	import { defaultCraftSave, loadCraftSave, saveCraftSave, type CraftRegion } from '$lib/crafting/storage';
	import { GRADE_GRADIENTS, iconUrl } from '$lib/upgrade-planner/icons';
	import { btn, btnAccent } from '$lib/upgrade-planner/sim/ui';

	let craft = $state(defaultCraftSave());
	let ready = $state(false);
	let saveFailed = $state(false);
	let inventoryOpen = $state(false);
	let strongholdOpen = $state(false);
	onMount(() => { craft = loadCraftSave(); ready = true; });
	$effect(() => { if (ready) saveFailed = !saveCraftSave($state.snapshot(craft)); });
	const recipe = $derived(RECIPES.find((r) => r.id === craft.recipeId) ?? RECIPES[0]);
	const hasRecipe = $derived(craft.favorites.includes(craft.recipeId));
	function selectRecipe(id: string) {
		const next = RECIPES.find(r => r.id === id);
		if (!next) return;
		craft.favorites = craft.favorites.map(value => RECIPES.find(r => r.id === value)?.product.id === next.product.id ? id : value);
		craft.recipeId = id;
	}
	const market = $derived(craft.markets.NA);
	const manorCategory = $derived(craftingScope(recipe));
	const manor = $derived(manorTotals(craft.manor, manorCategory));
	const settings = $derived({ ...craft.settings, costReduction: manor.cost, timeReduction: manor.time });
	const scenarios = $derived(calculateCraftScenarios(recipe, settings, market.prices, market.owned));
	const result = $derived(scenarios.baseline);
	const expected = $derived(scenarios.expected);
	const comparisons = $derived(RECIPES.filter((r) => r.product.id === recipe.product.id).map((r) => ({ recipe: r, result: calculateCraftScenarios(r, { ...craft.settings, greatSuccess: 0, costReduction: manorTotals(craft.manor, craftingScope(r)).cost, timeReduction: manorTotals(craft.manor, craftingScope(r)).time }, market.prices, market.owned).baseline }))
		.toSorted((a, b) => recipe.tradeable === false
			? (a.result.unitCost ?? Infinity) - (b.result.unitCost ?? Infinity)
			: (b.result.profit ?? -Infinity) - (a.result.profit ?? -Infinity)));
	const best = $derived(comparisons.find((r) => r.result.profit !== null));
	const fmt = (n: number | null, digits = 2) => n === null ? '—' : n.toLocaleString(undefined, { maximumFractionDigits: digits });
	const signed = (n: number | null) => n === null ? '—' : `${n > 0 ? '+' : ''}${fmt(n)}`;
	const tone = (n: number | null) => n === null ? 'text-surface-400' : n >= 0 ? 'text-green-400' : 'text-red-400';
	const num = (value: string) => value.trim() === '' || !Number.isFinite(Number(value)) ? undefined : Math.max(0, Number(value));
	function setQuote(id: string, value: string) {
		const n = num(value);
		if (n === undefined) delete market.prices[id];
		else market.prices[id] = Math.floor(n);
	}
	function setOwned(id: string, value: string) {
		const n = num(value);
		if (n === undefined) delete market.owned[id];
		else market.owned[id] = Math.floor(n);
	}
	function setting(key: keyof typeof craft.settings, text: string) {
		const n = num(text) ?? 0;
		craft.settings[key] = key === 'crafts' ? Math.max(1, Math.min(100000, Math.floor(n))) : Math.min(key === 'timeReduction' ? 99 : 100, n);
	}
	let clearedOwned = $state<{ region: CraftRegion; values: Record<string, number> } | null>(null);
	let clearedPrices = $state<{ region: CraftRegion; values: Record<string, number> } | null>(null);
	function clear(column: 'owned' | 'prices') {
		if (!Object.keys(market[column]).length) return;
		const snapshot = { region: craft.region, values: { ...market[column] } };
		if (column === 'owned') clearedOwned = snapshot; else clearedPrices = snapshot;
		market[column] = {};
	}
	function undo(column: 'owned' | 'prices') {
		const snapshot = column === 'owned' ? clearedOwned : clearedPrices;
		if (!snapshot || snapshot.region !== craft.region) return;
		market[column] = { ...snapshot.values, ...market[column] };
		if (column === 'owned') clearedOwned = null; else clearedPrices = null;
	}
</script>

<svelte:head>
	<title>Stronghold Crafting | loa-sim</title>
	<meta name="description" content="Estimate Abidos and Superior Abidos crafting costs, material purchases and profit after market fees using your inventory and stronghold discounts." />
</svelte:head>

{#snippet itemIcon(material: CraftMaterial, size = 'size-9')}
	<img src={iconUrl(material.icon)} alt="" class={`${size} shrink-0 rounded-xs border border-white/15`} style:background={GRADE_GRADIENTS[material.grade]} />
{/snippet}

{#snippet clearControls(column: 'owned' | 'prices')}
	{@const label = column === 'owned' ? 'owned crafting materials' : 'crafting market prices'}
	{@const snapshot = column === 'owned' ? clearedOwned : clearedPrices}
	<div class="mb-1.5 flex items-center gap-1">
		<button type="button" class={btn} onclick={() => clear(column)} aria-label={`Clear ${label}`}>Clear</button>
		<button type="button" class={`${btn} px-1.5 disabled:opacity-30`} disabled={snapshot?.region !== craft.region} onclick={() => undo(column)} aria-label={`Undo clearing ${label}`} title={`Undo clearing ${label}`}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h11a6 6 0 0 1 0 12" /><path d="m7 3-4 4 4 4" /></svg>
		</button>
	</div>
{/snippet}

<div class="mx-auto max-w-[1400px] space-y-4">
	<div class="flex flex-wrap items-center justify-between gap-3"><h1 class="text-2xl font-bold">Stronghold Crafting</h1><button type="button" class={inventoryOpen ? btnAccent : btn} aria-haspopup="dialog" aria-expanded={inventoryOpen} aria-controls="material-inventory" onclick={() => inventoryOpen = true}>Material inventory · {inventoryDisplayMaterials(market).length}</button></div>
	{#if saveFailed}<p role="alert" class="text-sm text-amber-300">Changes could not be saved in this browser. Keep this tab open to retain your inputs.</p>{/if}
	<section class="craft-card" aria-label="Crafting list"><RecipeBrowser bind:recipeId={craft.recipeId} bind:favorites={craft.favorites} /></section>
	<section class="craft-card stronghold-card" aria-labelledby="stronghold-heading">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<div><h2 id="stronghold-heading" class="font-semibold text-sky-200">Stronghold settings</h2><p class="mt-1 text-xs text-surface-300">Research · Manor · Pets · Collectibles</p></div>
			<button type="button" class={strongholdOpen ? btnAccent : btn} aria-expanded={strongholdOpen} aria-controls="stronghold-settings" onclick={() => strongholdOpen = !strongholdOpen}>{strongholdOpen ? 'Close settings' : 'Edit bonuses'}</button>
		</div>
		<div class="mt-3 flex flex-wrap items-center gap-2 text-xs"><span class="rounded-xs border border-amber-400/30 bg-amber-400/5 px-2 py-1 font-semibold text-amber-200">−{manor.cost}% gold</span><span class="rounded-xs border border-sky-400/30 bg-sky-400/5 px-2 py-1 font-semibold text-sky-200">−{manor.time}% time</span><span class="rounded-xs border border-surface-600 px-2 py-1 text-surface-200">−{manor.energy}% energy</span><span class="text-surface-400">Applied to {manorCategory}</span></div>
		{#if strongholdOpen}
			<div id="stronghold-settings" class="mt-4 border-t border-sky-400/20 pt-4"><Manor bind:setup={craft.manor} category={manorCategory} /></div>
			<details class="mt-3 border-t border-surface-700 pt-3"><summary class="text-xs text-surface-200">Expected great success <span class="text-surface-400">· {craft.settings.greatSuccess > 0 ? `${fmt(craft.settings.greatSuccess, 3)}% actual chance` : 'Off'}</span></summary>
				<label class="field-label mt-3 max-w-xs">Actual proc chance (%)<input type="number" min="0" max="100" step="0.001" value={craft.settings.greatSuccess} oninput={(e) => setting('greatSuccess', e.currentTarget.value)} class="craft-input" aria-label="Actual great success chance percent" /></label>
				<p class="mt-2 text-xs text-surface-400">0 turns off the expected result. Enter your assumed actual chance, including any bonuses. Main estimates and recipe comparisons always exclude great success.</p>
				<p class="mt-2 text-xs text-surface-400">Tooltip bonuses are not actual proc chances. A relative +5% on an assumed 5% base gives 5.25%. No base rate or bonus formula is applied automatically.</p>
			</details>
		{/if}
	</section>
	{#if hasRecipe}
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
		<section class="min-w-0 lg:col-start-2 lg:row-start-1" aria-label="Crafting results"><Estimate {recipe} {result} {expected} successChance={craft.settings.greatSuccess} /></section>
		<div class="min-w-0 space-y-4 lg:col-start-1 lg:row-start-1 lg:row-span-2">
			<section class="craft-card" aria-label="Crafting recipe">
				<div class="flex items-center gap-2">{@render itemIcon(recipe.product)}<div><h2 class="font-semibold" style:color={itemGrade(recipe.product.grade).color}>{recipe.product.name}</h2><p class="text-xs text-surface-400">{itemGrade(recipe.product.grade).name} · {recipeVariantLabel(recipe)}</p></div></div>
				<div class="mt-4 grid grid-cols-2 items-end gap-3 sm:grid-cols-3">
					<label class="field-label">Crafts<input type="number" min="1" max="100000" step="1" class="craft-input" value={craft.settings.crafts} oninput={(e) => setting('crafts', e.currentTarget.value)} aria-label="Number of crafts" /></label>
					<div class="text-sm"><span class="block text-xs text-surface-300">Guaranteed output</span><strong class="tabular-nums">{fmt(result.output, 0)}</strong><span class="ml-1 text-xs text-surface-400">({recipe.output} per craft)</span></div>
					<button type="button" class={`${btn} col-span-2 w-fit sm:col-span-1`} disabled={result.maxOwnedCrafts < 1} onclick={() => craft.settings.crafts = Math.min(100000, result.maxOwnedCrafts)} title="Craft using owned materials only">Use owned stock · {fmt(result.maxOwnedCrafts, 0)} crafts</button>
				</div>
			</section>

			<section class="craft-card" aria-labelledby="craft-inventory">
				<h2 id="craft-inventory" class="mb-3 font-semibold">Materials · {recipe.path}</h2>
				<div class="grid grid-cols-[minmax(0,1fr)_5.25rem_5.25rem] items-start gap-x-2 gap-y-3 py-1 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]">
					<div></div>
					<div>{@render clearControls('owned')}<span class="text-xs text-surface-200">Owned</span></div>
					<div>{@render clearControls('prices')}<span class="text-xs text-surface-200">Market</span></div>
					{#each result.lines as line (line.material.id)}
						<div class="flex min-w-0 items-center gap-2 px-1 py-1">{@render itemIcon(line.material)}<div class="min-w-0 py-1"><span class="block text-sm leading-tight" style:color={itemGrade(line.material.grade).color}>{line.material.name}</span><span class="text-xs text-surface-400">{itemGrade(line.material.grade).name} · {line.perCraft} per craft</span></div></div>
						<input type="number" min="0" step="1" placeholder="0" value={market.owned[line.material.id] ?? ''} oninput={(e) => setOwned(line.material.id, e.currentTarget.value)} class="craft-input mt-1" aria-label={`${line.material.name} owned`} />
						<label class="pt-1 text-[10px] text-surface-400"><input type="number" min="0" step="1" placeholder="Price" value={market.prices[line.material.id] ?? ''} oninput={(e) => setQuote(line.material.id, e.currentTarget.value)} class={`craft-input ${market.prices[line.material.id] === undefined ? 'border-amber-500/50' : ''}`} aria-label={`${line.material.name} price per ${line.material.bundle}`} />Gold / {line.material.bundle}</label>
					{/each}
				</div>
				<label class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-surface-700 pt-3"><span class="text-sm">{recipe.tradeable === false ? 'Replacement value (optional)' : 'Selling price'} <span class="text-xs text-surface-400">gold each</span></span><input type="number" min="0" step="1" class="craft-input" style:width="7rem" value={market.prices[recipe.product.id] ?? ''} placeholder="Price" oninput={(e) => setQuote(recipe.product.id, e.currentTarget.value)} aria-label="Product selling price" /></label>
				{#if recipe.tradeable === false}<p class="mt-2 text-xs text-amber-300">Bound / non-tradable output. Market-sale profit is unavailable.</p>{/if}
			</section>

			<section class="craft-card" aria-labelledby="route-compare">
				<h2 id="route-compare" class="font-semibold">Compare recipes</h2><p class="mt-1 mb-3 text-xs text-surface-400">Each route uses the same craft count and inventory independently.</p>
				<div class="grid grid-cols-[minmax(0,1fr)_6rem_6rem] gap-2 border-b border-surface-700 pb-2 text-xs text-surface-300 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]"><span>Trade skill</span><span class="text-right">{recipe.tradeable === false ? 'Cost / item' : 'Profit / craft'}</span><span class="text-right">Gold to spend</span></div>
				{#each comparisons as row (row.recipe.id)}
					<button type="button" aria-label={`Select ${recipeVariantLabel(row.recipe)} recipe`} aria-pressed={row.recipe.id === recipe.id} onclick={() => selectRecipe(row.recipe.id)} class={`grid w-full grid-cols-[minmax(0,1fr)_6rem_6rem] items-center gap-2 border-b border-surface-800 py-3 text-left text-sm hover:bg-surface-800/50 sm:grid-cols-[minmax(0,1fr)_8rem_8rem] ${row.recipe.id === recipe.id ? 'bg-accent-500/10' : ''}`}>
						<span>{recipeVariantLabel(row.recipe)}{#if recipe.tradeable !== false && best?.recipe.id === row.recipe.id}<span class="ml-1 text-[10px] text-amber-300">Best priced</span>{/if}{#if row.result.missing.length}<span class="block text-[11px] text-amber-300/80">{row.result.missing.length} missing prices</span>{/if}</span>
						<span class={`text-right font-semibold tabular-nums ${recipe.tradeable === false ? 'text-surface-100' : tone(row.result.profit)}`}>{recipe.tradeable === false ? fmt(row.result.unitCost) : signed(row.result.profit === null ? null : row.result.profit / row.result.crafts)}</span><span class="text-right tabular-nums">{fmt(row.result.cashNeeded)}</span>
					</button>
				{/each}
			</section>
		</div>

		<aside class="min-w-0 space-y-4 lg:col-start-2 lg:row-start-2 lg:self-start" aria-label="Craft details">
			<section class="craft-card" aria-labelledby="craft-summary">
				<h2 id="craft-summary" class="mb-3 font-semibold">Craft summary</h2>
				<dl class="grid grid-cols-2 gap-3">
					<div><dt class="text-xs text-surface-300">Time · {result.batches} batch{result.batches === 1 ? '' : 'es'}</dt><dd class="mt-1 font-semibold tabular-nums">{fmt(result.minutes)} <span class="text-xs font-normal text-surface-400">min</span></dd></div>
					<div><dt class="text-xs text-surface-300">Action energy</dt><dd class="mt-1 font-semibold tabular-nums">{fmt(Math.floor(recipe.energy * (100 - manor.energy) / 100) * result.crafts, 0)}</dd></div>
				</dl>
				<dl class="mt-3 space-y-2 text-xs">
					{#if recipe.tradeable !== false}<div class="result-row"><dt>Profit / queue-hour</dt><dd class={tone(result.profitPerHour)}>{signed(result.profitPerHour)}{result.profitPerHour === null ? '' : ' gold'}</dd></div>{/if}
					{#if recipe.silver}<div class="result-row"><dt>Silver fee</dt><dd>{fmt(recipe.silver * result.crafts, 0)}</dd></div>{/if}
				</dl>
				<table class="mt-4 w-full text-xs tabular-nums">
					<caption class="sr-only">Materials needed, used from owned stock, and bought in market bundles</caption>
					<thead class="text-surface-300"><tr><th scope="col" class="pb-2 text-left font-normal">Material</th><th scope="col" class="pb-2 pl-2 text-right font-normal">Need</th><th scope="col" class="pb-2 pl-2 text-right font-normal">Owned</th><th scope="col" class="pb-2 pl-2 text-right font-normal">Buy</th></tr></thead>
					<tbody>
						{#each result.lines as line (line.material.id)}
							<tr class="border-t border-surface-700"><th scope="row" class="py-2 text-left font-normal" style:color={itemGrade(line.material.grade).color}>{line.material.name}</th><td class="py-2 pl-2 text-right">{fmt(line.needed, 0)}</td><td class="py-2 pl-2 text-right">{fmt(line.used, 0)}</td><td class="py-2 pl-2 text-right">{fmt(line.purchased, 0)}</td></tr>
						{/each}
					</tbody>
				</table>
				<details class="mt-3 border-t border-surface-700 pt-3 text-xs text-surface-400">
					<summary class="cursor-pointer text-surface-300">Details & source</summary>
					<div class="mt-3 space-y-3">
						<p>One workshop queue · {recipe.batchSize ? `up to ${recipe.batchSize} crafts per timer` : 'one craft per timer'}. Purchases round up to market bundles.</p>
						{#if result.lines.some(line => line.leftover > 0)}
							<div><p class="mb-2 font-medium text-surface-300">Bought materials left over</p><dl class="space-y-1">{#each result.lines as line (line.material.id)}{#if line.leftover}<div class="result-row"><dt>{line.material.name}</dt><dd>{fmt(line.leftover, 0)}</dd></div>{/if}{/each}</dl></div>
						{/if}
						{#if recipe.silver}<p>Silver is not converted to gold.</p>{/if}
						{#if recipe.tradeable !== false}<p>Market fee: 5%, rounded up per selling unit. {market.prices[recipe.product.id] !== undefined ? `${saleFee(market.prices[recipe.product.id])} gold per item.` : ''} Refunded listing deposits are excluded.</p>{/if}
						<a href={recipe.source} target="_blank" rel="noopener noreferrer" class="inline-block text-surface-300 underline hover:text-surface-50">Recipe on Lost Ark Codex ↗</a>
					</div>
				</details>
			</section>
		</aside>
	</div>
	{/if}
</div>

{#if inventoryOpen}<InventoryDialog bind:market={craft.markets.NA} onclose={() => inventoryOpen = false} />{/if}

<style>
	.craft-card { border: 1px solid var(--color-surface-800); border-radius: 2px; background: var(--color-surface-900); padding: 1rem; }
	.stronghold-card { border-color: color-mix(in srgb, var(--color-sky-400) 35%, transparent); border-left: 3px solid var(--color-sky-400); }
	.craft-input { display: block; width: 100%; min-width: 0; height: 2rem; border: 1px solid var(--color-surface-600); border-radius: 2px; background: var(--color-surface-950); padding: 0 .5rem; color: var(--color-surface-100); font-size: .875rem; font-variant-numeric: tabular-nums; }
	.craft-input:focus { outline: 1px solid var(--color-accent-500); border-color: var(--color-accent-500); }
	.craft-input::placeholder { color: var(--color-surface-500); }
	.field-label { display: flex; flex-direction: column; gap: .375rem; font-size: .75rem; color: var(--color-surface-200); }
	.result-row { display: flex; justify-content: space-between; align-items: baseline; gap: .75rem; }
	.result-row dt { color: var(--color-surface-300); }
	.result-row dd { flex-shrink: 0; text-align: right; font-variant-numeric: tabular-nums; }
	input[type='number'] { appearance: textfield; }
	input::-webkit-inner-spin-button, input::-webkit-outer-spin-button { appearance: none; margin: 0; }
</style>
