import { RECIPES, type CraftRecipe } from './data';

/** Keep ingredients in the breakdown; variant names must stay short enough for chips. */
export function recipeVariantLabel(recipe: CraftRecipe): string {
	const variants = RECIPES.filter((r) => r.product.id === recipe.product.id);
	if (variants.filter((r) => r.path === recipe.path).length === 1 && recipe.path !== recipe.category) return recipe.path;
	return `Recipe ${variants.findIndex((r) => r.id === recipe.id) + 1}`;
}
