import type { SavedStatValues } from '$lib/logs/stat-values-store.svelte';
import { withGemGroups } from './dps';
import { estimateDps } from './dps-estimate';
import { SECTIONS } from './sim/ui';
import { initSimState, type SimState } from './simulate';
import type { Loadout } from './types';

const sectionLabels: Record<string, string> = { gear: 'Equipment', accessories: 'Accessories', bracelet: 'Bracelet', skins: 'Skins', gems: 'Gems', engravings: 'Engravings', arkGrid: 'Ark Grid', karma: 'Karma', paradise: 'Paradise' };

/** Analyze a copy: choosing a log must never change the Simulator's saved gear plan. */
export function analyzeDpsPlan(loadout: Loadout, state: SimState, sample?: SavedStatValues) {
	const base = initSimState(loadout);
	const target = structuredClone(state);
	target.skillShares = withGemGroups(target.gems, sample?.skillShares ?? target.skillShares);
	target.skillCooldownUse = withGemGroups(target.gems, sample?.skillCooldownUse ?? target.skillCooldownUse, 'max');
	const estimate = estimateDps(loadout, base, target, base, sample?.values ?? null);
	const sections = Object.entries(SECTIONS).flatMap(([name, keys]) => {
		if (!keys.some(key => JSON.stringify(base[key]) !== JSON.stringify(target[key]))) return [];
		const only = structuredClone(base);
		for (const key of keys) Object.assign(only, { [key]: structuredClone(target[key]) });
		only.skillShares = target.skillShares;
		only.skillCooldownUse = target.skillCooldownUse;
		return [{ name: sectionLabels[name] ?? name, estimate: estimateDps(loadout, base, only, base, sample?.values ?? null) }];
	});
	return { base, target, estimate, sections };
}
