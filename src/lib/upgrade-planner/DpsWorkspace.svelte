<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import CharacterSwitcher from '$lib/CharacterSwitcher.svelte';
	import { characterKey, loadSavedCharacter, type SavedCharacter } from '$lib/saved-character';
	import { refreshStatValues, statValues } from '$lib/logs/stat-values-store.svelte';
	import { loadAutosave, savedSimulations, sameBaseline, type SavedSimulation } from './saved-simulations';
	import { initSimState, type SimState } from './simulate';
	import { analyzeDpsPlan } from './dps-plan';
	import { budgetChanges } from './sim-budget';
	import { GEM_SKILLS } from './game-data';
	import { formatPct } from './format';
	import { className } from './class-names';
	import DpsStatus from './DpsStatus.svelte';
	import LogsImport from './sim/LogsImport.svelte';

	let character = $state<SavedCharacter | null>(null);
	let working = $state.raw<SimState | null>(null);
	let plans = $state<SavedSimulation[]>([]);
	let selectedPlan = $state('working');
	let hasAutosave = $state(false);
	let refreshed = $state<number | null>(null);
	const wanted = $derived(page.url.searchParams.get('c'));
	function refresh() {
		character = loadSavedCharacter(wanted);
		if (character?.loadout) {
			const key = characterKey(character);
			const draft = loadAutosave(key, character.loadout);
			hasAutosave = !!draft;
			working = draft ?? initSimState(character.loadout);
			plans = savedSimulations(key).filter(plan => sameBaseline(plan.loadout, character!.loadout!));
			if (!plans.some(plan => plan.id === selectedPlan)) selectedPlan = 'working';
		} else { working = null; plans = []; }
		refreshStatValues();
		refreshed = Date.now();
	}
	$effect(() => { void wanted; untrack(() => { selectedPlan = 'working'; refresh(); }); });
	onMount(() => {
		const storageChanged = (e: StorageEvent) => {
			if (!e.key || e.key.startsWith('loa-sim:')) refresh();
		};
		window.addEventListener('storage', storageChanged);
		window.addEventListener('focus', refresh);
		return () => {
			window.removeEventListener('storage', storageChanged);
			window.removeEventListener('focus', refresh);
		};
	});
	const key = $derived(character ? characterKey(character) : '');
	const chosen = $derived(plans.find(plan => plan.id === selectedPlan));
	const sourceState = $derived(chosen?.state ?? working);
	const sample = $derived(statValues.byCharacter[key]);
	const analysis = $derived(character?.loadout && sourceState ? analyzeDpsPlan(character.loadout, sourceState, sample) : null);
	const changes = $derived(analysis && character?.loadout ? budgetChanges(character.loadout, analysis.base, analysis.target) : []);
	const simulatorUrl = $derived(`/sim?c=${encodeURIComponent(key)}`);
	const gemSkills = $derived(analysis ? [...new Set(analysis.target.gems.map(gem => gem.skill).filter((id): id is number => id !== null))] : []);
	const panel = 'rounded-lg border border-surface-700 bg-surface-900 p-4';
</script>

