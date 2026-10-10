import { BRACER_GRADES, nextBracer } from './bracer';
import { accessoryPriceKey, accessorySetKey, accessorySetUpgrades } from './accessory-sets';
import { roleOf } from './roles';
import { BRACER_TAPS } from './bracer-cost-data';
import { HONING_SLOTS } from './honing-data';
import { HONING_SLOT_LABELS } from './honing-upgrades';
import { autoHoningCosts, honingCost, materialName, tapsFor, type MaterialOwned, type MaterialPrices } from './honing-cost';
import type { HoningTap } from './honing-cost-data';
import { ACCESSORY_SLOTS, gemParts, isOtherLine, simulate, type DpsLine, type SimState } from './simulate';
import { skinParts } from './skins';
import type { Loadout } from './types';
import { engravingName, type Upgrade } from './upgrades';
import { formatLineValue } from './tables';
import { qualityCost } from './quality';

export interface BudgetChange {
	key: string;
	title: string;
	detail: string;
	section: string;
	tap?: HoningTap;
	sourceKey?: string;
	books?: { id: number; count: number };
	fixed?: number;
	status?: 'rng' | 'excluded' | 'unavailable';
	rolls?: { name: string; tier: string; value?: string }[];
}
const different = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
const quoteKey = (kind: string, from: unknown, to: unknown) => `budget:${kind}:${JSON.stringify([from, to])}`;
const names = { neck: 'Necklace', ear1: 'Earring 1', ear2: 'Earring 2', finger1: 'Ring 1', finger2: 'Ring 2' };

