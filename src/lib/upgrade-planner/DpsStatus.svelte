<script lang="ts">
	import { onMount } from 'svelte';
	import { loadStatValues, setStatValues, statValues } from '$lib/logs/stat-values-store.svelte';
	import { publicDpsSample, SHANZKII_PUBLIC_SAMPLES } from './public-dps-samples';
	import { estimateDps } from './dps-estimate';
	import { formatPct } from './format';
	import { roleOf } from './roles';
	import type { SimState } from './simulate';
	import type { Loadout } from './types';
	import { sampleQuality } from './dps-sample';
	import DpsReplay from './DpsReplay.svelte';

	let { loadout, characterKey = '', simState, simBase, onpublicsample }: {
		loadout: Loadout;
		characterKey?: string;
		simState: SimState;
		simBase: SimState;
		onpublicsample?: (shares: Record<number, number>, cooldown: Record<number, number>) => void;
	} = $props();
	onMount(loadStatValues);
	const support = $derived(roleOf(loadout).support);
	const saved = $derived(statValues.byCharacter[characterKey]);
	const estimate = $derived(!support ? estimateDps(loadout, simBase, simState, simBase, saved?.values ?? null) : null);
	const gain = $derived(estimate?.gainPct ?? null);
	const quality = $derived(saved?.sample ? sampleQuality(saved.sample.runs,loadout,simBase) : null);
	const date = (at: number) => new Date(at).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'});
	const statNames: Record<string,string> = {mainStat:'Main stat',weaponPower:'Weapon Power',attackPower:'Flat Atk. Power',attackPowerPct:'Atk. Power %',weaponPowerPct:'Weapon Power %',additionalDamage:'Additional Damage',critRate:'Crit Rate',critDamage:'Crit Damage',evoDamage:'Evolution Damage'};
	let publicSampleId = $state(SHANZKII_PUBLIC_SAMPLES[0].id);
	$effect(() => {
		if (saved?.publicLog) publicSampleId = saved.publicLog.id;
	});
	function usePublicSample() {
		const sample = publicDpsSample(characterKey, publicSampleId);
		if (!sample) return;
		setStatValues(characterKey, sample);
		onpublicsample?.(sample.skillShares!, sample.skillCooldownUse!);
	}
</script>

<section class="mb-4 rounded-xs border border-accent-500/30 bg-surface-900 p-3" aria-label="DPS simulator status">
	<div class="flex flex-wrap items-center gap-2">
		<h2 class="font-bold">Estimated DPS impact</h2>
		<span class="text-xs text-amber-300">Experimental</span>
		{#if gain !== null}<span class="ml-auto font-semibold {gain < 0 ? 'text-red-400' : 'text-green-400'} tabular-nums">{estimate?.excluded.length ? 'Covered DPS' : 'DPS'} ≈ {formatPct(gain)}%</span>{/if}
	</div>
	{#if support}
		<p class="mt-1 text-sm text-surface-300">DPS estimates currently cover damage dealers. Choose a dealer character to test upgrades.</p>
	{:else}
		{#if characterKey.toLowerCase() === 'na/shanzkii'}
			<div class="mt-2 flex flex-wrap items-center gap-2">
				<label class="text-sm">Oct 13 public clear
					<select class="ml-1 rounded-xs border border-surface-600 bg-surface-800 px-2 py-1" bind:value={publicSampleId}>
						{#each SHANZKII_PUBLIC_SAMPLES as sample}<option value={sample.id}>{sample.label}</option>{/each}
					</select>
				</label>
				<button type="button" class="rounded-xs border border-accent-500 px-2 py-1 text-sm text-accent-300" onclick={usePublicSample}>Use public clear</button>
			</div>
			<p class="mt-1 text-xs text-surface-400">Replaces this character's imported sample and damage shares. Choose one gate at a time.</p>
		{/if}
		<p class="mt-1 text-sm text-surface-300">
			{#if saved?.publicLog}
				Public estimates loaded: {saved.label}. The estimate uses this clear for the saved changes.
			{:else if saved}
				Logs loaded: {saved.label} · stat values from {saved.values?.runs ?? 0} run{saved.values?.runs === 1 ? '' : 's'}.
			{:else}
				Choose a public clear or import your encounters.db below to estimate the saved changes.
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
		{:else if saved?.publicLog}
			<p class="mt-2 text-xs text-amber-300">Rounded public-log estimates · one run · historical build unverified. Main-skill shares cover {saved.publicLog.skillCoverage.toFixed(1)}% of recorded damage; other skills remain unestimated. These stat gains are not verified normalized DPS gains.</p>
			<p class="mt-1 text-xs text-surface-300">Recorded DPS {(saved.publicLog.dps / 1e6).toFixed(1)}m · nDPS {(saved.publicLog.ndps / 1e6).toFixed(1)}m. These are reference values; upgrades do not project absolute nDPS.</p>
			<a class="mt-1 inline-block text-xs text-sky-300 hover:underline" href={saved.publicLog.url} target="_blank" rel="noreferrer">View source log →</a>
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
		<a href="#dps-log-import" class="mt-2 inline-block text-sm text-accent-300 hover:underline">Choose LOA Logs sample →</a>
		{#if saved?.publicLog}
			<p class="mt-2 text-xs text-surface-400">Full per-hit replay requires the updated encounters.db. Import it below when available.</p>
		{:else if saved}<DpsReplay {loadout} {simState} {simBase} {saved} />{/if}
	{/if}
</section>
