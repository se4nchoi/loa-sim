<!--
	Imports one character's runs from the player's LOA Logs encounters.db into this browser, in three steps: the file,
	which runs, and which Ark Grid build (the runs' Order cores, read off each run's gear snapshot).
	The file is read locally in a worker; only compact per-run summaries are kept.
-->
<script lang="ts">
	import { onDestroy, untrack } from 'svelte';
	import { LoaLogsReader, type EncounterRow, type RunGear } from '$lib/logs/loa-logs';
	import { saveRuns, type RunsBook } from '$lib/logs/runs-store.svelte';
	import { isSnapshotHash, type ClearSnapshot } from '$lib/bible-data';
	import { clearSnapshot, orderCoreKey, snapshotFitsRun } from './clear-snapshots';
	import { CORE_NAMES } from './game-data';
	import { GRADE_GRADIENTS } from './icons';
	import Segmented from './sim/Segmented.svelte';
	import Spinner from './sim/Spinner.svelte';

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

	// Each picked run's build (gear snapshot hash, Order core grades, spec), read from the file once step 2 picks the runs
	// (the listing leaves them out: reading them for every run in the file is what made opening it slow).
	let gearById = $state<Record<number, RunGear>>({});
	let gearKey = $state('');
	const missingHashes = $derived(ranged.filter((e) => !(e.id in gearById)).map((e) => e.id));
	$effect(() => {
		const ids = missingHashes, who = player, key = `${who}:${ids.join(',')}`;
		if (!ids.length || !reader || untrack(() => gearKey) === key) return;
		gearKey = key;
		reader.gear(who, ids).then((g) => { if (player === who) gearById = { ...gearById, ...g }; }, (err: unknown) => {
			error = err instanceof Error ? err.message : String(err);
		});
	});

	// Each snapshot's Order cores and Ark Passive (to check it's the setup a run was played on); '?' cores when it
	// couldn't be read.
	const UNKNOWN = '?';
	type SnapInfo = { cores: string; arkPassive: ClearSnapshot['arkPassive'] };
	let snapCores = $state<Record<string, SnapInfo>>({});
	const hashOf = (e: EncounterRow) => { const h = gearById[e.id]?.hash; return h && isSnapshotHash(h) ? h : null; };
	/** Builds change rarely; past this many distinct snapshots the rest count as unknown. */
	const MAX_SNAPSHOTS = 40;
	const hashes = $derived([...new Set(ranged.map(hashOf).filter((h): h is string => !!h))].slice(0, MAX_SNAPSHOTS));
	const pending = $derived(hashes.filter((h) => !(h in snapCores)).length + (missingHashes.length ? 1 : 0));
	$effect(() => {
		const all = hashes;
		const todo = untrack(() => all.filter((h) => !(h in snapCores)));
		if (!todo.length) return;
		let live = true;
		const next = async () => {
			for (let h = todo.shift(); h && live; h = todo.shift()) {
				const info: SnapInfo = await clearSnapshot(h).then(
					(s) => ({ cores: orderCoreKey((s.arkGridCores ?? []).map((c) => c.id)), arkPassive: s.arkPassive ?? null }),
					() => ({ cores: UNKNOWN, arkPassive: null })
				);
				if (live) snapCores[h] = info;
			}
		};
		// A few at a time: one request per snapshot, to an API that isn't ours.
		for (let i = 0; i < 3; i++) next();
		return () => { live = false; };
	});
	// A build: its Order cores (from the snapshot) and its enlightenment spec, which plays the same cores differently.
	const SEP = '|';
	/** The run's cores from its own snapshot; null when it has none, or keeps another setup (snapshotFitsRun). */
	const ownCores = (e: EncounterRow) => {
		const info = snapCores[hashOf(e) ?? ''];
		if (!info || info.cores === UNKNOWN) return null;
		return snapshotFitsRun({ arkPassive: info.arkPassive } as ClearSnapshot, gearById[e.id]?.enlightenment) ? info.cores : null;
	};
	// A run whose snapshot is another setup (lostark.bible's highest-CP one) was played on its spec's cores: the ones
	// that spec's runs with a fitting snapshot used most.
	const specCores = $derived.by(() => {
		const counts = new Map<string, Map<string, number>>();
		for (const e of ranged) {
			const c = ownCores(e), spec = gearById[e.id]?.spec ?? '';
			if (c === null) continue;
			const m = counts.get(spec) ?? counts.set(spec, new Map()).get(spec)!;
			m.set(c, (m.get(c) ?? 0) + 1);
		}
		return new Map([...counts].map(([spec, m]) => [spec, [...m].toSorted((a, b) => b[1] - a[1])[0][0]]));
	});
	const buildOf = (e: EncounterRow) => {
		const spec = gearById[e.id]?.spec ?? '';
		const coreKey = ownCores(e) ?? (hashOf(e) && snapCores[hashOf(e)!] ? specCores.get(spec) : undefined);
		return coreKey !== undefined && coreKey !== null ? `${coreKey}${SEP}${spec}` : UNKNOWN;
	};
	const coresOf = (key: string) => key.split(SEP)[0];
	const SHAPE_ORDER = ['sun', 'moon', 'star'] as const;
	/** LOA Logs' core grade numbers, as in its tooltip (badge colours: lostark.bible's grade backgrounds, Epic = 3). */
	const GRADES: Record<number, string> = { 1: 'Epic', 2: 'Legendary', 3: 'Relic', 4: 'Ancient' };
	/** The build's cores, sun → moon → star (the id's fifth digit), with the grade LOA Logs recorded for each. */
	const coreParts = (key: string, order: RunGear['order']) =>
		coresOf(key).split(',').filter(Boolean)
			.map((p) => ({ shape: SHAPE_ORDER[Number(p[4])], name: CORE_NAMES[p] ?? p }))
			.sort((a, b) => SHAPE_ORDER.indexOf(a.shape) - SHAPE_ORDER.indexOf(b.shape))
			.map((c) => ({ ...c, grade: c.shape ? order?.[c.shape] : undefined }));
	const builds = $derived.by(() => {
		const groups = new Map<string, EncounterRow[]>();
		for (const e of ranged) (groups.get(buildOf(e)) ?? groups.set(buildOf(e), []).get(buildOf(e))!).push(e);
		return [...groups].map(([key, runs]) => ({
			key, count: runs.length, newest: runs[0].start,
			spec: key === UNKNOWN ? null : key.split(SEP)[1] || null,
			// The cores' grades as of the newest run that recorded them.
			order: runs.map((e) => gearById[e.id]?.order).find((o) => o && Object.keys(o).length) ?? null
		})).sort((a, b) => (a.key === UNKNOWN ? 1 : b.key === UNKNOWN ? -1 : b.newest - a.newest));
	});
	const known = $derived(builds.filter((b) => b.key !== UNKNOWN));
	// Default: the loadout's cores, in the spec played most on them.
	const current = $derived(known.filter((b) => coresOf(b.key) === cores).toSorted((a, b) => b.count - a.count)[0]?.key);
	const picked = $derived(build ?? current ?? 'all');
	const clears = $derived(ranged.filter((e) => picked === 'all' || buildOf(e) === picked).slice(0, maxRuns));

	async function open(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		error = null;
		busy = `Opening ${file.name} (${(file.size / 1e9 >= 1 ? `${(file.size / 1e9).toFixed(1)} GB` : `${Math.max(1, Math.round(file.size / 1e6))} MB`)})…`;
		try {
			reader ??= new LoaLogsReader();
			encounters = await reader.open(file);
			fileName = file.name;
			const own = players.find(([name]) => name.toLowerCase() === characterName.toLowerCase());
			player = own?.[0] ?? players[0]?.[0] ?? '';
			build = null;
			gearById = {};
			gearKey = '';
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = null;
		}
	}

	async function importRuns() {
		if (!reader || !clears.length) return;
		error = null;
		busy = `Reading ${clears.length.toLocaleString()} ${clears.length === 1 ? 'run' : 'runs'}…`;
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
						{#each players as [name, count]}<option value={name}>{name} · {count} {count === 1 ? 'run' : 'runs'}</option>{/each}
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
						<span class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
							{#if b.key === 'all'}Every build
							{:else if b.key === UNKNOWN}No gear snapshot
							{:else if !coresOf(b.key)}No Order cores
							{:else}
								{#each coreParts(b.key, 'order' in b ? b.order : null) as c (c.name)}
									<span class="flex items-center gap-1 whitespace-nowrap">{#if c.grade !== undefined && GRADES[c.grade]}<span class="flex size-4 items-center justify-center rounded-xs text-[10px] font-bold text-white tabular-nums" style:background={GRADE_GRADIENTS[c.grade + 2]} title={GRADES[c.grade]}>{c.grade}</span>{/if}{c.name}</span>
								{/each}
							{/if}
							{#if 'spec' in b && b.spec}<span class="whitespace-nowrap text-sky-300">{b.spec}</span>{/if}
						</span>
						{#if 'key' in b && b.key !== 'all' && b.key !== UNKNOWN && coresOf(b.key) === cores}<span class="rounded-xs bg-accent-700/30 px-1.5 text-[10px] font-semibold text-accent-200">Current</span>{/if}
						<span class="tabular-nums text-surface-400">{b.count} {b.count === 1 ? 'run' : 'runs'}</span>
					</button>
				{/each}
			</div>
			<div class="flex items-center gap-3">
				<button class="h-8 rounded-xs bg-accent-700 px-3 text-xs font-semibold text-white hover:bg-accent-600 disabled:opacity-50" disabled={!clears.length || !!busy || pending > 0} onclick={importRuns}>Import {clears.length} {clears.length === 1 ? 'run' : 'runs'}</button>
				{#if missingHashes.length}<span class="flex items-center gap-2 text-xs text-surface-300" role="status"><Spinner class="size-3.5 text-accent-400" />Reading gear for {ranged.length.toLocaleString()} {ranged.length === 1 ? 'run' : 'runs'}…</span>
				{:else if pending}<span class="flex items-center gap-2 text-xs text-surface-300" role="status"><Spinner class="size-3.5 text-accent-400" />Loading gear snapshots… {hashes.length - pending}/{hashes.length}</span>{/if}
			</div>
		{/if}
	</section>
	{#if busy}<p class="flex items-center gap-2 text-xs text-surface-300" role="status"><Spinner class="size-3.5 text-accent-400" />{busy}</p>{/if}
	{#if error}<p class="text-xs text-red-400">{error}</p>{/if}
</div>
