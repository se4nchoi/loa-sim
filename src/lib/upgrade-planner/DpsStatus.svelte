<script lang="ts">
	import { onMount } from 'svelte';
	import { loadStatValues, statValues } from '$lib/logs/stat-values-store.svelte';
	import { estimateDps } from './dps-estimate';
	import { formatPct } from './format';
	import { roleOf } from './roles';
	import type { SimState } from './simulate';
	import type { Loadout } from './types';
	import { sampleQuality } from './dps-sample';
	import DpsReplay from './DpsReplay.svelte';

	let { loadout, characterKey = '', simState, simBase }: {
		loadout: Loadout;
		characterKey?: string;
		simState: SimState;
		simBase: SimState;
	} = $props();
	onMount(loadStatValues);
	const support = $derived(roleOf(loadout).support);
	const saved = $derived(statValues.byCharacter[characterKey]);
	const estimate = $derived(!support ? estimateDps(loadout, simBase, simState, simBase, saved?.values ?? null) : null);
	const gain = $derived(estimate?.gainPct ?? null);
	const quality = $derived(saved?.sample ? sampleQuality(saved.sample.runs,loadout,simBase) : null);
	const date = (at: number) => new Date(at).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
	const statNames: Record<string,string> = {mainStat:'Main stat',weaponPower:'Weapon Power',attackPower:'Flat Atk. Power',attackPowerPct:'Atk. Power %',weaponPowerPct:'Weapon Power %',additionalDamage:'Additional Damage',critRate:'Crit Rate',critDamage:'Crit Damage',evoDamage:'Evolution Damage'};
</script>

<section class="mb-4 rounded-xs border border-accent-500/30 bg-surface-900 p-3" aria-label="DPS simulator status">
	<div class="flex flex-wrap items-center gap-2">
		<h1 class="font-bold">DPS Sim</h1>
		<span class="text-xs text-amber-300">Experimental</span>
		{#if gain !== null}<span class="ml-auto font-semibold {gain < 0 ? 'text-red-400' : 'text-green-400'} tabular-nums">{estimate?.excluded.length ? 'Covered DPS' : 'DPS'} ≈ {formatPct(gain)}%</span>{/if}
	</div>
	{#if support}
		<p class="mt-1 text-sm text-surface-300">DPS estimates currently cover damage dealers. Choose a dealer character to test upgrades.</p>
	{:else}
		<p class="mt-1 text-sm text-surface-300">
			{#if saved}
				Logs loaded: {saved.label} · stat values from {saved.values?.runs ?? 0} run{saved.values?.runs === 1 ? '' : 's'}. Supported upgrades show DPS ≈ in Next Upgrades.
			{:else}
				In Gems, choose “Add damage shares”, then load your encounters.db from LOA Logs and apply the selected runs.
			{/if}
		</p>
		{#if saved && quality}
			<div class="mt-2 text-xs text-surface-300" aria-label="Log sample quality">
				<p>{saved.sample!.runs.length} contributing / {saved.sample!.selected} selected · {quality.oldest !== null && quality.newest !== null ? `${date(quality.oldest)} – ${date(quality.newest)}` : 'Log dates unavailable'}</p>
				<p class="mt-1">{quality.contexts.join('; ') || 'Encounter unknown'}</p>
				<p class="mt-1">{quality.buildStatus} · {quality.replayRuns} run{quality.replayRuns === 1 ? '' : 's'} with replay hits{quality.coverage !== null ? ` · ${quality.coverage.toFixed(1)}% damage coverage` : ''}</p>
				{#each quality.warnings as warning}<p class="mt-1 text-amber-300">{warning}</p>{/each}
			</div>
			{#if saved.values?.statRanges}
				<details class="mt-2 text-xs text-surface-300">
					<summary class="cursor-pointer text-sky-300">Stat sensitivity across contributing runs</summary>
					{#each Object.entries(saved.values.statRanges) as [stat, range]}
						<p class="mt-1">{statNames[stat] ?? stat}: {range.min.toFixed(3)}% – {range.max.toFixed(3)}% DPS per {['mainStat','weaponPower','attackPower'].includes(stat) ? '+1,000' : '+1 percentage point'} · {saved.values.statSamples?.[stat] ?? saved.values.runs} samples</p>
					{/each}
					<p class="mt-1 text-surface-400">A range from one run is not evidence of stability across runs.</p>
				</details>
			{/if}
		{:else if saved}
			<p class="mt-2 text-xs text-amber-300">Sample dates and build comparisons were not saved by the previous importer. Reimport the database to inspect them.</p>
		{/if}
		{#if estimate?.excluded.length}
			<p class="mt-1 text-sm text-amber-300">Not included: {estimate.excluded.join(', ')}. {gain !== null ? 'The figure covers the remaining changes only.' : 'Load the relevant logs or test a supported change.'}</p>
		{/if}
		{#if gain !== null && estimate}
			<p class="mt-1 text-xs text-sky-300">Stats / base attack: {estimate.statPct === null ? 'unestimated' : `${formatPct(estimate.statPct)}%`} · Gem skill / cooldown effects: {estimate.gemPct === null ? 'unestimated' : `${formatPct(estimate.gemPct)}%`}</p>
		{/if}
		<p class="mt-1 text-xs text-surface-400">Stat and gem multipliers combine for the same rotation. Cooldown gains estimate extra casts; large stat changes are approximate. Match logs to your current build and raid / gate / difficulty.</p>
		<a href="#sim-gems" class="mt-2 inline-block text-sm text-accent-300 hover:underline">Go to Gems / LOA Logs import →</a>
		{#if saved}<DpsReplay {loadout} {simState} {simBase} {saved} />{/if}
	{/if}
</section>