{#if character?.loadout && analysis}
	<CharacterSwitcher current={key} simulatorPath="/dps" />
	<div class="mb-5 flex flex-wrap items-start justify-between gap-3">
		<div>
			<p class="text-xs uppercase tracking-widest text-sky-300">DPS workspace</p>
			<h1 class="mt-1 text-2xl font-semibold">{character.name} <span class="text-sm font-normal text-surface-400">{className(character.loadout.classId)}</span></h1>
			<p class="mt-1 text-sm text-surface-300">Analyze the changes saved in Simulator against your own raid sample.</p>
		</div>
		<a href={simulatorUrl} class="rounded-lg bg-accent-700 px-4 py-2 text-sm font-semibold text-white hover:bg-accent-600">Edit changes in Simulator →</a>
	</div>
	<div class="mb-4 {panel}" aria-label="Simulation source">
		<div class="flex flex-wrap items-center justify-between gap-3">
			<label class="flex flex-wrap items-center gap-2 text-sm">Saved change plan
				<select class="rounded-xs border border-surface-600 bg-surface-800 px-2 py-1" bind:value={selectedPlan}>
					<option value="working">{hasAutosave ? 'Current Simulator changes' : 'Snapshot baseline · no saved edits'}</option>
					{#each plans as plan}<option value={plan.id}>{plan.name}</option>{/each}
				</select>
			</label>
			<button class="text-sm text-sky-300 hover:underline" onclick={refresh}>Refresh saved data</button>
		</div>
		<p class="mt-2 text-xs text-surface-400">Starting snapshot: {character.snapshotId ? 'Kept snapshot' : character.loadoutKind === 'estimated' ? 'Estimated raid loadout' : 'Current raid snapshot'} · {new Date(character.loadout.lastUpdated ?? character.savedAt).toLocaleString()}.</p>
		<p class="mt-1 text-xs text-surface-400">{refreshed ? `Read at ${new Date(refreshed).toLocaleTimeString()}. ` : ''}Gear edits stay in Simulator. Saved data refreshes when this tab regains focus or another tab updates it.</p>
	</div>
	<DpsStatus loadout={character.loadout} characterKey={key} simState={analysis.target} simBase={analysis.base} />
	<div class="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
		<section class={panel} aria-label="Saved changes and DPS impact">
			<h2 class="font-semibold">Saved changes & DPS impact</h2>
			{#if !changes.length}
				<p class="mt-3 text-sm text-surface-300">No gear changes are saved for this snapshot. Make a change in Simulator, then return here to see its DPS impact.</p>
			{:else}
				<ul class="mt-3 space-y-2 text-sm">{#each changes as change}<li class="rounded-xs bg-surface-800/60 px-3 py-2">{change.title}</li>{/each}</ul>
				<div class="mt-4 space-y-3">
					{#each analysis.sections as section}
						<div class="border-t border-surface-700 pt-3">
							<div class="flex items-center justify-between gap-2"><span class="text-sm">{section.name}</span><span class="font-semibold text-sky-300">{section.estimate.gainPct === null ? 'Unestimated' : `${formatPct(section.estimate.gainPct)}%`}</span></div>
							{#if section.estimate.excluded.length}<p class="mt-1 text-xs text-amber-300">Not included: {section.estimate.excluded.join(', ')}</p>{/if}
						</div>
					{/each}
				</div>
				<p class="mt-3 text-xs text-surface-400">Each section is compared with the starting snapshot on its own. The total combines covered stat and gem multipliers; section percentages are not additive.</p>
			{/if}
			{#each analysis.estimate.limitations ?? [] as limitation}<p class="mt-2 text-xs text-amber-300">{limitation}</p>{/each}
		</section>
		<section class={panel} aria-label="Skill weights">
			<h2 class="font-semibold">Skill weights from the sample</h2>
			<p class="mt-1 text-xs text-surface-400">Gem estimates use recorded damage shares. Cooldown use estimates extra casts.</p>
			<table class="mt-3 w-full text-left text-sm">
				<thead class="text-xs text-surface-400"><tr><th class="pb-2 font-normal">Gem skill</th><th class="pb-2 text-right font-normal">Damage share</th><th class="pb-2 text-right font-normal">Cooldown use</th></tr></thead>
				<tbody>{#each gemSkills as id}<tr class="border-t border-surface-800"><td class="py-2 pr-2">{GEM_SKILLS[id]?.[0] ?? `Skill ${id}`}</td><td class="text-right tabular-nums">{analysis.target.skillShares[id] === undefined ? 'Unknown' : `${analysis.target.skillShares[id].toFixed(1)}%`}</td><td class="text-right tabular-nums">{analysis.target.skillCooldownUse[id] === undefined ? 'Unknown' : `${analysis.target.skillCooldownUse[id].toFixed(1)}%`}</td></tr>{/each}</tbody>
			</table>
		</section>
	</div>
	<section id="dps-log-import" class="mt-4 {panel}" aria-label="DPS log sample">
		<h2 class="mb-3 font-semibold">Choose your raid sample</h2>
		{#key key}<LogsImport characterName={character.name} characterKey={key} onapply={() => {}} />{/key}
	</section>
{:else}
	<h1 class="text-2xl font-semibold">DPS workspace</h1>
	<p class="mt-2 text-surface-300">Load a character and make changes in Simulator. Return here to analyze the saved plan with your raid logs.</p>
	<a href="/" class="mt-4 inline-block rounded-lg bg-accent-700 px-4 py-2 font-semibold text-white">Load a character →</a>
{/if}