/** The final edit state compared with the imported character, independent of undo history or CP gain. */
export function budgetChanges(loadout: Loadout, base: SimState, target: SimState): BudgetChange[] {
	const rows: BudgetChange[] = [];
	const add = (section: string, title: string, from: unknown, to: unknown, extra: Partial<BudgetChange> = {}) =>
		rows.push({ section, title, key: quoteKey(title, from, to), detail: '', ...extra });
	for (const slot of HONING_SLOTS) {
		const from = base.gear[slot], to = target.gear[slot];
		if (!from || !to) continue;
		const name = HONING_SLOT_LABELS[slot];
		if ((from.set ?? 'serca') !== (to.set ?? 'serca')) {
			add('Equipment', `${name} equipment inheritance`, from, to, { status: 'unavailable', detail: 'Inheritance cost is not calculated.' });
		} else if (to.honing > from.honing) {
			for (let level = from.honing + 1; level <= to.honing; level++) {
				const tap = tapsFor(to.set ?? 'serca', slot, level);
				add('Equipment', `${name} +${level - 1} → +${level}`, level - 1, level, { tap, status: tap ? undefined : 'unavailable' });
			}
		} else if (to.honing < from.honing) add('Equipment', `${name} +${from.honing} → +${to.honing}`, from.honing, to.honing, { status: 'excluded' });
		if (to.advanced !== from.advanced) add('Equipment', `${name} advanced honing ${from.advanced} → ${to.advanced}`, from.advanced, to.advanced, { status: to.advanced > from.advanced ? 'unavailable' : 'excluded', detail: 'Advanced honing cost is not calculated.' });
	}
	if (different(base.bracer, target.bracer)) {
		const to = target.bracer;
		if (!to || (base.bracer && (to.honing < base.bracer.honing || BRACER_GRADES.indexOf(to.grade) < BRACER_GRADES.indexOf(base.bracer.grade)))) {
			add('Equipment', 'Bracer reduction', base.bracer, to, { status: 'excluded' });
		} else {
			let from = base.bracer;
			for (let n = 0; n < 30 && different(from, to); n++) {
				const next = nextBracer(from);
				if (!next || !to || next.honing > to.honing) break;
				if (!from) add('Equipment', 'Acquire Epic bracer +0', null, next, { fixed: 0, detail: 'First bracer is free.' });
				else if (next.grade !== from.grade) add('Equipment', `Bracer limit break: ${from.grade} → ${next.grade}`, from, next, { status: 'unavailable', detail: 'Limit-break cost is not calculated.' });
				else add('Equipment', `Bracer +${from.honing} → +${next.honing}`, from, next, { tap: BRACER_TAPS[next.honing - 1] });
				from = next;
			}
		}
	}
	if (different(base.sidereal, target.sidereal)) add('Equipment', 'Sidereal weapon changes', base.sidereal, target.sidereal);
	for (const slot of HONING_SLOTS) {
		const from = base.quality[slot], to = target.quality[slot];
		if (from !== undefined && to !== undefined && from !== to) add('Equipment', `${HONING_SLOT_LABELS[slot]} quality ${from} → ${to}`, from, to, to > from ? { fixed: qualityCost(slot, from, to).gold, detail: 'Average tap gold with unlimited Chaos Stones; stops at this quality or higher. No pity.' } : { status: 'excluded' });
	}
	for (const slot of ACCESSORY_SLOTS) {
		const from = [base.accessories[slot], base.accessoryStats[slot]], to = [target.accessories[slot], target.accessoryStats[slot]];
		if (different(from, to)) {
			const lines = target.accessories[slot] ?? [];
			const sourceKey = base.accessoryStats[slot] === target.accessoryStats[slot]
				? accessorySetKey({ slot, lines: lines.filter((ln): ln is DpsLine => !isOtherLine(ln)) }) : undefined;
			const catalog = roleOf(loadout).accessoryLines;
			const rolls = lines.filter((ln): ln is DpsLine => !isOtherLine(ln)).map((ln) => {
				const option = catalog.find((option) => option.key === ln.key);
				return { name: option?.name ?? ln.key, tier: ln.tier, value: option ? formatLineValue(option, option.values[ln.tier]) : undefined };
			});
			add('Accessories', names[slot], from, to, { sourceKey, rolls });
		}
	}
	const info = gemParts(loadout);
	target.gems.forEach((to, i) => {
		const from = base.gems[i];
		if (!from || !different(from, to)) return;
		if (from.kind !== to.kind || from.skill !== to.skill) add('Gems', `Gem ${i + 1} replacement (Lv. ${to.level})`, from, to);
		else if (to.level > from.level) {
			for (let level = from.level; level < to.level; level++) add('Gems', `Gem ${i + 1}: Lv. ${level} → ${level + 1}`, [i, level], [i, level + 1], { sourceKey: `gem:${info[i]?.tier ?? 'T4'}:${level}` });
		} else add('Gems', `Gem ${i + 1}: Lv. ${from.level} → ${to.level}`, from, to, { status: 'excluded' });
	});
	for (const [id, to] of Object.entries(target.engravings)) {
		const from = base.engravings[Number(id)];
		const read = to.as ?? Number(id);
		const same = from && (from.as ?? Number(id)) === read;
		const before = same ? from.books : base.engravings[read]?.books ?? 0;
		if (to.books > before) add('Engravings', `${engravingName(read)}: ${(to.books - before) * 5} relic books`, before, to.books, { books: { id: read, count: (to.books - before) * 5 } });
		if ((!same && from) || to.books < before) add('Engravings', `${engravingName(read)} engraving setup`, from, to, { status: 'excluded' });
		if (to.stone !== (from?.stone ?? 0)) add('Engravings', `${engravingName(read)} ability stone ${from?.stone ?? 0} → ${to.stone}`, from?.stone, to.stone, { status: 'rng' });
	}
	for (const id of Object.keys(base.engravings)) if (!target.engravings[Number(id)]) add('Engravings', `${engravingName(Number(id))} removed`, base.engravings[Number(id)], null, { status: 'excluded' });
	for (const tree of ['evolution', 'enlightenment', 'leap'] as const) {
		const from = base.karma[tree], to = target.karma[tree];
		if (from === to) continue;
		if (from !== null && to !== null && to > from) {
			for (let level = from + 1; level <= to; level++) add('Karma', `${tree[0].toUpperCase() + tree.slice(1)} Karma ${level - 1} → ${level}`, level - 1, level, { sourceKey: `karma:${tree === 'evolution' ? 'evolution-level' : tree}:${level}`, detail: 'Tap gold only; assumes plentiful Destiny Stones.' });
		} else add('Karma', `${tree} Karma change`, from, to, { status: from === null ? 'unavailable' : 'excluded', detail: from === null ? 'Starting Karma level is unknown.' : '' });
	}
	const beforeSkins = skinParts(base.skins), afterSkins = skinParts(target.skins);
	if (different(beforeSkins, afterSkins)) afterSkins.forEach((to, i) => {
		if (to !== beforeSkins[i]) add('Skins', `${['Head', 'Chest', 'Pants', 'Weapon'][i]} skin: ${beforeSkins[i] ?? '?'}% → ${to ?? '?'}%`, beforeSkins[i], to);
	});
	else if (base.skins.bonus !== target.skins.bonus) add('Skins', `Skin bonus ${base.skins.bonus ?? '?'}% → ${target.skins.bonus ?? '?'}%`, base.skins.bonus, target.skins.bonus);
	if (different(base.bracelet, target.bracelet)) add('Bracelet', 'Bracelet stat / effect changes', base.bracelet, target.bracelet, { status: 'rng' });
	if (different(base.arkGrid, target.arkGrid)) add('Ark Grid', 'Core / astrogem changes', base.arkGrid, target.arkGrid, { status: 'rng' });
	return rows;
}

