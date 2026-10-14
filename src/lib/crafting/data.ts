import catalog from './catalog.json';

export interface CraftMaterial {
	id: string;
	name: string;
	icon: string;
	grade: number;
	bundle: number;
}

export interface CraftRecipe {
	id: string;
	product: CraftMaterial;
	path: string;
	output: number;
	gold: number;
	minutes: number;
	energy: number;
	ingredients: { material: CraftMaterial; quantity: number }[];
	source: string;
	category?: string;
	manorCategory?: string;
	/** Workshop crafts completed together in one timer. Confirmed as 10 for Abidos. */
	batchSize?: number;
	tradeable?: boolean;
	silver?: number;
}

// Names, ids and icons from the game's item tables (cache/maxroll-items.json).
// Tradable workshop recipes, not the bound stronghold-farm chests.
const material = (id: number, name: string, icon: string, grade: number, bundle = 100): CraftMaterial =>
	({ id: String(id), name, icon, grade, bundle });

export const PRODUCTS = [
	material(6861012, 'Abidos Fusion Material', 'Use_12_86', 2, 1),
	material(6861013, 'Superior Abidos Fusion Material', 'Use_13_252', 3, 1)
];

export const PATHS = [
	{ name: 'Foraging', code: 0, materials: [material(6882101, 'Wild Flower', 'Use_8_46', 0), material(6882104, 'Shy Wild Flower', 'Use_4_14', 1), material(6882109, 'Abidos Wild Flower', 'LifeLevel_02_47', 2)] },
	{ name: 'Logging', code: 1, materials: [material(6882301, 'Timber', 'Use_3_252', 0), material(6882304, 'Tender Timber', 'Use_3_253', 1), material(6884308, 'Abidos Timber', 'LifeLevel_02_48', 2)] },
	{ name: 'Mining', code: 2, materials: [material(6882401, 'Iron Ore', 'Use_3_243', 0), material(6882404, 'Heavy Iron Ore', 'Use_3_239', 1), material(6884408, 'Abidos Iron Ore', 'LifeLevel_02_49', 2)] },
	{ name: 'Hunting', code: 3, materials: [material(6882501, 'Thick Raw Meat', 'Use_2_192', 0), material(6882504, 'Treated Meat', 'Use_2_196', 1), material(6885509, 'Abidos Thick Raw Meat', 'LifeLevel_02_51', 2)] },
	{ name: 'Fishing', code: 4, materials: [material(6882601, 'Fish', 'Use_1_142', 0), material(6882604, 'Redflesh Fish', 'Use_4_49', 1), material(6885609, 'Abidos Solar Carp', 'LifeLevel_02_53', 2)] },
	{ name: 'Excavating', code: 5, materials: [material(6882701, 'Ancient Relic', 'Use_9_3', 0), material(6882704, 'Rare Relic', 'Use_9_4', 1), material(6885709, 'Abidos Relic', 'LifeLevel_02_55', 2)] }
];

// Recipe costs, quantities, time and action energy verified against each Lost Ark Codex recipe.
export const FUSION_RECIPES: CraftRecipe[] = PRODUCTS.flatMap((product, tier) => PATHS.map((path) => ({
	id: `${product.id}:${path.name.toLowerCase()}`,
	product,
	path: path.name,
	output: 10,
	gold: tier ? 520 : 400,
	minutes: tier ? 75 : 60,
	energy: tier ? 360 : 288,
	ingredients: path.materials.map((material, i) => ({ material, quantity: (tier ? [112, 59, 43] : [86, 45, 33])[i] })),
	source: `https://lostarkcodex.com/us/recipe/${106861012 + path.code * 100 + tier}/`,
	category: 'Special', tradeable: true, silver: 0, batchSize: 10
})));

export const RECIPES: CraftRecipe[] = [...FUSION_RECIPES, ...catalog.filter((r) => !PRODUCTS.some((product) => product.id === r.product.id))];
export const CATEGORIES = ['Battle Item', 'Cooking', 'Structure', 'Tools', 'Special', 'Farm (Bound)'];
