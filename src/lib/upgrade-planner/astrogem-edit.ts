import { ASTROGEM_ITEMS, ASTROGEM_KINDS, ITEMS } from './game-data';
import { astrogemWillpower } from './arkgrid-optimize';
import { CORE_WILLPOWER, type CoreInfo } from './tables';
import type { SimAstrogem, SimCore } from './simulate';

/** Change kind while retaining grade, cutting results and compatible option types. */
export function astrogemAs(gem: SimAstrogem, itemId: number): SimAstrogem {
	const kind = ASTROGEM_KINDS[ASTROGEM_ITEMS[itemId]];
	const source = ASTROGEM_KINDS[ASTROGEM_ITEMS[gem.itemId]];
	if (!kind || !source || kind.attr !== source.attr || ITEMS[itemId]?.[2] !== ITEMS[gem.itemId]?.[2]) return gem;
	const used = new Set(gem.opts.filter((o) => kind.options.includes(o.id)).map((o) => o.id));
	const opts = gem.opts.map((o) => {
		if (kind.options.includes(o.id)) return { ...o };
		const available = kind.options.filter((id) => !used.has(id));
		const id = available.find((id) => (id >= 2011) === (o.id >= 2011)) ?? available[0];
		used.add(id);
		return { ...o, id };
	});
	const { removed, ...active } = gem;
	return { ...active, itemId, opts };
}

/** Ordinary gems of the same grade and attribute, checked against the simulated core's capacity. */
export function astrogemTypeChoices(core: SimCore, info: CoreInfo, gi: number) {
	const gem = core.gems[gi];
	const grade = ITEMS[gem.itemId]?.[2];
	const cap = CORE_WILLPOWER[core.grade ?? info.grade];
	const other = core.gems.reduce((sum, g, i) => sum + (i === gi ? 0 : astrogemWillpower(g)), 0);
	return [{ itemId: 0, name: 'None', willpower: 0, total: other, cap, fits: true }, ...Object.entries(ASTROGEM_ITEMS)
		.filter(([id, kind]) => Number(id) >= 67400000 && Number(id) < 67500000
			&& ITEMS[Number(id)]?.[2] === grade && ASTROGEM_KINDS[kind]?.attr === info.attr)
		.map(([id, kind]) => {
			const itemId = Number(id);
			const willpower = astrogemWillpower(astrogemAs(gem, itemId));
			return { itemId, name: ASTROGEM_KINDS[kind].name, willpower, total: other + willpower, cap, fits: other + willpower <= cap };
		})];
}

/** Guard the mutation as well as disabling impossible choices in the picker. */
export function setAstrogemType(core: SimCore, info: CoreInfo, gi: number, itemId: number): boolean {
	if (!astrogemTypeChoices(core, info, gi).some((choice) => choice.itemId === itemId && choice.fits)) return false;
	core.gems[gi] = itemId === 0 ? { ...core.gems[gi], removed: true } : astrogemAs(core.gems[gi], itemId);
	return true;
}

/** Efficiency is the gem's 0–5 Willpower reduction, independent of its core points and options. */
export function astrogemEfficiencyChoices(core: SimCore, info: CoreInfo, gi: number) {
	const gem = core.gems[gi];
	const cap = CORE_WILLPOWER[core.grade ?? info.grade];
	const other = core.gems.reduce((sum, g, i) => sum + (i === gi ? 0 : astrogemWillpower(g)), 0);
	return Array.from({ length: 6 }, (_, costReduc) => {
		const willpower = astrogemWillpower({ ...gem, costReduc });
		return { costReduc, willpower, total: other + willpower, cap, fits: other + willpower <= cap };
	});
}

export function setAstrogemEfficiency(core: SimCore, info: CoreInfo, gi: number, costReduc: number): boolean {
	if (!astrogemEfficiencyChoices(core, info, gi).some((c) => c.costReduc === costReduc && c.fits)) return false;
	core.gems[gi].costReduc = costReduc;
	return true;
}
