export type CraftCategory = 'Special' | 'Battle Item' | 'Cooking' | 'Tools' | 'Structure' | 'Farm (Bound)';
export type ManorScope = 'General' | CraftCategory;
export interface ManorEffect { scope: ManorScope; cost?: number; time?: number; success?: number; energy?: number }
export interface ManorEquip { id: string; name: string; kind: 'structure' | 'outfit'; icon?: string; npc?: string; acquisition: string; effects: ManorEffect[]; source: string }
export interface ManorSetup {
	structures: string[];
	outfits: string[];
	owned: string[];
	slots: number;
	baseCost: number;
	baseTime: number;
	baseEnergy: number;
}
export const defaultManor = (): ManorSetup => ({ structures: ['', '', ''], outfits: ['', '', ''], owned: [], slots: 3, baseCost: 0, baseTime: 0, baseEnergy: 0 });

// Structure effects below are visible in the user's in-game Manor screenshot.
// Acquisition comes from the corresponding game item. Outfit effects are verified on Codex.
export const MANOR_EQUIPMENT: ManorEquip[] = [
	{ id: 'card-flipping', name: 'Card-Flipping Game', kind: 'structure', icon: 'TownPlacement_33', acquisition: 'Cookie Exchange Merchant · Totocookie', effects: [{ scope: 'General', cost: 2 }], source: 'https://lostarkcodex.com/us/item/78500229/' },
	{ id: 'acrobat', name: "Acrobat’s Waiting Room", kind: 'structure', acquisition: 'Lost Ark Shop · structure effect', effects: [{ scope: 'Special', cost: 4, time: 2 }], source: 'User-provided in-game Manor screenshot' },
	{ id: 'glass-sheep', name: 'Glass Sheep', kind: 'structure', icon: 'TownPlacement_37', acquisition: 'Collectible · Nukman’s Illusion Stone', effects: [{ scope: 'Special', cost: 3, time: 1 }], source: 'https://lostarkcodex.com/us/item/78500204/' },
	{ id: 'payla-vern', name: 'Vern Ball', npc: 'Payla', kind: 'outfit', icon: 'fam_dress_01_25', acquisition: 'Wardrobe · Payla outfit', effects: [{ scope: 'Special', cost: 2, success: 4 }], source: 'https://lostarkcodex.com/us/townnpcsuit/38002/' },
	{ id: 'thirain-heir', name: 'The Irresistible Heir', npc: 'Thirain', kind: 'outfit', icon: 'fam_dress_01_100', acquisition: 'Wardrobe · Thirain outfit', effects: [{ scope: 'General', cost: 1, time: 2 }], source: 'https://lostarkcodex.com/us/townnpcsuit/20001/' },
	{ id: 'nia-basic', name: 'Basic Outfit', npc: 'Nia', kind: 'outfit', icon: 'fam_dress_01_114', acquisition: 'Rapport · Nia’s basic outfit', effects: [{ scope: 'Special', cost: 1 }], source: 'https://lostarkcodex.com/us/townnpcsuit/1061/' },
	{ id: 'vivian-lady', name: 'The Fair Lady', npc: 'Vivian', kind: 'outfit', icon: 'fam_dress_01_140', acquisition: 'Wardrobe · Vivian outfit', effects: [{ scope: 'Cooking', cost: 4 }, { scope: 'Tools', cost: 2 }], source: 'https://lostarkcodex.com/us/townnpcsuit/15001/' }
];

export const equipLabel = (item: ManorEquip) => item.npc ? `${item.npc} · ${item.name}` : item.name;
export const effectLabel = (effect: ManorEffect) => [effect.cost ? `Cost −${effect.cost}%` : '', effect.time ? `Time −${effect.time}%` : '', effect.energy ? `Energy −${effect.energy}%` : '', effect.success ? `Great success +${effect.success}%` : ''].filter(Boolean).join(' · ');
export function manorTotals(setup: ManorSetup, category: string) {
	const equipped = [...setup.structures.slice(0, setup.slots), ...setup.outfits.slice(0, setup.slots)];
	const general = { cost: setup.baseCost, time: setup.baseTime, energy: setup.baseEnergy, success: 0 };
	const specific = { cost: 0, time: 0, energy: 0, success: 0 };
	for (const id of new Set(equipped)) {
		for (const effect of MANOR_EQUIPMENT.find((e) => e.id === id)?.effects ?? []) {
			const target = effect.scope === 'General' ? general : effect.scope === category || (category === 'Farm (Bound)' && effect.scope === 'Special') ? specific : null;
			if (!target) continue;
			for (const key of ['cost', 'time', 'energy', 'success'] as const) target[key] += effect[key] ?? 0;
		}
	}
	for (const key of ['cost', 'time', 'energy', 'success'] as const) {
		general[key] = Math.max(0, Math.min(30, general[key]));
		specific[key] = Math.max(0, Math.min(10, specific[key]));
	}
	return { general, specific, cost: general.cost + specific.cost, time: general.time + specific.time, energy: general.energy + specific.energy, successBonus: general.success + specific.success };
}

function combinations(items: ManorEquip[], slots: number): string[][] {
	const result: string[][] = [[]];
	for (const item of items) for (const prior of [...result]) {
		if (prior.length >= slots || (item.npc && prior.some((id) => MANOR_EQUIPMENT.find((e) => e.id === id)?.npc === item.npc))) continue;
		result.push([...prior, item.id]);
	}
	return result;
}

/** Compare only verified effects, respecting available slots, ownership, category caps, and NPC uniqueness. */
export function suggestManor(setup: ManorSetup, category: string, goal: 'cost' | 'time', ownedOnly: boolean) {
	const options = MANOR_EQUIPMENT.filter((e) => (!ownedOnly || setup.owned.includes(e.id)) && e.effects.some((effect) => effect.scope === 'General' || effect.scope === category || (category === 'Farm (Bound)' && effect.scope === 'Special')));
	let best = { ...setup, structures: [] as string[], outfits: [] as string[] };
	let bestScore = -1;
	for (const structures of combinations(options.filter((e) => e.kind === 'structure'), setup.slots)) {
		for (const outfits of combinations(options.filter((e) => e.kind === 'outfit'), setup.slots)) {
			const candidate = { ...setup, structures, outfits };
			const totals = manorTotals(candidate, category);
			const score = totals[goal] * 10000 + totals[goal === 'cost' ? 'time' : 'cost'] * 100 + totals.successBonus - (structures.length + outfits.length) / 100;
			if (score > bestScore) { best = candidate; bestScore = score; }
		}
	}
	return { ...best, structures: Array.from({ length: setup.slots }, (_, i) => best.structures[i] ?? ''), outfits: Array.from({ length: setup.slots }, (_, i) => best.outfits[i] ?? '') };
}
