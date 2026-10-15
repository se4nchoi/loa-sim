<script lang="ts">
	import { onMount } from 'svelte';
	import { calculateCraft, saleFee } from '$lib/crafting/calculate';
	import { CATEGORIES, RECIPES, type CraftMaterial } from '$lib/crafting/data';
	import Manor from '$lib/crafting/Manor.svelte';
	import { manorTotals } from '$lib/crafting/manor';
	import { defaultCraftSave, loadCraftSave, saveCraftSave, type CraftRegion } from '$lib/crafting/storage';
	import { GRADE_GRADIENTS, iconUrl } from '$lib/upgrade-planner/icons';
	import { btn, btnAccent } from '$lib/upgrade-planner/sim/ui';

	let craft = $state(defaultCraftSave());
	let ready = $state(false);
	let saveFailed = $state(false);
	onMount(() => { craft = loadCraftSave(); ready = true; });
	$effect(() => { if (ready) saveFailed = !saveCraftSave($state.snapshot(craft)); });
	const recipe = $derived(RECIPES.find((r) => r.id === craft.recipeId) ?? RECIPES[0]);
	const market = $derived(craft.markets.NA);
	const manorCategory = $derived(recipe.manorCategory ?? recipe.category ?? 'Special');
	const manor = $derived(manorTotals(craft.manor, manorCategory));
	const settings = $derived({ ...craft.settings, costReduction: manor.cost, timeReduction: manor.time });
	const result = $derived(calculateCraft(recipe, settings, market.prices, market.owned));
	const comparisons = $derived(RECIPES.filter((r) => r.product.id === recipe.product.id).map((r) => ({ recipe: r, result: calculateCraft(r, settings, market.prices, market.owned) }))
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
	let search = $state('');
	let category = $state('All');
	const recipeName = (r: typeof recipe) => {
		const duplicates = RECIPES.filter((other) => other.product.id === r.product.id && other.path === r.path);
		const variant = duplicates.length > 1 ? ` · ${r.ingredients.map((i) => `${i.material.name} ×${i.quantity}`).join(', ')}` : r.path !== r.category ? ` · ${r.path}` : '';
		return `${r.product.name}${variant}`;
	};
	const filtered = $derived(RECIPES.filter((r) => (category === 'All' || r.category === category) && (!craft.favoritesOnly || craft.favorites.includes(r.id)) && recipeName(r).toLowerCase().includes(search.toLowerCase().trim())));
	const variants = $derived(RECIPES.filter((r) => r.product.id === recipe.product.id));
	function favorite() { craft.favorites = craft.favorites.includes(recipe.id) ? craft.favorites.filter((id) => id !== recipe.id) : [...craft.favorites, recipe.id]; }
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
	<h1 class="text-2xl font-bold">Stronghold Crafting</h1>
	{#if saveFailed}<p role="alert" class="text-sm text-amber-300">Changes could not be saved in this browser. Keep this tab open to retain your inputs.</p>{/if}
	<div class="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
		<div class="min-w-0 space-y-4">
			<section class="craft-card" aria-label="Crafting recipe">
				<div class="mb-3 flex flex-wrap items-center gap-2"><select class="craft-input" style:width="auto" bind:value={category} aria-label="Craft category"><option value="All">All craftables</option>{#each CATEGORIES as name}<option value={name}>{name}</option>{/each}</select><label class="flex items-center gap-1.5 text-xs text-surface-200"><input type="checkbox" bind:checked={craft.favoritesOnly} class="accent-amber-400" />Favorites only</label><span class="ml-auto text-xs text-surface-400">{filtered.length} recipes</span></div>
				<input type="search" class="craft-input mb-2" placeholder="Search craftables…" bind:value={search} aria-label="Search craftables" />
				<div class="flex min-w-0 items-center gap-2">{@render itemIcon(recipe.product, 'size-10')}<select class="craft-input min-w-0 flex-1" bind:value={craft.recipeId} aria-label="Crafting recipe">{#if !filtered.some((r) => r.id === recipe.id)}<option value={recipe.id}>{recipeName(recipe)} · selected</option>{/if}{#each CATEGORIES as name}{@const options = filtered.filter((r) => r.category === name)}{#if options.length}<optgroup label={name}>{#each options as option}<option value={option.id}>{craft.favorites.includes(option.id) ? '★ ' : ''}{recipeName(option)}</option>{/each}</optgroup>{/if}{/each}</select><button type="button" class={`${btn} h-9 text-lg ${craft.favorites.includes(recipe.id) ? 'text-amber-300' : 'text-surface-400'}`} aria-label={craft.favorites.includes(recipe.id) ? 'Remove recipe from favorites' : 'Favorite recipe'} aria-pressed={craft.favorites.includes(recipe.id)} onclick={favorite}>{craft.favorites.includes(recipe.id) ? '★' : '☆'}</button></div>
				{#if !filtered.length}<p class="mt-2 text-xs text-surface-400">No recipes match the filters.</p>{/if}
				{#if variants.length > 1 && variants.every((r) => r.path !== r.category)}<div class="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Trade skill recipe">{#each variants as variant}<button type="button" class={variant.id === recipe.id ? btnAccent : btn} aria-pressed={variant.id === recipe.id} onclick={() => craft.recipeId = variant.id}>{variant.path}</button>{/each}</div>{/if}
				<div class="mt-4 grid grid-cols-2 items-end gap-3 sm:grid-cols-3">
					<label class="field-label">Crafts<input type="number" min="1" max="100000" step="1" class="craft-input" value={craft.settings.crafts} oninput={(e) => setting('crafts', e.currentTarget.value)} aria-label="Number of crafts" /></label>
					<div class="text-sm"><span class="block text-xs text-surface-300">Guaranteed output</span><strong class="tabular-nums">{fmt(result.output, 0)}</strong><span class="ml-1 text-xs text-surface-400">({recipe.output} per craft)</span></div>
					<button type="button" class={`${btn} col-span-2 w-fit sm:col-span-1`} disabled={result.maxOwnedCrafts < 1} onclick={() => craft.settings.crafts = Math.min(100000, result.maxOwnedCrafts)} title="Craft using owned materials only">Use owned stock · {fmt(result.maxOwnedCrafts, 0)} crafts</button>
				</div>
			</section>

			<section class="craft-card" aria-labelledby="craft-inventory">
				<h2 id="craft-inventory" class="mb-3 font-semibold">Materials · {recipe.path}</h2>
				<div class="grid grid-cols-[minmax(0,1fr)_5.25rem_5.25rem] items-center gap-x-2 gap-y-3 sm:grid-cols-[minmax(0,1fr)_7rem_7rem]">
					<div></div>
					<div>{@render clearControls('owned')}<span class="text-xs text-surface-200">Owned</span></div>
					<div>{@render clearControls('prices')}<span class="text-xs text-surface-200">Market</span></div>
					{#each result.lines as line (line.material.id)}
						<div class="flex min-w-0 items-center gap-2">{@render itemIcon(line.material)}<div class="min-w-0"><span class="block text-sm leading-tight">{line.material.name}</span><span class="text-xs text-surface-400">{line.perCraft} per craft</span></div></div>
						<input type="number" min="0" step="1" placeholder="0" value={market.owned[line.material.id] ?? ''} oninput={(e) => setOwned(line.material.id, e.currentTarget.value)} class="craft-input" aria-label={`${line.material.name} owned`} />
						<label class="text-[10px] text-surface-400"><input type="number" min="0" step="1" placeholder="Price" value={market.prices[line.material.id] ?? ''} oninput={(e) => setQuote(line.material.id, e.currentTarget.value)} class={`craft-input ${market.prices[line.material.id] === undefined ? 'border-amber-500/50' : ''}`} aria-label={`${line.material.name} price per ${line.material.bundle}`} />Gold / {line.material.bundle}</label>
					{/each}
				</div>
				<label class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-surface-700 pt-3"><span class="text-sm">{recipe.tradeable === false ? 'Replacement value (optional)' : 'Selling price'} <span class="text-xs text-surface-400">gold each</span></span><input type="number" min="0" step="1" class="craft-input" style:width="7rem" value={market.prices[recipe.product.id] ?? ''} placeholder="Price" oninput={(e) => setQuote(recipe.product.id, e.currentTarget.value)} aria-label="Product selling price" /></label>
				{#if recipe.tradeable === false}<p class="mt-2 text-xs text-amber-300">Bound / non-tradable output. Market-sale profit is unavailable.</p>{/if}
			</section>

			<section class="craft-card" aria-labelledby="stronghold-settings">
				<div id="stronghold-settings"><Manor bind:setup={craft.manor} category={manorCategory} /></div>
				<details class="mt-3 border-t border-surface-700 pt-3"><summary class="text-xs text-surface-200">Great success estimate</summary>
					<label class="field-label mt-3 max-w-xs">Actual great success chance (%)<input type="number" min="0" max="100" step="0.1" value={craft.settings.greatSuccess} oninput={(e) => setting('greatSuccess', e.currentTarget.value)} class="craft-input" aria-label="Actual great success chance percent" /></label>
					<p class="mt-2 text-xs text-surface-400">0 excludes bonus output. Enter an actual probability, not the relative bonus shown on a structure or outfit. Double-output crafts are averaged; short batches can vary.</p>
				</details>
			</section>

			<section class="craft-card" aria-labelledby="route-compare">
				<h2 id="route-compare" class="font-semibold">Compare recipes</h2><p class="mt-1 mb-3 text-xs text-surface-400">Each route uses the same craft count and inventory independently.</p>
				<div class="grid grid-cols-[minmax(0,1fr)_6rem_6rem] gap-2 border-b border-surface-700 pb-2 text-xs text-surface-300 sm:grid-cols-[minmax(0,1fr)_8rem_8rem]"><span>Trade skill</span><span class="text-right">{recipe.tradeable === false ? 'Cost / item' : 'Profit / craft'}</span><span class="text-right">Gold to spend</span></div>
				{#each comparisons as row (row.recipe.id)}
					<button type="button" aria-label={`Select ${row.recipe.path} recipe`} aria-pressed={row.recipe.id === recipe.id} onclick={() => craft.recipeId = row.recipe.id} class={`grid w-full grid-cols-[minmax(0,1fr)_6rem_6rem] items-center gap-2 border-b border-surface-800 py-3 text-left text-sm hover:bg-surface-800/50 sm:grid-cols-[minmax(0,1fr)_8rem_8rem] ${row.recipe.id === recipe.id ? 'bg-accent-500/10' : ''}`}>
						<span>{row.recipe.path}{#if recipe.tradeable !== false && best?.recipe.id === row.recipe.id}<span class="ml-1 text-[10px] text-amber-300">Best priced</span>{/if}{#if row.result.missing.length}<span class="block text-[11px] text-amber-300/80">{row.result.missing.length} missing prices</span>{/if}</span>
						<span class={`text-right font-semibold tabular-nums ${recipe.tradeable === false ? 'text-surface-100' : tone(row.result.profit)}`}>{recipe.tradeable === false ? fmt(row.result.unitCost) : signed(row.result.profit === null ? null : row.result.profit / row.result.crafts)}</span><span class="text-right tabular-nums">{fmt(row.result.cashNeeded)}</span>
					</button>
				{/each}
			</section>
		</div>

		<aside class="min-w-0 space-y-4 lg:sticky lg:top-16 lg:self-start" aria-label="Crafting results">
			<section class="craft-card">
				<h2 class="font-semibold">Crafting estimate</h2>
				{#if result.missing.length}<p class="mt-2 text-xs text-amber-300">Add {result.missing.length} missing price{result.missing.length === 1 ? '' : 's'} to complete the estimate.</p>{/if}
				{#if recipe.tradeable === false}
				<div class="my-4"><p class="text-xs text-surface-200">Cost per bound item</p><p class="mt-1 text-3xl font-bold tabular-nums">{fmt(result.unitCost)}<span class="ml-1 text-sm font-normal text-surface-400">gold</span></p><p class="mt-1 text-xs text-surface-400">Bound output cannot be sold. Owned materials count at market value.</p></div>
				{:else}
				<div class="my-4"><p class="text-xs text-surface-200">Profit at market material value</p><p class={`mt-1 text-3xl font-bold tabular-nums ${tone(result.profit)}`}>{signed(result.profit)}<span class="ml-1 text-sm font-normal text-surface-400">gold</span></p><p class="mt-1 text-xs text-surface-400">Owned materials count at market value, not as free profit.</p></div>
				{/if}
				<dl class="space-y-2 text-sm">
					{#if recipe.tradeable !== false}
					<div class="result-row"><dt>Profit / craft</dt><dd class={tone(result.profit)}>{signed(result.profit === null ? null : result.profit / result.crafts)}</dd></div>
					<div class="result-row"><dt>Return on cost</dt><dd class={tone(result.roi)}>{fmt(result.roi)}{result.roi !== null ? '%' : ''}</dd></div>
					<div class="result-row"><dt>Cost / item</dt><dd>{fmt(result.unitCost)}</dd></div>
					<div class="result-row"><dt>Break-even selling price</dt><dd class="text-amber-300">{fmt(result.breakEven, 0)}</dd></div>
					{/if}
					<div class="result-row"><dt>{recipe.tradeable === false ? 'Saving vs replacement value' : 'Saving vs buying'}</dt><dd class={tone(result.selfUseSaving)}>{signed(result.selfUseSaving)}</dd></div>
				</dl>
				<p class="mt-3 text-xs text-surface-400">Self-use savings exclude the selling fee.</p>
				<hr class="my-4 border-surface-700" />
				<dl class="space-y-2 text-sm">
					<div class="result-row"><dt>Gold to spend now</dt><dd class="text-amber-300">{fmt(result.cashNeeded)}</dd></div>
					<div class="result-row"><dt>Crafting fee</dt><dd>{fmt(result.craftingGold)} <span class="text-xs text-surface-400">({result.goldPerCraft} each)</span></dd></div>
					<div class="result-row"><dt>Material purchases</dt><dd>{fmt(result.purchaseGold)}</dd></div>
					{#if recipe.tradeable !== false}
					<div class="result-row"><dt>Sale proceeds after fee</dt><dd>{fmt(result.revenue)}</dd></div>
					<div class="result-row"><dt>Gold after sale</dt><dd class={tone(result.cashAfterSale)}>{signed(result.cashAfterSale)}</dd></div>
					{/if}
					<div class="result-row"><dt>Leftover bought material value</dt><dd>{fmt(result.leftoverValue)}</dd></div>
					{#if recipe.tradeable !== false}<div class="result-row"><dt>Gain vs selling owned materials</dt><dd class={tone(result.vsSelling)}>{signed(result.vsSelling)}</dd></div>{/if}
				</dl>
				<p class="mt-3 text-xs text-surface-400">Purchases use the market bundle size shown. Leftovers are valued at market price.{#if recipe.tradeable !== false} Gain vs selling deducts the after-fee value of owned materials used.{/if}</p>
			</section>
			<section class="craft-card">
				<h2 class="mb-3 font-semibold">Recipe breakdown</h2>
				{#if recipe.batchSize}<p class="mb-3 text-xs text-surface-400">One workshop queue · up to {recipe.batchSize} crafts per timer.</p>{:else}<p class="mb-3 text-xs text-surface-400">Time assumes one craft per timer.</p>{/if}
				<dl class="mb-3 space-y-1 text-xs text-surface-300"><div class="result-row"><dt>Crafting time · {result.batches} batch{result.batches === 1 ? '' : 'es'}</dt><dd>{fmt(result.minutes)} min</dd></div>{#if recipe.tradeable !== false}<div class="result-row"><dt>Profit / queue-hour</dt><dd class={tone(result.profitPerHour)}>{signed(result.profitPerHour)}</dd></div>{/if}<div class="result-row"><dt>Action energy</dt><dd>{fmt(Math.floor(recipe.energy * (100 - manor.energy) / 100) * result.crafts, 0)}</dd></div></dl>
				{#if recipe.silver}<p class="mb-2 text-xs text-surface-400">Silver fee: {fmt(recipe.silver * result.crafts, 0)} · not converted to gold.</p>{/if}
				{#if craft.settings.greatSuccess > 0}<p class="mb-3 text-xs text-amber-300">Expected output: {fmt(result.expectedOutput)} · Guaranteed: {fmt(result.output, 0)}</p>{/if}
				{#each result.lines as line (line.material.id)}
					<div class="border-t border-surface-700 py-2"><p class="text-sm">{line.material.name}</p><p class="mt-1 text-xs text-surface-300">Need {fmt(line.needed, 0)} · Use owned {fmt(line.used, 0)} · Buy {fmt(line.purchased, 0)}</p>{#if line.leftover}<p class="text-xs text-surface-400">{fmt(line.leftover, 0)} bought materials left over</p>{/if}</div>
				{/each}
				{#if recipe.tradeable !== false}<p class="mt-2 text-xs text-surface-400">Market fee: 5%, rounded up per selling unit. {market.prices[recipe.product.id] !== undefined ? `${saleFee(market.prices[recipe.product.id])} gold per item.` : ''} Refunded listing deposits are excluded.</p>{/if}
				<a href={recipe.source} target="_blank" rel="noopener noreferrer" class="mt-3 inline-block text-xs text-surface-300 underline hover:text-surface-50">View recipe on Lost Ark Codex ↗</a>
			</section>
		</aside>
	</div>
</div>

<style>
	.craft-card { border: 1px solid var(--color-surface-800); border-radius: 2px; background: var(--color-surface-900); padding: 1rem; }
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
