<!--
	Fill skill damage shares from the player's own LOA Logs database (encounters.db), read locally in a worker.
-->
<script lang="ts">
	import { LoaLogsReader, RANGE_LABELS, rangeOf, type EncounterRow, type RangePreset, type SkillShare } from '$lib/logs/loa-logs';
	import { raidGateOf } from '$lib/logs/raids';
	import { onDestroy } from 'svelte';
	import { iconUrl } from '../icons';
	import { btnAccent, selectClass } from './ui';

	let {
		characterName,
		onapply
	}: {
		characterName?: string;
		/** Damage share and cooldown use per skill, both in percent. */
		onapply: (shares: Record<number, number>, cooldownUse: Record<number, number>) => void;
	} = $props();

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
	/** Folded away after shares are applied; the header then says what's in use. */
	let open = $state(true);
	let applied = $state<{ runs: number; range: string; raid: string } | null>(null);

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
			// Only the simulator's character: logs recorded on it (it's the local player in those logs).
			const players = playerList(encounters);
			player = characterName
				? (players.find((p) => p.name.toLowerCase() === characterName.toLowerCase())?.name ?? '')
				: (players[0]?.name ?? '');
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
	const mine = $derived((encounters ?? []).filter((r) => r.player === player && r.boss));
	/**
	 * Raid filter, grouped by raid and gate (newest raids first): "raid:<raid>", "gate:<raid>:<gate>", or
	 * "boss:<name>" for bosses outside the raid list.
	 */
	const raidGroups = $derived.by(() => {
		const raids = new Map<string, { order: number; runs: number; gates: Map<number, { label: string; runs: number }> }>();
		const others = new Map<string, number>();
		for (const r of mine) {
			const rg = raidGateOf(r.boss);
			if (!rg) {
				others.set(r.boss, (others.get(r.boss) ?? 0) + 1);
				continue;
			}
			const g = raids.get(rg.raid) ?? { order: rg.order, runs: 0, gates: new Map() };
			g.runs++;
			g.gates.set(rg.gate, { label: rg.label, runs: (g.gates.get(rg.gate)?.runs ?? 0) + 1 });
			raids.set(rg.raid, g);
		}
		return {
			raids: [...raids.entries()]
				.sort((a, b) => b[1].order - a[1].order)
				.map(([raid, g]) => ({ raid, runs: g.runs, gates: [...g.gates.entries()].sort((a, b) => a[0] - b[0]) })),
			others: [...others.entries()].sort((a, b) => b[1] - a[1])
		};
	});
	const matchesRaid = (r: EncounterRow) => {
		if (!boss) return true;
		const [kind, ...rest] = boss.split(':');
		const rg = raidGateOf(r.boss);
		if (kind === 'raid') return rg?.raid === rest.join(':');
		if (kind === 'gate') return rg !== null && `${rg.raid}:${rg.gate}` === rest.join(':');
		return r.boss === rest.join(':');
	};
	/** Runs matching the raid / cleared filters inside a time preset. */
	const inRange = (preset: RangePreset) => {
		const [from, to] = rangeOf(preset);
		return mine.filter((r) => matchesRaid(r) && r.start >= from && r.start < to && (!clearedOnly || r.cleared !== false));
	};
	const RANGES = Object.keys(RANGE_LABELS) as RangePreset[];
	const counts = $derived(Object.fromEntries(RANGES.map((p) => [p, inRange(p).length])) as Record<RangePreset, number>);
	const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	/** "Oct 1 – now", from the weekly reset (Wednesday 10:00 UTC). */
	const rangeText = $derived.by(() => {
		const [from, to] = rangeOf(range);
		return from === 0 ? 'every log in the file' : `${day(from)} – ${to === Infinity ? 'now' : day(to - 1)}`;
	});
	/** The raid filter as text, for the folded header. */
	const raidLabel = $derived.by(() => {
		if (!boss) return 'All raids';
		const [kind, ...rest] = boss.split(':');
		if (kind === 'raid') return rest.join(':');
		if (kind === 'gate') return raidGateOf(mine.find((r) => matchesRaid(r))?.boss ?? '')?.label ?? rest.join(':');
		return rest.join(':');
	});
		const selected = $derived.by(() => {
		const rows = inRange(range);
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

	const iconOf = (icon: string) => (icon ? iconUrl(icon.replace(/\.png$/i, '').split('/').pop()) : undefined);
</script>

<div class="flex flex-col gap-2 rounded-xs border border-surface-700 bg-surface-950/60 p-2.5">
	<div class="flex flex-row flex-wrap items-center gap-2">
		<button
			type="button"
			class="flex flex-row items-center gap-1.5 text-sm font-semibold text-surface-100 hover:text-white"
			aria-expanded={open}
			onclick={() => (open = !open)}
		>
			<svg class="size-3 shrink-0 text-surface-400 transition {open ? '' : '-rotate-90'}" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 4l4 4 4-4z" /></svg>
			Load shares from LOA Logs
		</button>
		{#if open}
			<label class="{btnAccent} cursor-pointer">
				{encounters ? 'Choose another file' : 'Choose encounters.db'}
				<input type="file" accept=".db,.sqlite,application/octet-stream" class="hidden" onchange={pick} />
			</label>
			{#if loading}<span class="text-xs text-surface-400">Reading…</span>{/if}
			{#if fileName && !loading}<span class="text-xs text-surface-400">{fileName} · {encounters?.length ?? 0} logs</span>{/if}
		{:else if applied}
			<span class="text-xs text-green-400">✓ Damage Distribution Loaded</span>
			<span class="text-xs text-surface-400">· {applied.runs} run{applied.runs === 1 ? '' : 's'} · {applied.range} · {applied.raid}</span>
		{:else if encounters}
			<span class="text-xs text-surface-400">{fileName} loaded · shares not applied yet</span>
		{:else}
			<span class="text-xs text-surface-500">Not loaded</span>
		{/if}
	</div>
	{#if open}
	{#if !encounters}
		<p class="text-xs text-surface-400">
			In LOA Logs open <b>Settings → Database → Open folder</b> and pick <code>encounters.db</code> (close LOA Logs first).
			It's read on your computer only; nothing is uploaded. Logs you uploaded to lostark.bible are in this file too.
		</p>
	{/if}
	{#if error}<p class="text-xs text-red-400">{error}</p>{/if}

	{#if encounters && !player}
		<p class="text-xs text-amber-300">
			No logs recorded on {characterName} in this file. Logs from: {players.map((p) => p.name).join(', ') || 'no characters'}.
		</p>
	{:else if encounters}
		<div class="flex flex-row flex-wrap items-center gap-2">
			<span class="text-xs text-surface-300">Logs of <b class="text-surface-100">{player || characterName}</b></span>
			<select class={selectClass(false)} bind:value={boss} aria-label="Raid">
				<option value="">All raids ({mine.length})</option>
				{#each raidGroups.raids as g (g.raid)}
					<optgroup label={g.raid}>
						<option value={`raid:${g.raid}`}>{g.raid}, all gates ({g.runs})</option>
						{#each g.gates as [gate, x] (gate)}<option value={`gate:${g.raid}:${gate}`}>{x.label} ({x.runs})</option>{/each}
					</optgroup>
				{/each}
				{#if raidGroups.others.length}
					<optgroup label="Other">
						{#each raidGroups.others as [b, n] (b)}<option value={`boss:${b}`}>{b} ({n})</option>{/each}
					</optgroup>
				{/if}
			</select>
			<label class="flex items-center gap-1.5 text-xs text-surface-300">
				<input type="checkbox" bind:checked={clearedOnly} class="accent-accent-500" /> Cleared only
			</label>
		</div>
		<div class="flex flex-row flex-wrap items-center gap-2">
			<div class="grid w-full grid-cols-3 gap-1 sm:grid-cols-6" role="radiogroup" aria-label="Time range">
				{#each RANGES as p (p)}
					<button
						type="button"
						role="radio"
						aria-checked={range === p}
						disabled={counts[p] === 0}
						class="flex flex-col items-center rounded-xs border px-1.5 py-1 text-xs transition disabled:cursor-not-allowed disabled:opacity-40 {range === p
							? 'border-accent-500 bg-accent-700/40 text-white'
							: 'border-surface-700 bg-surface-900 text-surface-300 hover:border-surface-500 hover:text-surface-100'}"
						onclick={() => (range = p)}
					>
						<span class="font-semibold whitespace-nowrap">{RANGE_LABELS[p]}</span>
						<span class="text-[11px] tabular-nums {range === p ? 'text-accent-100' : 'text-surface-500'}">{counts[p]} run{counts[p] === 1 ? '' : 's'}</span>
					</button>
				{/each}
			</div>
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
			<b class="text-surface-200">{selected.length} run{selected.length === 1 ? '' : 's'}</b> · {rangeText} (weeks start at the Wednesday reset) ·
			pick a range after your last build change
		</div>
		{#if result && result.runs}
			<div class="grid grid-cols-[auto_1fr_auto] items-center gap-x-2 gap-y-0.5">
				{#each result.shares.slice(0, 12) as s (s.id)}
					{#if iconOf(s.icon)}<img src={iconOf(s.icon)} alt="" class="size-5 rounded-xs" />{:else}<span></span>{/if}
					<span class="truncate text-xs text-surface-200">{s.name}</span>
					<span class="text-right text-xs tabular-nums text-surface-100">
						{s.pct.toFixed(1)}%{#if s.cooldownUse !== undefined}<span class="ml-1.5 text-surface-400" title="Share of the fight on cooldown">CD {(s.cooldownUse * 100).toFixed(0)}%</span>{/if}
					</span>
				{/each}
			</div>
			<div class="flex flex-row items-center gap-2">
				<button
					type="button"
					class={btnAccent}
					onclick={() => {
						onapply(
							Object.fromEntries(result!.shares.map((s) => [s.id, Number(s.pct.toFixed(2))])),
							Object.fromEntries(
								result!.shares.flatMap((s) => (s.cooldownUse === undefined ? [] : [[s.id, Number((s.cooldownUse * 100).toFixed(1))]]))
							)
						);
						// Fold away once applied; the header says what's in use.
						applied = { runs: result!.runs, range: RANGE_LABELS[range], raid: raidLabel };
						open = false;
					}}
				>
					Use these shares
				</button>
				<span class="text-xs text-surface-400">Average over {result.runs} run{result.runs === 1 ? '' : 's'}</span>
			</div>
		{:else if selected.length}
			<span class="text-xs text-surface-400">Calculating…</span>
		{/if}
	{/if}
	{/if}
</div>
