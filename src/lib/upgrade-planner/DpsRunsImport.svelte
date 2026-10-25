<!--
	Imports one character's runs from the player's LOA Logs encounters.db into this browser, in three steps: the file,
	which runs, and which Ark Grid build (the runs' Order cores, read off each run's gear snapshot).
	The file is read locally in a worker; only compact per-run summaries are kept.
-->
<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { LoaLogsReader, type EncounterRow } from '$lib/logs/loa-logs';
	import { saveRuns, type RunsBook } from '$lib/logs/runs-store.svelte';
	import { isSnapshotHash } from '$lib/bible-data';
	import { clearSnapshot, orderCoreKey } from './clear-snapshots';
	import { CORE_NAMES } from './game-data';
	import Segmented from './sim/Segmented.svelte';

	let { characterKey, characterName, cores = '', ondone }: {
		characterKey: string; characterName: string;
		/** The loadout's Order cores (orderCoreKey), to preselect runs on the same build. */
		cores?: string;
		ondone?: (book: RunsBook) => void;
	} = $props();

	let reader: LoaLogsReader | null = null;
	let encounters = $state<EncounterRow[] | null>(null);
	let fileName = $state('');
	let player = $state('');
	let busy = $state<string | null>(null);
	/** Older runs were on older gear and fights; they also fill browser storage. */
	let weeks = $state(8);
	let error = $state<string | null>(null);
	let outcome = $state<'all' | 'clear' | 'failed'>('all');
	let maxRuns = $state(50);
	/** Chosen build: an orderCoreKey, 'all', or null for the default (the loadout's cores when runs have them). */
	let build = $state<string | null>(null);

	const players = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const e of encounters ?? []) if (e.player) counts.set(e.player, (counts.get(e.player) ?? 0) + 1);
		return [...counts].sort((a, b) => b[1] - a[1]);
	});
	const since = $derived(weeks ? Date.now() - weeks * 7 * 86_400_000 : 0);
	const ranged = $derived((encounters ?? []).filter(e => e.player === player && e.start >= since && e.duration > 0 &&
		(outcome === 'all' || outcome === 'clear' && e.cleared === true || outcome === 'failed' && e.cleared === false))
		.toSorted((a, b) => b.start - a.start));

	// Each run's Order cores, by snapshot; '?' when the run has none or it couldn't be read.
	const UNKNOWN = '?';
	let snapCores = $state<Record<string, string>>({});
	const hashOf = (e: EncounterRow) => (e.loadoutHash && isSnapshotHash(e.loadoutHash) ? e.loadoutHash : null);
	/** Builds change rarely; past this many distinct snapshots the rest count as unknown. */
	const MAX_SNAPSHOTS = 40;
	const hashes = $derived([...new Set(ranged.map(hashOf).filter((h): h is string => !!h))].slice(0, MAX_SNAPSHOTS));
	const pending = $derived(hashes.filter((h) => !(h in snapCores)).length);
	$effect(() => {
		const all = hashes;
		const todo = untrack(() => all.filter((h) => !(h in snapCores)));
		if (!todo.length) return;
		let live = true;
		const next = async () => {
			for (let h = todo.shift(); h && live; h = todo.shift()) {
				const key = await clearSnapshot(h).then((s) => orderCoreKey((s.arkGridCores ?? []).map((c) => c.id)), () => UNKNOWN);
				if (live) snapCores[h] = key;
			}
		};
		// A few at a time: one request per snapshot, to an API that isn't ours.
		for (let i = 0; i < 3; i++) next();
		return () => { live = false; };
	});
	const buildOf = (e: EncounterRow) => { const h = hashOf(e); return (h && snapCores[h]) || UNKNOWN; };

	const coreNames = (key: string) => key === UNKNOWN ? 'No gear snapshot' : key ? key.split(',').map((p) => CORE_NAMES[p] ?? p).join(' · ') : 'No Order cores';
	const builds = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const e of ranged) counts.set(buildOf(e), (counts.get(buildOf(e)) ?? 0) + 1);
		return [...counts].map(([key, count]) => ({ key, count, newest: ranged.find((e) => buildOf(e) === key)!.start }))
			.sort((a, b) => (a.key === UNKNOWN ? 1 : b.key === UNKNOWN ? -1 : b.newest - a.newest));
	});
	const known = $derived(builds.filter((b) => b.key !== UNKNOWN));
	const picked = $derived(build ?? (known.some((b) => b.key === cores) ? cores : 'all'));
	const clears = $derived(ranged.filter((e) => picked === 'all' || buildOf(e) === picked).slice(0, maxRuns));

	async function open(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		error = null;
		busy = 'Opening…';
		try {
			reader ??= new LoaLogsReader();
			encounters = await reader.open(file);
			fileName = file.name;
			const own = players.find(([name]) => name.toLowerCase() === characterName.toLowerCase());
			player = own?.[0] ?? players[0]?.[0] ?? '';
			build = null;
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = null;
		}
	}

	async function importRuns() {
		if (!reader || !clears.length) return;
		error = null;
		busy = `Reading ${clears.length} runs…`;
		try {
			const { runs, skills } = await reader.runs(player, clears.map(c => c.id));
			const book: RunsBook = { player, fileName, importedAt: Date.now(), runs, skills };
			if (!saveRuns(characterKey, book)) error = 'Your browser refused to save this many runs. They stay loaded until you close the tab.';
			ondone?.(book);
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = null;
		}
	}
	onDestroy(() => reader?.close());

	const chip = 'h-7 min-w-10 px-2.5 text-xs';
