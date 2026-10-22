<script lang="ts">
	import { onDestroy } from 'svelte';
	import { LoaLogsReader } from '$lib/logs/loa-logs';
	import type { ReplayRun, RunSummary } from '$lib/logs/protocol';
	import { checkpointEstimate } from './dps-checkpoint';
	import type { DamageContext } from './dps-stat-engine';
	import type { SimState } from './simulate';
	import type { Loadout } from './types';
	import { formatDamage } from './dps-comparison';
	let {run, loadout, baseline, simState, context, ready}: {run: RunSummary; loadout: Loadout; baseline: SimState; simState: SimState; context: DamageContext | null; ready: boolean} = $props();
	let reader: LoaLogsReader | null = null;
	let replay = $state.raw<ReplayRun | null>(null);
	let busy = $state(false), error = $state('');
	let start = $state(0), end = $state(0), targetDps = $state<number | undefined>();
	$effect(() => { end = run.duration / 1000; start = 0; replay = null; targetDps = undefined; });
	const result = $derived(replay && ready && targetDps ? checkpointEstimate(replay, start * 1000, end * 1000,
		targetDps * 1_000_000 * (end - start), loadout, baseline, simState, context ?? undefined) : null);
	async function open(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file || busy) return;
		busy = true; error = ''; const selected = run;
		try {
			reader?.close(); reader = new LoaLogsReader();
			const encounters = await reader.open(file);
			if (!encounters.some((r) => r.id === selected.id && r.start === selected.start && r.boss === selected.boss && r.player.toLowerCase() === selected.player.toLowerCase()))
				throw new Error('Choose the database containing this exact attempt.');
			const found = (await reader.replay(selected.player, [selected.id]))[0];
			if (!found?.hits.length) throw new Error('This attempt has no retained hit timeline, or exceeds the timeline reader limit.');
			if (run.id === selected.id && run.start === selected.start) replay = found;
		} catch (e) { error = e instanceof Error ? e.message : String(e); }
		finally { busy = false; }
	}
	onDestroy(() => reader?.close());
</script>

<details class="mt-3 rounded-xs border border-surface-700 p-3 text-xs">
	<summary class="cursor-pointer font-semibold text-surface-100">Damage checkpoint</summary>
	<p class="mt-2 text-surface-300">Choose a time window and your personal DPS target. Reopen the local logs file to read this attempt's hit timeline; nothing is uploaded.</p>
	<input class="mt-2 block w-full text-surface-300" aria-label="Checkpoint logs database" type="file" accept=".db" onchange={open} disabled={busy} />
	{#if busy}<p class="mt-2 text-sky-300">Reading attempt timeline…</p>{/if}
	{#if error}<p role="alert" class="mt-2 text-amber-300">{error}</p>{/if}
	{#if replay}
		<div class="mt-3 grid grid-cols-3 gap-2">
			<label>Start (seconds)<input class="mt-1 w-full border border-surface-600 bg-surface-800 p-1" type="number" min="0" step="0.1" bind:value={start} /></label>
			<label>End (seconds)<input class="mt-1 w-full border border-surface-600 bg-surface-800 p-1" type="number" min="0" step="0.1" max={run.duration / 1000} bind:value={end} /></label>
			<label>Personal target (million DPS)<input class="mt-1 w-full border border-surface-600 bg-surface-800 p-1" type="number" min="0" step="any" bind:value={targetDps} /></label>
		</div>
		{#if !ready}<p class="mt-2 text-amber-300">Confirm equipment for this attempt first.</p>
		{:else if result}
			<div class="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm tabular-nums"><span>Observed <strong>{formatDamage(result.observed)}</strong></span><span>Estimated <strong class="text-sky-300">{result.estimated === null ? 'Unknown' : formatDamage(result.estimated)}</strong></span><span>Target <strong>{formatDamage(result.target)}</strong></span></div>
			{#if result.remaining !== null}<p class="mt-2 text-sm {result.remaining > 0 ? 'text-amber-300' : 'text-green-400'}">{result.remaining > 0 ? `${formatDamage(result.remaining)} damage below target` : result.coveragePct >= 99.9 ? 'Estimated target reached under these assumptions' : 'Tracked hits alone reach the target under these assumptions'}</p>{/if}
			{#each result.notes as note}<p class="mt-1 text-amber-300">{note}</p>{/each}
		{:else}<p class="mt-2 text-surface-400">Enter a positive target and a valid window within this recorded attempt.</p>{/if}
		<p class="mt-2 text-surface-400">Uses configured combat totals throughout the window and recorded hit timing. No extra casts or damage after the attempt are projected. This is a personal target, not a group-clear prediction.</p>
	{/if}
</details>
