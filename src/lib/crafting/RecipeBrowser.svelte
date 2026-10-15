<script lang="ts">
	import { CATEGORIES, RECIPES, type CraftRecipe } from './data';
	import { iconUrl, GRADE_GRADIENTS } from '$lib/upgrade-planner/icons';
	import { btn, btnAccent } from '$lib/upgrade-planner/sim/ui';
	import { recipeVariantLabel } from './recipe-labels';
	import { itemGrade } from './item-grade';
	let { recipeId = $bindable(), favorites = $bindable() }: { recipeId: string; favorites: string[] } = $props();
	let query = $state('');
	let category = $state('');
	const recipe = $derived(RECIPES.find(r => r.id === recipeId));
	const products = [...new Map(RECIPES.map(r => [r.product.id, r])).values()];
	const matches = $derived(query.trim() ? products.filter(r =>
		(!category || r.category === category) && `${r.product.name} ${r.category} ${itemGrade(r.product.grade).name}`.toLowerCase().includes(query.trim().toLowerCase())) : []);
	const saved = $derived(favorites.map(id => RECIPES.find(r => r.id === id)).filter((r): r is CraftRecipe => !!r));
	const variants = $derived(recipe ? RECIPES.filter(r => r.product.id === recipe.product.id) : []);
	function select(id: string) {
		const item = RECIPES.find(r => r.id === id);
		if (!item) return;
		const existing = saved.find(r => r.product.id === item.product.id);
		favorites = existing ? favorites.map(value => value === existing.id ? id : value) : [...favorites, id];
		recipeId = id;
	}
	function add(item: CraftRecipe) {
		select(saved.find(r => r.product.id === item.product.id)?.id ?? item.id);
		query = '';
	}
	function hide(item: CraftRecipe) {
		favorites = favorites.filter(id => id !== item.id);
		if (recipeId === item.id) recipeId = favorites[0] ?? '';
	}
</script>

<div class="flex flex-wrap items-center justify-between gap-2">
	<h2 class="font-semibold">Your crafting list</h2>
	<span class="text-xs text-surface-400">{saved.length} item{saved.length === 1 ? '' : 's'} shown</span>
</div>
<div class="mt-3 flex flex-wrap gap-2">
	<label class="min-w-0 flex-1 basis-56"><span class="sr-only">Search recipes to add</span><input type="search" bind:value={query} placeholder="Search for an item to add…" class="h-10 w-full rounded-xs border border-surface-600 bg-surface-950 px-3 text-sm text-surface-100 outline-none focus:border-yellow-400" /></label>
	<label><span class="sr-only">Search category</span><select bind:value={category} class="h-10 max-w-full rounded-xs border border-surface-600 bg-surface-950 px-2 text-sm text-surface-200"><option value="">All categories</option>{#each CATEGORIES as name}<option value={name}>{name}</option>{/each}</select></label>
</div>
{#if query.trim()}
	<div class="mt-2 max-h-80 overflow-y-auto rounded-xs border border-surface-700 bg-surface-950" aria-label="Recipe search results">
		{#each matches.slice(0, 40) as item (item.product.id)}
			{@const added = saved.some(r => r.product.id === item.product.id)}
			<button type="button" class="flex w-full items-center gap-3 border-b border-surface-800 px-3 py-2 text-left hover:bg-surface-800" aria-label={`${added ? 'Show' : 'Add'} ${item.product.name}`} onclick={() => add(item)}>
				<img src={iconUrl(item.product.icon)} alt="" class="size-9 shrink-0 rounded-xs border border-white/15" style:background={GRADE_GRADIENTS[item.product.grade]} />
				<span class="min-w-0 flex-1"><span class="block text-sm" style:color={itemGrade(item.product.grade).color}>{item.product.name}</span><span class="text-xs text-surface-400">{itemGrade(item.product.grade).name} · {item.category}</span></span>
				<span class="flex shrink-0 items-center gap-1 text-xs" style:color="#facc15"><svg class="size-5" viewBox="0 0 24 24" fill={added ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" /></svg>{added ? 'Shown' : 'Add'}</span>
			</button>
		{:else}<p class="px-3 py-4 text-sm text-surface-400">No matching recipes. Try another item name or category.</p>{/each}
		{#if matches.length > 40}<p class="px-3 py-2 text-xs text-surface-400">Showing 40 of {matches.length} items. Keep typing to narrow the results.</p>{/if}
	</div>
{/if}
{#if saved.length}
	<div class="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3" aria-label="Displayed crafting recipes">
		{#each saved as item (item.product.id)}
			<div class="flex min-w-0 items-center rounded-xs border {recipeId === item.id ? 'border-yellow-400/70 bg-yellow-400/5' : 'border-surface-700 bg-surface-950'}">
				<button type="button" class="flex min-w-0 flex-1 items-center gap-2 p-2 text-left" aria-label={`Select ${item.product.name}`} aria-pressed={recipeId === item.id} onclick={() => select(item.id)}>
					<img src={iconUrl(item.product.icon)} alt="" class="size-9 shrink-0 rounded-xs border border-white/15" style:background={GRADE_GRADIENTS[item.product.grade]} />
					<span class="min-w-0"><span class="block text-sm leading-tight" style:color={itemGrade(item.product.grade).color}>{item.product.name}</span><span class="text-[11px] text-surface-400">{item.category}</span></span>
				</button>
				<button type="button" class="shrink-0 rounded-xs p-2 hover:bg-yellow-400/10" style:color="#facc15" aria-label={`Remove ${item.product.name} from crafting list`} title="Remove from crafting list" onclick={() => hide(item)}><svg class="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
			</div>
		{/each}
	</div>
{:else}
	<div class="mt-4 rounded-xs border border-dashed border-surface-600 px-4 py-6 text-center">
		<p class="text-sm text-surface-200">Add the items you craft.</p>
		<p class="mt-1 text-xs text-surface-400">Search above, then use the yellow star to add an item. Only your chosen recipes appear here.</p>
	</div>
{/if}
{#if recipe && saved.length && variants.length > 1}
	<div class="mt-4 flex flex-wrap items-center gap-1.5 border-t border-surface-700 pt-3" role="group" aria-label="Recipe variants">{#each variants as variant}<button type="button" class={variant.id === recipe.id ? btnAccent : btn} aria-pressed={variant.id === recipe.id} title={variant.ingredients.map(i => `${i.material.name} ×${i.quantity}`).join(', ')} onclick={() => select(variant.id)}>{recipeVariantLabel(variant)}</button>{/each}</div>
{/if}
