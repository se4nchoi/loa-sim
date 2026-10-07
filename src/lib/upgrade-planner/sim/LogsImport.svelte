<!--
	Fill skill damage shares from the player's own LOA Logs database (encounters.db), read locally in a worker.
-->
<script lang="ts">
	import { LoaLogsReader, RANGE_LABELS, rangeOf, type EncounterRow, type RangePreset, type SkillShare } from '$lib/logs/loa-logs';
	import { onDestroy } from 'svelte';
	import { iconUrl } from '../icons';
	import Segmented from './Segmented.svelte';
	import { btnAccent, selectClass } from './ui';

	let { characterName, onapply }: { characterName?: string; onapply: (shares: Record<number, number>) => void } = $props();

	let reader: LoaLogsReader | null = null;
	let encounters = $state<EncounterRow[] | null>(null);
	let fileName = $state('');
	let loading = $state(false);
	let error = $state<string | null>(null);

	let player = $state('');
	let boss = $state('');
	let range = $state<RangePreset>('last-2-weeks');
	let limit = $state(0);
	let clearedOnly = $state(true);
	let result = $state<{ runs: number; shares: SkillShare[] } | null>(null);

	onDestroy(() => reader?.close());

	async function pick(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		error = null;
		loading = true;
		result = null;
		try {
			reader ??= new LoaLogsReader();
			encounters = await reader.open(file);
			fileName = file.name;
			const players = playerList(encounters);
			player = players.find((p) => p.name.toLowerCase() === characterName?.toLowerCase())?.name ?? players[0]?.name ?? '';
			boss = '';
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
			encounters = null;
		} finally {
			loading = false;
		}
	}

	const playerList = (rows: EncounterRow[]) => {
		const m = new Map<string, number>();
		for (const r of rows) if (r.player) m.set(r.player, (m.get(r.player) ?? 0) + 1);
		return [...m.entries()].map(([name, runs]) => ({ name, runs })).sort((a, b) => b.runs - a.runs);
	};
	const players = $derived(encounters ? playerList(encounters) : []);
	const bosses = $derived.by(() => {
		const m = new Map<string, number>();
		for (const r of encounters ?? []) if (r.player === player && r.boss) m.set(r.boss, (m.get(r.boss) ?? 0) + 1);
		return [...m.entries()].sort((a, b) => b[1] - a[1]);
	});
	const selected = $derived.by(() => {
		const [from, to] = rangeOf(range);
		const rows = (encounters ?? []).filter(
			(r) => r.player === player && (!boss || r.boss === boss) && r.start >= from && r.start < to && (!clearedOnly || r.cleared !== false)
		);
		return limit > 0 ? rows.slice(0, limit) : rows;
	});

	// Recompute shares whenever the selection changes.
	let seq = 0;
	$effect(() => {
		const ids = selected.map((r) => r.id);
		const who = player;
		if (!reader || !who || !ids.length) {
			result = null;
			return;
		}
		const mine = ++seq;
		reader
			.shares(who, ids)
			.then((r) => mine === seq && (result = r))
			.catch((err) => mine === seq && (error = err.message));
	});

	const RANGE_OPTIONS = (Object.keys(RANGE_LABELS) as RangePreset[]).map((v) => ({ value: v, label: RANGE_LABELS[v] }));
	const iconOf = (icon: string) => (icon ? iconUrl(icon.replace(/\.png$/i, '').split('/').pop()) : undefined);
</script>

<div class="flex flex-col gap-2 rounded-xs border border-surface-700 bg-surface-950/60 p-2.5">
	<div class="flex flex-row flex-wrap items-center gap-2">
		<span class="text-sm font-semibold text-surface-100">Load shares from LOA Logs</span>
		<label class="{btnAccent} cursor-pointer">
			{encounters ? 'Choose another file' : 'Choose encounters.db'}
			<input type="file" accept=".db,.sqlite,application/octet-stream" class="hidden" onchange={pick} />
		</label>
		{#if loading}<span class="text-xs text-surface-400">Reading…</span>{/if}
		{#if fileName && !loading}<span class="text-xs text-surface-400">{fileName} · {encounters?.length ?? 0} logs</span>{/if}
	</div>
	{#if !encounters}
		<p class="text-xs text-surface-400">
			In LOA Logs open <b>Settings → Database → Open folder</b> and pick <code>encounters.db</code> (close LOA Logs first).
			It's read on your computer only; nothing is uploaded. Logs you uploaded to lostark.bible are in this file too.
		</p>
	{/if}
	{#if error}<p class="text-xs text-red-400">{error}</p>{/if}

	{#if encounters}
		<div class="flex flex-row flex-wrap items-center gap-2">
			<select class={selectClass(false)} bind:value={player} aria-label="Character">
				{#each players as p (p.name)}<option value={p.name}>{p.name} ({p.runs})</option>{/each}
			</select>
			<select class={selectClass(false)} bind:value={boss} aria-label="Raid">
				<option value="">All raids</option>
				{#each bosses as [b, n] (b)}<option value={b}>{b} ({n})</option>{/each}
			</select>
			<label class="flex items-center gap-1.5 text-xs text-surface-300">
				<input type="checkbox" bind:checked={clearedOnly} class="accent-accent-500" /> Cleared only
			</label>
		</div>
		<div class="flex flex-row flex-wrap items-center gap-2">
			<Segmented value={range} options={RANGE_OPTIONS} onselect={(v) => (range = v)} label="Time range" size="h-7 px-2 text-xs" />
			<label class="flex items-center gap-1 text-xs text-surface-300">
				Last
				<input
					type="number"
					min="0"
					class="h-7 w-14 rounded-xs border border-surface-600 bg-surface-800 px-1.5 text-right text-sm focus:border-accent-500 focus:outline-none"
					bind:value={limit}
					aria-label="Use only the most recent runs (0 = all)"
				/>
				runs <span class="text-surface-500">(0 = all)</span>
			</label>
		</div>
		<div class="text-xs text-surface-400">
			{selected.length} run{selected.length === 1 ? '' : 's'} selected · pick a range after your last build change
		</div>
		{#if result && result.runs}
			<div class="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-0.5">
				{#each result.shares.slice(0, 12) as s (s.id)}
					{#if iconOf(s.icon)}<img src={iconOf(s.icon)} alt="" class="size-5 rounded-xs" />{:else}<span></span>{/if}
					<span class="truncate text-xs text-surface-200">{s.name}</span>
					<span class="text-right text-xs tabular-nums text-surface-100">{s.pct.toFixed(1)}%</span>
				{/each}
			</div>
			<div class="flex flex-row items-center gap-2">
				<button
					type="button"
					class={btnAccent}
					onclick={() => onapply(Object.fromEntries(result!.shares.map((s) => [s.id, Number(s.pct.toFixed(2))])))}
				>
					Use these shares
				</button>
				<span class="text-xs text-surface-400">Average over {result.runs} run{result.runs === 1 ? '' : 's'}</span>
			</div>
		{:else if selected.length}
			<span class="text-xs text-surface-400">Calculating…</span>
		{/if}
	{/if}
</div>
