<script lang="ts">
	import { savedSimulations } from '$lib/upgrade-planner/saved-simulations';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import CharacterSwitcher from '$lib/CharacterSwitcher.svelte';
	import CharacterView from '$lib/character/CharacterView.svelte';
	import { parseCharacterInput, type LoadoutKind } from '$lib/bible-data';
	import { characterKey, eraseSnapshot, loadSavedCharacter, rememberViewed, setLoadoutKind, setSnapshot } from '$lib/saved-character';
	import { gearKey, gearOf, listSnapshots, recordSnapshots } from '$lib/snapshot-history';
	import { loadCharacter } from '$lib/load-character';
	import { untrack } from 'svelte';
	import { formatDateTime } from '$lib/upgrade-planner/format';

	let { dpsMode = false }: { dpsMode?: boolean } = $props();

	// Shared links also load characters this browser hasn't saved yet.
	let switched = $state<ReturnType<typeof loadSavedCharacter>>(null);
	const wanted = $derived(page.url.searchParams.get('c'));
	// After a loadout switch, show the updated save, but only for the character it was made on.
	const normalSaved = $derived(
		switched && (!wanted || characterKey(switched) === wanted.toLowerCase()) ? switched : loadSavedCharacter(wanted)
	);
 const buildId = $derived(page.url.searchParams.get('build'));
 const build = $derived(buildId && wanted ? savedSimulations(wanted).find(s => s.id === buildId) : undefined);
 const saved = $derived(build && normalSaved ? {...normalSaved, loadout: build.loadout, loadouts: undefined, snapshotId: undefined} : normalSaved);

	/** Estimated raid loadout ↔ latest raid snapshot; remembered for the character. */
	const onloadout = (kind: LoadoutKind) => {
		if (saved) switched = setLoadoutKind(characterKey(saved), kind) ?? switched;
	};

	/** An earlier kept snapshot; remembered for the character until it's switched back or loaded again. */
	const onsnapshot = (id: string) => {
		if (saved) switched = setSnapshot(characterKey(saved), id) ?? switched;
	};
	/** Erases a kept snapshot (the × in the loadout menu). */
	let erased = $state(0);
	const onerase = (id: string) => {
		if (!saved) return;
		switched = eraseSnapshot(characterKey(saved), id) ?? switched;
		erased++;
	};
	// Kept snapshots other than bible's two current loadouts. Characters saved before history existed start theirs here.
	let older = $state<ReturnType<typeof listSnapshots>>([]);
	$effect(() => {
		void erased;
		if (!saved) return;
		const key = characterKey(saved);
		rememberViewed(key);
		if (build) { older = []; return; }
		recordSnapshots(key, saved, saved.savedAt);
		// The chosen snapshot can be folded into a copy of the same gear: go back to bible's loadout then.
		if (saved.snapshotId && !listSnapshots(key).some((s) => s.id === saved.snapshotId)) {
			switched = eraseSnapshot(key, saved.snapshotId) ?? switched;
			return;
		}
		// Same gear as one of bible's two (re-snapshotted unchanged) isn't listed twice.
		const listed = new Set((['current', 'estimated'] as const).flatMap((k) => (saved.loadouts?.[k] ? [gearKey(saved.loadouts[k]!)] : [])));
		older = listSnapshots(key).filter((s) => !listed.has(gearOf(s)) || s.id === saved.snapshotId);
	});

	let loadingCharacter = $state(false);
	let loadError = $state<string | null>(null);
	let retry = $state(0);
	$effect(() => {
		const key = wanted;
		void retry;
		loadError = null;
		loadingCharacter = false;
		if (untrack(() => loadSavedCharacter(key))) return;
		if (!key) {
			if (!dpsMode) void goto('/', { replaceState: true });
			return;
		}
		const parts = key.split('/');
		const target = parts.length === 2
			? parseCharacterInput(`https://lostark.bible/character/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[1])}`, 'NA')
			: null;
		if (!target) {
			loadError = 'This character link is invalid.';
			return;
		}
		let active = true;
		loadingCharacter = true;
		void loadCharacter(target.region, target.name).then(() => {
			if (active) switched = loadSavedCharacter(key);
		}).catch((e) => {
			if (active) loadError = e instanceof Error ? e.message : String(e);
		}).finally(() => {
			if (active) loadingCharacter = false;
		});
		return () => { active = false; };
	});

	/** ↻ by the snapshot picker: loads bible's latest (one request, this click); true when it's gear not kept here yet. */
	async function onreload() {
		if (!saved) return false;
		const key = characterKey(saved);
		const known = new Set([
			...listSnapshots(key).map(gearOf),
			...(['current', 'estimated'] as const).flatMap((k) => (saved.loadouts?.[k] ? [gearKey(saved.loadouts[k]!)] : []))
		]);
		const data = await loadCharacter(saved.region, saved.name);
		switched = loadSavedCharacter(key);
		erased++; // refresh the snapshot list
		return (['current', 'estimated'] as const).some((k) => data.loadouts?.[k] && !known.has(gearKey(data.loadouts[k]!)));
	}

	const subtitle = $derived(
		saved ? [saved.header?.guild?.name ?? '', `Snapshot loaded ${formatDateTime(build?.savedAt ?? saved.savedAt)}`] : []
	);
</script>

{#if loadingCharacter}
	<p role="status" class="text-sm text-surface-300">Loading character from lostark.bible…</p>
{:else if loadError}
	<div class="space-y-3 text-sm">
		<p role="alert" class="text-red-400">{loadError}</p>
		<button type="button" class="text-surface-200 underline hover:text-surface-50" onclick={() => retry++}>Try again</button>
		<a href="/" class="ml-4 text-surface-300 underline hover:text-surface-50">Choose a character</a>
	</div>
{:else if saved}
 {#if build}<div class="mb-3 flex flex-wrap items-center gap-3 text-sm"><span class="font-semibold text-accent-200">Build: {build.name}</span><a class="text-surface-300 underline" href={`/sim?c=${encodeURIComponent(characterKey(saved))}`}>Back to character</a></div>
 {:else if buildId}<p class="mb-3 text-sm text-surface-300">This saved build is no longer available. Showing your character.</p>{/if}
	<CharacterSwitcher current={characterKey(saved)} simulatorPath={dpsMode ? '/dps' : '/sim'} />
	{#key `${saved.region}/${saved.name}:${build?.id ?? "character"}`}
		<CharacterView {dpsMode} initialBuild={build} name={saved.name} region={saved.region} {subtitle} itemLevel={build ? build.loadout.itemLevel : saved.header?.ilvl} loadout={saved.loadout}
			cpDistribution={build ? null : saved.cpDistribution}
			loadouts={saved.loadouts}
			loadoutKind={saved.loadoutKind}
			estimatedFrom={saved.estimatedAt && saved.estimatedAt < saved.savedAt ? saved.estimatedAt : undefined}
			onloadout={build ? undefined : onloadout}
			{older}
			snapshotId={saved.snapshotId}
			{onsnapshot}
			{onerase}
			onreload={build ? undefined : onreload}
		/>
	{/key}
{:else if dpsMode}
	<h1 class="text-xl font-semibold">DPS Sim <span class="text-sm text-amber-300">Experimental</span></h1>
	<p class="mt-2 text-surface-300">Load a character, then import your LOA Logs to test DPS estimates for upgrades.</p>
	<a href="/" class="mt-4 inline-block rounded-xs bg-accent-700 px-3 py-2 font-semibold text-white hover:bg-accent-600">Load a character</a>
{/if}