</script>

{#snippet step(n: number, title: string, on: boolean)}
	<h4 class="flex items-center gap-2 text-sm font-semibold {on ? 'text-surface-100' : 'text-surface-500'}">
		<span class="grid size-5 place-items-center rounded-full text-[11px] {on ? 'bg-accent-700 text-white' : 'bg-surface-800 text-surface-500'}">{n}</span>{title}
	</h4>
{/snippet}

<div class="space-y-4 text-sm">
	<section class="space-y-2">
		{@render step(1, 'Upload encounters.db', true)}
		<input type="file" accept=".db" class="block w-full text-xs text-surface-300 file:mr-3 file:rounded-xs file:border-0 file:bg-accent-700 file:px-3 file:py-1.5 file:text-white hover:file:bg-accent-600" onchange={open} />
	</section>

	<section class="space-y-2">
		{@render step(2, 'Pick the runs', !!encounters)}
		{#if encounters}
			<div class="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 text-xs text-surface-400">
				<span>Recorded as</span>
				{#if players.length <= 4}
					<div><Segmented label="Recorded as" size={chip} value={player} options={players.map(([name, count]) => ({ value: name, label: `${name} · ${count}` }))} onselect={(v) => ((player = v), (build = null))} /></div>
				{:else}
					<select class="h-7 w-fit rounded-xs border border-surface-700 bg-surface-950 px-2 text-xs text-surface-100" bind:value={player} onchange={() => (build = null)}>
						{#each players as [name, count]}<option value={name}>{name} · {count} runs</option>{/each}
					</select>
				{/if}
				<span>From</span>
				<div><Segmented label="From" size={chip} value={weeks} options={[{ value: 4, label: '4 weeks' }, { value: 8, label: '8 weeks' }, { value: 12, label: '12 weeks' }, { value: 0, label: 'All time' }]} onselect={(v) => (weeks = v)} /></div>
				<span>Outcome</span>
				<div><Segmented label="Outcome" size={chip} value={outcome} options={[{ value: 'all', label: 'All' }, { value: 'clear', label: 'Cleared' }, { value: 'failed', label: 'Failed' }]} onselect={(v) => (outcome = v)} /></div>
				<span>Newest</span>
				<div><Segmented label="Newest" size={chip} value={maxRuns} options={[10, 25, 50, 100, 200].map((n) => ({ value: n, label: String(n) }))} onselect={(v) => (maxRuns = v)} /></div>
			</div>
			{#if player && player.toLowerCase() !== characterName.toLowerCase()}<p class="text-xs text-amber-300">{player} isn't {characterName}.</p>{/if}
		{/if}
	</section>

	<section class="space-y-2">
		{@render step(3, 'Pick the Ark Grid build', !!encounters)}
		{#if encounters}
			<p class="text-xs text-surface-400">Other Order cores play a different rotation.</p>
			<div class="space-y-1.5" role="radiogroup" aria-label="Ark Grid build">
				{#each [{ key: 'all', count: ranged.length }, ...builds] as b (b.key)}
					{@const on = picked === b.key}
					<button type="button" role="radio" aria-checked={on} disabled={b.key === UNKNOWN}
						class="flex w-full items-center gap-2 rounded-xs border px-2.5 py-1.5 text-left text-xs transition {on ? 'border-accent-600 bg-accent-700/15 text-surface-100' : 'border-surface-700 bg-surface-950 text-surface-300 hover:border-surface-500'} disabled:cursor-default disabled:opacity-60"
						onclick={() => (build = b.key)}>
						<span class="min-w-0 flex-1 truncate">{b.key === 'all' ? 'Every build' : coreNames(b.key)}</span>
						{#if b.key === cores}<span class="rounded-xs bg-accent-700/30 px-1.5 text-[10px] font-semibold text-accent-200">Current</span>{/if}
						<span class="tabular-nums text-surface-400">{b.count} {b.count === 1 ? 'run' : 'runs'}</span>
					</button>
				{/each}
			</div>
			<div class="flex items-center gap-3">
				<button class="h-8 rounded-xs bg-accent-700 px-3 text-xs font-semibold text-white hover:bg-accent-600 disabled:opacity-50" disabled={!clears.length || !!busy || pending > 0} onclick={importRuns}>Import {clears.length} {clears.length === 1 ? 'run' : 'runs'}</button>
				{#if pending}<span class="text-xs text-sky-300">Reading gear snapshots… {hashes.length - pending}/{hashes.length}</span>{/if}
			</div>
		{/if}
	</section>
	{#if busy}<p class="text-xs text-sky-300">{busy}</p>{/if}
	{#if error}<p class="text-xs text-red-400">{error}</p>{/if}
</div>
