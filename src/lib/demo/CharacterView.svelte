<script lang="ts">
	import { Simulator, UpgradePlanner } from '$lib/upgrade-planner';
	import type { Loadout } from '$lib/upgrade-planner/types';

	let {
		name,
		region,
		subtitle,
		loadout
	}: { name: string; region: string; subtitle?: string; loadout: Loadout | null } = $props();
</script>

<svelte:head><title>{name} ({region}) | Combat Power Simulator</title></svelte:head>

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
	<Simulator {loadout} characterName={name}>
		{#snippet sidebar()}
			<UpgradePlanner {loadout} />
		{/snippet}
	</Simulator>
{/if}
