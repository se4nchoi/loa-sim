<!-- Demo-only replica of lostark.bible's sidebar "Combat Power" card, for visual context. -->
<script lang="ts">
	import { combatPower, partLow, PartType as T } from '$lib/upgrade-planner/cp';
	import type { Loadout } from '$lib/upgrade-planner/types';

	let { loadout }: { loadout: Loadout } = $props();

	const group = (...types: number[]) => {
		let r = 1;
		for (const p of loadout.battlePoint.parts)
			if (types.includes(p.type)) r *= 1 + partLow(p) / 1e4;
		return r * 100 - 100;
	};
	const rows = $derived([
		['Ark Passive', group(T.ArkPassiveEvolution, T.ArkPassiveEnlightenment, T.ArkPassiveLeap, T.KarmaEvolutionRank, T.KarmaLeapLevel)],
		['Ark Grid', group(T.ArkGridCore, T.ArkGridGem)],
		['Engravings', group(T.Engraving)],
		['Accessory Effects', group(T.AccessoryGrinding, T.AccessoryCombatEffect)],
		['Bracelet Effects', group(T.BraceletStatType, T.BraceletEffect)],
		['Gems', group(T.Gem)]
	] as const);
	const score = $derived(loadout.combatPower?.score ?? combatPower(loadout.battlePoint.parts).max);
</script>

<div class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
	<div class="flex flex-row items-center bg-black/10 px-3 py-2 font-bold">Combat Power</div>
	<div class="flex flex-1 flex-row items-center p-2 text-2xl font-bold">
		<svg class="mr-1 size-5 text-red-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M14.5 2 22 9.5l-2 2-1.5-1.5L10 18.5l1.5 1.5-2 2-7.5-7.5 2-2L5.5 14 14 5.5 12.5 4z" /></svg>
		<span class="text-red-400">{score.toFixed(2)}</span>
	</div>
	<div class="grid grid-cols-[1fr_max-content] p-1">
		{#each rows as [label, pct] (label)}
			<span class="self-center px-1 text-sm text-surface-200">{label}</span>
			<span class="text-right text-green-400">+{pct.toFixed(2)}<span class="text-xs">%</span></span>
		{/each}
	</div>
</div>