export interface BudgetLine extends BudgetChange {
	average?: number;
	missing: string[];
	inventory?: { id: string; average: number; averageBuy: number }[];
}

/** Price the planned accessory against the imported snapshot, even if the live ladder has moved past it. */
export function budgetPriceUpgrades(loadout: Loadout, base: SimState, target: SimState): Upgrade[] {
	const upgrades = accessorySetUpgrades(loadout, base, base);
	const cp = simulate(loadout, base, base).cp;
	for (const row of budgetChanges(loadout, base, target).filter((row) => row.section === 'Accessories')) {
		const slot = ACCESSORY_SLOTS.find((slot) => names[slot] === row.title)!;
		const state = { ...base, accessories: { ...base.accessories, [slot]: target.accessories[slot] }, accessoryStats: { ...base.accessoryStats, [slot]: target.accessoryStats[slot] } };
		const key = row.sourceKey ?? row.key;
		if (!upgrades.some((u) => u.key === key)) upgrades.push({ key, category: 'accessory', subject: row.title, title: row.title, detail: '', lines: row.rolls, count: 1, approximate: false, gainPct: cp > 0 ? (simulate(loadout, state, base).cp / cp - 1) * 100 : 0 });
	}
	return upgrades;
}

/** Share inventory across the plan using expected material use (an approximation), without changing saved stock. */
export function priceBudget(changes: BudgetChange[], prices: MaterialPrices, owned: MaterialOwned, quotes: Record<string, number>, bookPrices: Record<string, number>): BudgetLine[] {
	const averageStock = { ...owned };
	return changes.map((row): BudgetLine => {
		if (row.status) return { ...row, missing: [] };
		if (row.tap) {
			const cost = honingCost(row.tap, prices, averageStock);
			const missing = new Set<string>();
			const inventory: NonNullable<BudgetLine['inventory']> = [];
			for (const m of cost.breakdown?.average.materials ?? []) {
				inventory.push({ id: m.id, average: m.bound, averageBuy: m.bought });
				if (m.bought > 1e-6 && prices[m.id] === undefined) missing.add(materialName(m.id));
				averageStock[m.id] = Math.max(0, (averageStock[m.id] ?? 0) - m.bound);
			}
			return { ...row, average: cost.expected, missing: [...missing], inventory };
		}
		const karma = row.sourceKey?.startsWith('karma:') ? autoHoningCosts([row.sourceKey], {}, {}, {}, {})[row.sourceKey] : undefined;
		const price = row.books ? bookPrices[row.books.id] === undefined ? undefined : bookPrices[row.books.id] * row.books.count : quotes[row.sourceKey ? accessoryPriceKey(row.sourceKey, quotes) : row.key] ?? quotes[row.key] ?? row.fixed;
		return { ...row, average: karma?.expected ?? price, missing: [] };
	});
}
