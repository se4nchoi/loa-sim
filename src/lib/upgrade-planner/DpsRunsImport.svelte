<!--
	Imports every cleared run of one character from the player's LOA Logs encounters.db into this browser.
	The file is read locally in a worker; only compact per-run summaries are kept.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import { LoaLogsReader, type EncounterRow } from '$lib/logs/loa-logs';
	import { saveRuns, type RunsBook } from '$lib/logs/runs-store.svelte';

	let { characterKey, characterName, ondone }: { characterKey: string; characterName: string; ondone?: (book: RunsBook) => void } = $props();

	let reader: LoaLogsReader | null = null;
	let encounters = $state<EncounterRow[] | null>(null);
	let fileName = $state('');
	let player = $state('');
	let busy = $state<string | null>(null);
	/** Older runs were on older gear and fights; they also fill browser storage. */
	let weeks = $state(8);
	let error = $state<string | null>(null);
	let outcome = $state('all');
	let maxRuns = $state(50);

	const players = $derived.by(() => {
		const counts = new Map<string, number>();
		for (const e of encounters ?? []) if (e.player) counts.set(e.player, (counts.get(e.player) ?? 0) + 1);
		return [...counts].sort((a, b) => b[1] - a[1]);
	});
	const since = $derived(weeks ? Date.now() - weeks * 7 * 86_400_000 : 0);
	const clears = $derived((encounters ?? []).filter(e => e.player === player && e.start >= since && e.duration > 0 &&
		(outcome === 'all' || outcome === 'clear' && e.cleared === true || outcome === 'failed' && e.cleared === false))
		.toSorted((a, b) => b.start - a.start).slice(0, maxRuns));

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
			busy = null;
			// Let the player choose outcomes and a bounded number of attempts before reading the run data.
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
</script>

<div class="space-y-3 text-sm">
	<label class="block">
		<span class="text-surface-300">Upload <code class="text-surface-100">encounters.db</code></span>
		<input type="file" accept=".db" class="mt-1 block w-full text-xs text-surface-300 file:mr-3 file:rounded-xs file:border-0 file:bg-accent-700 file:px-3 file:py-1.5 file:text-white" onchange={open} />
	</label>
	{#if encounters}
		<div class="flex flex-wrap items-center gap-3">
			<label class="flex items-center gap-2">Recorded as
				<select class="rounded-xs border border-surface-600 bg-surface-800 px-2 py-1" bind:value={player}>
					{#each players as [name, count]}<option value={name}>{name} · {count} runs</option>{/each}
				</select>
			</label>
			<label class="flex items-center gap-2">From
				<select class="rounded-xs border border-surface-600 bg-surface-800 px-2 py-1" bind:value={weeks}>
					{#each [[4, 'Last 4 weeks'], [8, 'Last 8 weeks'], [12, 'Last 12 weeks'], [0, 'All time']] as [value, label]}<option {value}>{label}</option>{/each}
				</select>
			</label>
			<label class="flex items-center gap-2">Outcome <select class="rounded-xs border border-surface-600 bg-surface-800 px-2 py-1" bind:value={outcome}><option value="all">All runs</option><option value="clear">Cleared runs</option><option value="failed">Failed runs</option></select></label>
			<label class="flex items-center gap-2">Newest <select class="rounded-xs border border-surface-600 bg-surface-800 px-2 py-1" bind:value={maxRuns}>{#each [10, 25, 50, 100, 200] as count}<option value={count}>{count} runs</option>{/each}</select></label>
			<button class="h-7 rounded-xs bg-accent-700 px-2.5 text-xs font-semibold text-white hover:bg-accent-600 disabled:opacity-50" disabled={!clears.length || !!busy} onclick={importRuns}>Import {clears.length} {clears.length === 1 ? 'run' : 'runs'}</button>
		</div>
		{#if player && player.toLowerCase() !== characterName.toLowerCase()}<p class="text-xs text-amber-300">{player} isn't {characterName}. Its skill shares won't match this character's gems.</p>{/if}
	{/if}
	{#if busy}<p class="text-xs text-sky-300">{busy}</p>{/if}
	{#if error}<p class="text-xs text-red-400">{error}</p>{/if}
</div>
