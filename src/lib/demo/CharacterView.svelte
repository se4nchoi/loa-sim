<script lang="ts">
	import { Simulator, UpgradePlanner } from '$lib/upgrade-planner';
	import { className } from '$lib/upgrade-planner/class-names';
	import type { CpDistribution } from '$lib/upgrade-planner/cp-distribution';
	import type { Loadout } from '$lib/upgrade-planner/types';

	let {
		name,
		region,
		subtitle,
		itemLevel,
		loadout,
		cpDistribution = null
	}: {
		name: string;
		region: string;
		/** Lines under the name (guild, snapshot time). */
		subtitle?: string | string[];
		itemLevel?: number | null;
		loadout: Loadout | null;
		cpDistribution?: CpDistribution | null;
	} = $props();

	const ilvl = $derived(itemLevel ?? loadout?.itemLevel ?? null);
	const lines = $derived((Array.isArray(subtitle) ? subtitle : [subtitle]).filter((l): l is string => !!l));
</script>

<svelte:head><title>{name} ({region}) | loa-sim</title></svelte:head>

<div class="mb-4 flex flex-col gap-1">
	<div class="flex flex-row gap-1 text-xs">
		<span class="rounded-xs bg-surface-900 px-2 py-0.5">{region === 'NA' ? 'North America' : region}</span>
		{#if loadout}<span class="rounded-xs bg-surface-900 px-2 py-0.5">{className(loadout.classId)}</span>{/if}
	</div>
	<h1 class="text-3xl font-bold">{name}</h1>
	{#if ilvl}<span class="text-xl font-semibold text-surface-200 tabular-nums" title="Item Level">{ilvl.toFixed(2)}</span>{/if}
	{#each lines as line (line)}<span class="text-sm text-surface-300">{line}</span>{/each}
	<a class="w-fit text-xs text-surface-300 underline" href={`https://lostark.bible/character/${region}/${encodeURIComponent(name)}`} target="_blank" rel="noopener">
		View on lostark.bible
	</a>
</div>

{#if !loadout}
	<p class="text-surface-300">This character has no Ark Passive loadout with combat power data yet.</p>
{:else}
	<Simulator {loadout} {cpDistribution} characterName={name}>
		{#snippet sidebar()}
			<UpgradePlanner {loadout} />
		{/snippet}
	</Simulator>
{/if}
