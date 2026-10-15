import type { CraftRecipe } from './data';

export interface CraftSettings {
	crafts: number;
	costReduction: number;
	timeReduction: number;
	/** Actual probability of double output, not the stronghold's relative success bonus. */
	greatSuccess: number;
}

const percent = (n: number) => Math.min(100, Math.max(0, Number.isFinite(n) ? n : 0));
const quantity = (n: number) => Math.max(0, Math.floor(Number.isFinite(n) ? n : 0));
const validPrice = (n: number | undefined): n is number => n !== undefined && Number.isFinite(n) && n >= 0;

/** The fee applies to each market listing unit; 1-gold listings are exempt. */
export const saleFee = (price: number) => price <= 1 ? 0 : Math.ceil(price / 20);

/** Keep regular-output estimates independent of an optional user-supplied proc chance. */
export function calculateCraftScenarios(recipe: CraftRecipe, settings: CraftSettings, prices: Record<string, number>, owned: Record<string, number>) {
	return {
		baseline: calculateCraft(recipe, { ...settings, greatSuccess: 0 }, prices, owned),
		expected: percent(settings.greatSuccess) > 0 ? calculateCraft(recipe, settings, prices, owned) : null
	};
}

export function calculateCraft(recipe: CraftRecipe, settings: CraftSettings, prices: Record<string, number>, owned: Record<string, number>) {
	const crafts = Math.max(1, quantity(settings.crafts));
	// Round each craft's gold fee, before multiplying by the number of crafts.
	const goldPerCraft = Math.floor(recipe.gold * (100 - percent(settings.costReduction)) / 100 + 1e-9);
	const craftingGold = goldPerCraft * crafts;
	const output = recipe.output * crafts;
	const expectedOutput = output * (1 + percent(settings.greatSuccess) / 100);
	const batches = Math.ceil(crafts / (recipe.batchSize ?? 1));
	const minutes = recipe.minutes * batches * (100 - Math.min(99, percent(settings.timeReduction))) / 100;
	const lines = recipe.ingredients.map(({ material, quantity: perCraft }) => {
		const needed = perCraft * crafts;
		const available = quantity(owned[material.id] ?? 0);
		const used = Math.min(available, needed);
		const shortage = needed - used;
		const purchased = Math.ceil(shortage / material.bundle) * material.bundle;
		const price = prices[material.id];
		const unitPrice = validPrice(price) ? price / material.bundle : null;
		return { material, perCraft, needed, available, used, shortage, purchased, leftover: purchased - shortage,
			purchaseGold: shortage === 0 ? 0 : unitPrice === null ? null : purchased * unitPrice,
			value: unitPrice === null ? null : needed * unitPrice,
			ownedSaleValue: used === 0 ? 0 : !validPrice(price) ? null : used / material.bundle * (price - saleFee(price))
		};
	});
	const allPrices = lines.every((line) => line.value !== null);
	const purchasesPriced = lines.every((line) => line.purchaseGold !== null);
	const materialValue = allPrices ? lines.reduce((sum, line) => sum + line.value!, 0) : null;
	const purchaseGold = purchasesPriced ? lines.reduce((sum, line) => sum + line.purchaseGold!, 0) : null;
	const cashNeeded = purchaseGold === null ? null : craftingGold + purchaseGold;
	const totalCost = materialValue === null ? null : craftingGold + materialValue;
	const sellPrice = prices[recipe.product.id];
	const revenue = recipe.tradeable !== false && validPrice(sellPrice) ? expectedOutput * (sellPrice - saleFee(sellPrice)) : null;
	// Owned materials are valued as materials, rather than counted as free profit.
	const profit = revenue === null || totalCost === null ? null : revenue - totalCost;
	const cashAfterSale = revenue === null || cashNeeded === null ? null : revenue - cashNeeded;
	const leftoverValue = allPrices ? lines.reduce((sum, line) => sum + line.leftover * prices[line.material.id] / line.material.bundle, 0) : null;
	const ownedSaleValue = lines.every((line) => line.ownedSaleValue !== null) ? lines.reduce((sum, line) => sum + line.ownedSaleValue!, 0) : null;
	const vsSelling = cashAfterSale === null || ownedSaleValue === null || leftoverValue === null ? null : cashAfterSale + leftoverValue - ownedSaleValue;
	const breakEven = totalCost === null || recipe.tradeable === false ? null : minimumSellPrice(totalCost / expectedOutput);
	return { crafts, batches, goldPerCraft, craftingGold, output, expectedOutput, minutes, lines, materialValue, purchaseGold, cashNeeded, totalCost, revenue, profit, cashAfterSale, leftoverValue, vsSelling, breakEven,
		roi: profit === null || !totalCost ? null : profit / totalCost * 100,
		profitPerHour: profit === null || minutes <= 0 ? null : profit / (minutes / 60),
		unitCost: totalCost === null ? null : totalCost / expectedOutput,
		selfUseSaving: totalCost === null || !validPrice(sellPrice) ? null : expectedOutput * sellPrice - totalCost,
		maxOwnedCrafts: Math.min(...recipe.ingredients.map(({ material, quantity: count }) => Math.floor(quantity(owned[material.id] ?? 0) / count))),
		missing: [...lines.filter((line) => line.value === null).map((line) => line.material.name), ...(recipe.tradeable !== false && !validPrice(sellPrice) ? [recipe.product.name] : [])]
	};
}

/** Smallest whole-gold listing price whose after-fee proceeds cover the unit cost. */
export function minimumSellPrice(unitCost: number): number {
	let lo = 0;
	let hi = Math.max(1, Math.ceil(unitCost / 0.95) + 2);
	while (lo < hi) {
		const mid = Math.floor((lo + hi) / 2);
		if (mid - saleFee(mid) >= unitCost) hi = mid;
		else lo = mid + 1;
	}
	return lo;
}
