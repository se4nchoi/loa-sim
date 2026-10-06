<script lang="ts">
	import { UpgradePlanner } from '$lib/upgrade-planner';
	import type { Loadout } from '$lib/upgrade-planner/types';
	import CombatPowerCard from './CombatPowerCard.svelte';

	let {
		name,
		region,
		subtitle,
		loadout
	}: { name: string; region: string; subtitle?: string; loadout: Loadout | null } = $props();
</script>

<svelte:head><title>{name} ({region}) | Upgrade Planner demo</title></svelte:head>

<div class="mb-4 flex flex-col gap-1">
	<div class="flex flex-row gap-1 text-xs">
		<span class="rounded-xs bg-surface-900 px-2 py-0.5">{region === 'NA' ? 'North America' : region}</span>
		{#if loadout}<span class="rounded-xs bg-surface-900 px-2 py-0.5">{loadout.classId.replaceAll('_', ' ')}</span>{/if}
	</div>
	<h1 class="text-3xl font-bold">{name}</h1>
	{#if subtitle}<span class="text-sm text-surface-300">{subtitle}</span>{/if}
	<a class="w-fit text-xs text-surface-300 underline" href={`https://lostark.bible/character/${region}/${encodeURIComponent(name)}`} target="_blank" rel="noopener">
		View on lostark.bible
	</a>
</div>

{#if !loadout}
	<p class="text-surface-300">This character has no Ark Passive loadout with combat power data yet.</p>
{:else}
	<div class="grid grid-cols-[1fr_300px] gap-2 max-lg:grid-cols-1">
		<div class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
			<div class="flex flex-row items-center bg-black/10 px-3 py-2 font-bold">Equipment</div>
			<p class="p-4 text-sm text-surface-400">
				The rest of the character page (equipment, engravings, ark passive…) lives on lostark.bible. This demo only
				renders the sidebar, where the Next Upgrades card would sit under Combat Power.
			</p>
		</div>
		<div class="flex flex-col gap-2">
			<CombatPowerCard {loadout} />
			<UpgradePlanner {loadout} />
		</div>
	</div>
{/if}
