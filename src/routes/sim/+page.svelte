<script lang="ts">
	import { savedSimulations } from '$lib/upgrade-planner/saved-simulations';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import CharacterSwitcher from '$lib/CharacterSwitcher.svelte';
	import CharacterView from '$lib/demo/CharacterView.svelte';
	import type { LoadoutKind } from '$lib/bible-data';
	import { characterKey, eraseSnapshot, loadSavedCharacter, rememberViewed, setLoadoutKind, setSnapshot } from '$lib/saved-character';
	import { gearKey, gearOf, listSnapshots, recordSnapshots } from '$lib/snapshot-history';
	import { loadCharacter } from '$lib/load-character';
	import { onMount } from 'svelte';

	// ?c=na/soulshan picks a saved character; without it (the Simulator tab), the one last viewed here.
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

	onMount(() => {
		if (!saved) goto('/', { replaceState: true });
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
		saved ? [saved.header?.guild?.name ?? '', `Snapshot loaded ${new Date(build?.savedAt ?? saved.savedAt).toLocaleString()}`] : []
	);
</script>

{#if saved}
 {#if build}<div class="mb-3 flex flex-wrap items-center gap-3 text-sm"><span class="font-semibold text-accent-200">Build: {build.name}</span><a class="text-surface-300 underline" href={`/sim?c=${encodeURIComponent(characterKey(saved))}`}>Back to character</a></div>
 {:else if buildId}<p class="mb-3 text-sm text-surface-300">This saved build is no longer available. Showing your character.</p>{/if}
	<CharacterSwitcher current={characterKey(saved)} />
	{#key `${saved.region}/${saved.name}:${build?.id ?? "character"}`}
		<CharacterView initialBuild={build} name={saved.name} region={saved.region} {subtitle} itemLevel={build ? build.loadout.itemLevel : saved.header?.ilvl} loadout={saved.loadout}
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
{/if}
