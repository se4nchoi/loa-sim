<script lang="ts">
	import { CATEGORIES, RECIPES, type CraftRecipe } from './data';
	import MenuPicker from '$lib/upgrade-planner/sim/MenuPicker.svelte';
	import { iconUrl, GRADE_GRADIENTS } from '$lib/upgrade-planner/icons';
	import { btn, btnAccent } from '$lib/upgrade-planner/sim/ui';
	import { recipeVariantLabel } from './recipe-labels';
	let { recipeId = $bindable(), favorites = $bindable() }: { recipeId: string; favorites: string[] } = $props();
	const recipe = $derived(RECIPES.find((r) => r.id === recipeId) ?? RECIPES[0]);
	const category = $derived(recipe.category ?? 'Special');
	const products = $derived([...new Map(RECIPES.filter((r) => r.category === category).map((r) => [r.product.id, r])).values()]);
	const options = $derived(products.map((r) => ({ value: r.product.id, label: r.product.name, iconUrl: iconUrl(r.product.icon), title: r.product.name })));
	const variants = $derived(RECIPES.filter((r) => r.product.id === recipe.product.id));
	const saved = $derived(favorites.map((id) => RECIPES.find((r) => r.id === id)).filter((r): r is CraftRecipe => !!r));
	const remembered = new Map<string, string>();
	function select(id: string) { recipeId = id; const r = RECIPES.find((r) => r.id === id); if (r?.category) remembered.set(r.category, id); }
	function tab(name: string) { remembered.set(category, recipe.id); select(remembered.get(name) ?? RECIPES.find((r) => r.category === name)!.id); }
	function favorite() { favorites = favorites.includes(recipe.id) ? favorites.filter((id) => id !== recipe.id) : [...favorites, recipe.id]; }
</script>

<div class="mb-4 flex max-w-full gap-1 overflow-x-auto border-b border-surface-700 pb-2" role="group" aria-label="Crafting categories">
	{#each CATEGORIES as name}<button type="button" class={`${category === name ? btnAccent : btn} shrink-0`} aria-pressed={category === name} onclick={() => tab(name)}>{name === 'Farm (Bound)' ? 'Farm' : name}</button>{/each}
</div>
<div class="flex min-w-0 items-center gap-2">
	<img src={iconUrl(recipe.product.icon)} alt="" class="size-10 shrink-0 rounded-xs border border-white/15" style:background={GRADE_GRADIENTS[recipe.product.grade]} />
	<div class="min-w-0 flex-1"><MenuPicker full fitMenu alwaysSearch value={recipe.product.id} {options} label="Crafting recipe" onpick={(id) => select(RECIPES.find((r) => r.product.id === id && r.category === category)!.id)}>
		{#snippet trigger()}<span class="min-w-0 truncate" title={recipe.product.name}>{recipe.product.name}</span>{/snippet}
	</MenuPicker></div>
	<button type="button" class={`${btn} h-9 shrink-0 text-lg ${favorites.includes(recipe.id) ? 'text-amber-300' : 'text-surface-400'}`} aria-label={favorites.includes(recipe.id) ? 'Remove recipe from favorites' : 'Favorite recipe'} aria-pressed={favorites.includes(recipe.id)} onclick={favorite}>{favorites.includes(recipe.id) ? '★' : '☆'}</button>
</div>
{#if variants.length > 1}<div class="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Recipe variants">
	{#each variants as variant}<button type="button" class={variant.id === recipe.id ? btnAccent : btn} aria-pressed={variant.id === recipe.id} title={variant.ingredients.map((i) => `${i.material.name} ×${i.quantity}`).join(', ')} onclick={() => select(variant.id)}>{recipeVariantLabel(variant)}</button>{/each}
</div>{/if}
<div class="mt-4 border-t border-surface-700 pt-3" aria-label="Favorite recipes">
	<h2 class="mb-2 text-xs font-semibold text-surface-300">Favorites</h2>
	{#if saved.length}<div class="flex flex-wrap gap-1.5">{#each saved as item}<button type="button" class={`${item.id === recipe.id ? btnAccent : btn} min-w-0 max-w-full`} aria-pressed={item.id === recipe.id} title={`${item.product.name} · ${recipeVariantLabel(item)}`} onclick={() => select(item.id)}><span class="truncate">{item.product.name}{#if RECIPES.filter((r) => r.product.id === item.product.id).length > 1} · {recipeVariantLabel(item)}{/if}</span></button>{/each}</div>
	{:else}<p class="text-xs text-surface-500">Star a recipe to keep it here.</p>{/if}
</div>
