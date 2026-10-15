import { RECIPES } from './data';
import type { CraftSettings } from './calculate';
import { defaultManor, MANOR_EQUIPMENT, MANOR_SCOPES, type ManorSetup, type ManorScope } from './manor';

export type CraftRegion = 'NA' | 'CE';
export interface CraftMarket { owned: Record<string, number>; prices: Record<string, number> }
export interface CraftSave {
	region: CraftRegion;
	recipeId: string;
	settings: CraftSettings;
	markets: Record<CraftRegion, CraftMarket>;
	favorites: string[];
	favoritesOnly: boolean;
	manor: ManorSetup;
}
const KEY = 'loa-sim:crafting:v1';
export const defaultCraftSave = (): CraftSave => ({ region: 'NA', recipeId: '',
	settings: { crafts: 1, costReduction: 0, timeReduction: 0, greatSuccess: 0 },
	markets: { NA: { owned: {}, prices: {} }, CE: { owned: {}, prices: {} } }, favorites: [], favoritesOnly: false, manor: defaultManor() });

function numbers(value: unknown, whole = false): Record<string, number> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	return Object.fromEntries(Object.entries(value).filter(([, n]) => typeof n === 'number' && Number.isFinite(n) && n >= 0)
		.map(([key, n]) => [key, whole ? Math.floor(n as number) : n]));
}

export function loadCraftSave(): CraftSave {
	const state = defaultCraftSave();
	try {
		const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
		if (!raw || typeof raw !== 'object') return state;
		if (raw.region === 'NA' || raw.region === 'CE') state.region = raw.region;
		if (RECIPES.some((r) => r.id === raw.recipeId)) state.recipeId = raw.recipeId;
		for (const key of ['crafts', 'costReduction', 'timeReduction', 'greatSuccess'] as const) {
			const value = raw.settings?.[key];
			if (typeof value === 'number' && Number.isFinite(value)) state.settings[key] = key === 'crafts' ? Math.max(1, Math.min(100000, Math.floor(value))) : Math.max(0, Math.min(key === 'timeReduction' ? 99 : 100, value));
		}
		for (const region of ['NA', 'CE'] as const) state.markets[region] = { owned: numbers(raw.markets?.[region]?.owned, true), prices: numbers(raw.markets?.[region]?.prices) };
		// Region selection was removed: preserve the previously selected inventory as the single browser inventory.
		state.markets.NA = state.markets[state.region];
		state.region = 'NA';
		state.favorites = Array.isArray(raw.favorites) ? [...new Set<string>(raw.favorites.filter((id: unknown) => typeof id === 'string' && RECIPES.some((r) => r.id === id)))] : [];
		// A displayed product remembers its route, rather than taking a slot for every variant.
		const products = new Set<string>();
		state.favorites = state.favorites.filter(id => {
			const product = RECIPES.find(r => r.id === id)!.product.id;
			if (products.has(product)) return false;
			products.add(product);
			return true;
		});
		const selectedProduct = RECIPES.find(r => r.id === state.recipeId)?.product.id;
		if (selectedProduct && state.favorites.some(id => RECIPES.find(r => r.id === id)?.product.id === selectedProduct)) {
			state.favorites = state.favorites.map(id => RECIPES.find(r => r.id === id)?.product.id === selectedProduct ? state.recipeId : id);
		} else state.recipeId = state.favorites[0] ?? '';
		state.favoritesOnly = raw.favoritesOnly === true;
		if (raw.manor && typeof raw.manor === 'object') {
			const valid = (id: unknown) => typeof id === 'string' && MANOR_EQUIPMENT.some((e) => e.id === id);
			const bounded = (value: unknown, max: number, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
			state.manor.slots = Math.max(1, Math.floor(bounded(raw.manor.slots, 4, 3)));
			for (const kind of ['structures', 'outfits'] as const) {
				const entries: unknown[] = Array.isArray(raw.manor[kind]) ? raw.manor[kind] : [];
				const seen = new Set<string>();
				const npcs = new Set<string>();
				state.manor[kind] = Array.from({ length: Math.max(state.manor.slots, Math.min(4, entries.length)) }, (_, i) => {
					const item = MANOR_EQUIPMENT.find((e) => e.id === entries[i] && e.kind === (kind === 'structures' ? 'structure' : 'outfit'));
					if (!item || seen.has(item.id) || (item.npc && npcs.has(item.npc))) return '';
					seen.add(item.id);
					if (item.npc) npcs.add(item.npc);
					return item.id;
				});
			}
			state.manor.owned = Array.isArray(raw.manor.owned) ? [...new Set<string>(raw.manor.owned.filter(valid))] : [];
			for (const key of ['baseCost', 'baseTime', 'baseEnergy'] as const) state.manor[key] = bounded(raw.manor[key], 30);
			if (Array.isArray(raw.manor.extraEffects)) state.manor.extraEffects = raw.manor.extraEffects.slice(0, 20)
				.filter((effect: unknown) => effect && typeof effect === 'object' && MANOR_SCOPES.includes((effect as { scope: ManorScope }).scope))
				.map((effect: Record<string, unknown>) => ({ name: typeof effect.name === 'string' ? effect.name.slice(0, 80) : '', scope: effect.scope as ManorScope,
					cost: bounded(effect.cost, 30), time: bounded(effect.time, 30), energy: bounded(effect.energy, 30), success: bounded(effect.success, 30) }));
		} else {
			state.manor.baseCost = Math.min(30, state.settings.costReduction);
			state.manor.baseTime = Math.min(30, state.settings.timeReduction);
		}
	} catch { /* Empty or unavailable browser storage. */ }
	return state;
}

export function saveCraftSave(state: CraftSave): boolean {
	try {
		localStorage.setItem(KEY, JSON.stringify(state));
		return true;
	} catch {
		return false;
	}
}
