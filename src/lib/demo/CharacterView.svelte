<script lang="ts">
	import { Simulator } from '$lib/upgrade-planner';
	import { className } from '$lib/upgrade-planner/class-names';
	import type { CpDistribution } from '$lib/upgrade-planner/cp-distribution';
	import type { LoadoutKind } from '$lib/bible-data';
	import Segmented from '$lib/upgrade-planner/sim/Segmented.svelte';
	import type { Loadout } from '$lib/upgrade-planner/types';

	let {
		name,
		region,
		subtitle,
		itemLevel,
		loadout,
		cpDistribution = null,
		loadouts,
		loadoutKind,
		onloadout
	}: {
		name: string;
		region: string;
		/** Lines under the name (guild, snapshot time). */
		subtitle?: string | string[];
		itemLevel?: number | null;
		loadout: Loadout | null;
		cpDistribution?: CpDistribution | null;
		/** bible's estimated raid loadout and latest raid snapshot, to switch between when both exist. */
		loadouts?: Partial<Record<LoadoutKind, Loadout>>;
		loadoutKind?: LoadoutKind;
		onloadout?: (kind: LoadoutKind) => void;
	} = $props();

	const LOADOUT_LABELS: Record<LoadoutKind, { label: string; title: string }> = {
		estimated: { label: 'Estimated raid loadout', title: "lostark.bible's estimate: the best raid gear it has seen (e.g. gems a snapshot caught unequipped)" },
		current: { label: 'Latest raid snapshot', title: 'Exactly what lostark.bible saw last time in a raid' }
	};
	const loadoutOptions = $derived(
		(['estimated', 'current'] as const)
			.filter((k) => loadouts?.[k])
			.map((k) => ({
				value: k,
				label: `${LOADOUT_LABELS[k].label} · ${loadouts![k]!.combatPower?.score.toFixed(2) ?? '?'}`,
				title: LOADOUT_LABELS[k].title
			}))
	);

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
	{#if loadoutOptions.length > 1 && loadoutKind && onloadout}
		<div class="mt-1"><Segmented value={loadoutKind} options={loadoutOptions} onselect={onloadout} label="Loadout to simulate" size="h-8 px-3 text-xs" /></div>
	{/if}
	<a class="w-fit text-xs text-surface-300 underline" href={`https://lostark.bible/character/${region}/${encodeURIComponent(name)}`} target="_blank" rel="noopener">
		View on lostark.bible
	</a>
</div>

{#if !loadout}
	<p class="text-surface-300">This character has no Ark Passive loadout with combat power data yet.</p>
{:else}
	<Simulator {loadout} {cpDistribution} characterName={name} />
{/if}
