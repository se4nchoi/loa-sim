<!--
	DPS mode on the Simulator: pick a raid and one of its clears (or the same-gear clears of that gate), check that the
	gear being simulated is the gear of that clear, and watch the clear's DPS follow the cards' edits on the meter.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { loadRuns, runsBooks } from '$lib/logs/runs-store.svelte';
	import { raidGateOf } from '$lib/logs/raids';
	import type { RunSummary } from '$lib/logs/protocol';
	import DpsRunsImport from './DpsRunsImport.svelte';
	import DpsMeter from './sim/DpsMeter.svelte';
	import { classColor } from './class-colors';
	import { comparisonScope, formatDamage } from './dps-comparison';
	import { raidsOf } from './dps-gates';
	import { dpsMeter, matchSnapshot, sameGear, type SnapshotOption } from './dps-meter';
	import { formatDate } from './format';
	import { GEM_SKILLS } from './game-data';
	import { iconUrl } from './icons';
	import { difficultyTone, raidArt, raidTone } from './raid-art';
	import { initSimState, type SimState } from './simulate';
	import { btn } from './sim/ui';
	import type { Loadout } from './types';

	let { loadout, simState, characterKey, characterName, snapshots = [] }: {
		loadout: Loadout;
		/** The Simulator's live edit state. */
		simState: SimState;
		characterKey: string;
		characterName: string;
		snapshots?: SnapshotOption[];
	} = $props();

	$effect(() => {
		loadRuns(characterKey);
	});
	const book = $derived(runsBooks.byCharacter[characterKey] ?? null);
	let importing = $state(false);
	const base = $derived(initSimState(loadout));

	// The character's own clears; the gear's damage buckets come from the clears played with these engravings.
	const own = $derived(book ? book.runs.filter((r) => r.cleared && r.player.toLowerCase() === characterName.toLowerCase() && r.damage > 0 && r.duration > 0) : []);
	const buildRuns = $derived(comparisonScope(loadout, own, characterName).included);
	const raids = $derived(raidsOf(own));
	const mainRaids = $derived(raids.filter((r) => r.kind === 'raid'));
	const otherRaids = $derived(raids.filter((r) => r.kind === 'other'));

	// What's picked: raid, clear, and whether to average that gate's same-gear clears. Remembered per character.
	const storeKey = $derived(`loa-sim:dps-meter:${characterKey}`);
	let pick = $state<{ raid: string | null; clear: number | null; average: boolean }>({ raid: null, clear: null, average: false });
	$effect(() => {
		const key = storeKey;
		untrack(() => {
			try {
				const v = JSON.parse(localStorage.getItem(key) ?? 'null');
				pick = { raid: typeof v?.raid === 'string' ? v.raid : null, clear: typeof v?.clear === 'number' ? v.clear : null, average: v?.average === true };
			} catch {
				pick = { raid: null, clear: null, average: false };
			}
		});
	});
	function remember(next: Partial<typeof pick>) {
		pick = { ...pick, ...next };
		try { localStorage.setItem(storeKey, JSON.stringify(pick)); } catch { /* this visit only */ }
	}

	const raid = $derived(raids.find((r) => r.key === pick.raid) ?? mainRaids[0] ?? raids[0] ?? null);
	const clears = $derived(raid ? raid.runs.toSorted((a, b) => b.start - a.start) : []);
	const clear = $derived(clears.find((r) => r.id === pick.clear) ?? clears[0] ?? null);
	const sameGearClears = $derived(clear ? clears.filter((r) => sameGear(clear, r)) : []);
	const runs = $derived<RunSummary[]>(clear ? (pick.average && sameGearClears.length > 1 ? sameGearClears : [clear]) : []);
	// The Simulator's state is reactive (a proxy); the meter works on a plain copy of it.
	const plain = $derived($state.snapshot(simState) as SimState);
	const meter = $derived(runs.length ? dpsMeter(loadout, base, plain, buildRuns, runs) : null);

	// Is the gear being simulated the gear of this clear? Its recorded CP against the snapshots' CP.
	const clearCp = $derived(clear?.combatPower ?? null);
	const current = $derived(snapshots.find((s) => s.current) ?? null);
	const currentCp = $derived(current?.cp ?? loadout.combatPower?.score ?? null);
	const gap = $derived(clearCp && currentCp ? (currentCp / clearCp - 1) * 100 : null);
	const matches = $derived(gap !== null && Math.abs(gap) <= 0.5);
	const better = $derived(matches ? null : matchSnapshot(clearCp, snapshots.filter((s) => !s.current)));

	const gate = (r: RunSummary) => raidGateOf(r.boss)?.gate;
	const time = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
	const clearLabel = (r: RunSummary) => `${formatDate(r.start)} · ${gate(r) ? `G${gate(r)}` : r.boss} · ${time(r.duration)} · ${formatDamage(r.damage / (r.duration / 1000))}`;
	const skillName = (id: number) => book?.skills[id]?.[0] ?? GEM_SKILLS[id]?.[0] ?? `Skill ${id}`;
	const skillIcon = (id: number) => { const icon = book?.skills[id]?.[1] || GEM_SKILLS[id]?.[1]; return icon ? iconUrl(icon) : undefined; };
	const select = 'rounded-xs border border-surface-700 bg-surface-800 px-2 py-1 text-xs text-surface-100';
</script>

<section class="mb-3 rounded-xs bg-surface-900 p-3 shadow-sm shadow-neutral-800 sm:p-4" aria-label="DPS meter">
	{#if !book || importing}
		<p class="mb-3 text-sm text-surface-300">DPS mode replays one of your own clears with the edits you make below. Import your LOA Logs to pick a clear.</p>
		{#key characterKey}<DpsRunsImport {characterKey} {characterName} ondone={() => (importing = false)} />{/key}
		{#if book}<button type="button" class="{btn} mt-3" onclick={() => (importing = false)}>Close</button>{/if}
	{:else if !raid || !clear}
		<p class="text-sm text-surface-300">No clears of {characterName} in the imported logs. <button type="button" class="text-sky-300 hover:underline" onclick={() => (importing = true)}>Import again</button></p>
	{:else}
		<!-- Raid: one card per raid and difficulty; Guardian raids and other fights in a menu. -->
		<div class="-mx-1 flex items-end gap-2 overflow-x-auto px-1 pb-2" aria-label="Raids">
			{#each mainRaids as r (r.key)}
				{@const art = raidArt(r.name)}
				{@const on = r === raid}
				<button type="button" class="relative h-14 w-40 shrink-0 overflow-hidden rounded-xs border text-left transition {raidTone(r.name)} {on ? 'ring-2 ring-accent-400' : 'opacity-70 hover:opacity-100'}" aria-pressed={on} onclick={() => remember({ raid: r.key, clear: null })}>
					{#if art}<span class="absolute inset-0" style={art}></span>{/if}
					<span class="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent"></span>
					<span class="absolute top-1 right-1 rounded-xs px-1 text-[10px] font-semibold {difficultyTone(r.difficulty)}">{r.difficulty || 'Normal'}</span>
					<span class="absolute inset-x-2 bottom-1"><span class="block truncate text-sm font-semibold text-white">{r.name}</span><span class="block text-[11px] text-white/70">{r.runs.length} {r.runs.length === 1 ? 'clear' : 'clears'}</span></span>
				</button>
			{/each}
			{#if otherRaids.length}
				<select class="{select} shrink-0 self-center" aria-label="Other fights" value={raid.kind === 'other' ? raid.key : ''} onchange={(e) => e.currentTarget.value && remember({ raid: e.currentTarget.value, clear: null })}>
					<option value="">Other fights ({otherRaids.length})…</option>
					{#each otherRaids as r (r.key)}<option value={r.key}>{r.name} · {r.difficulty}</option>{/each}
				</select>
			{/if}
			<button type="button" class="ml-auto shrink-0 self-center text-xs text-sky-300 hover:underline" onclick={() => (importing = true)}>Re-import logs</button>
		</div>

		<!-- Clear: one by default; the same-gear clears of its gate averaged on request. -->
		<div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
			<select class={select} aria-label="Clear" value={clear.id} onchange={(e) => remember({ clear: Number(e.currentTarget.value) })}>
				{#each clears as r (r.id)}<option value={r.id}>{clearLabel(r)}</option>{/each}
			</select>
			{#if sameGearClears.length > 1}
				<label class="flex items-center gap-1.5 text-surface-300"><input type="checkbox" checked={pick.average} onchange={(e) => remember({ average: e.currentTarget.checked })} /> Average the {sameGearClears.length} clears of {gate(clear) ? `G${gate(clear)}` : 'this fight'} with the same gear</label>
			{/if}
		</div>

		<!-- Baseline: the gear being simulated should be the gear of the clear. -->
		{#if gap !== null}
			{#if matches}
				<p class="mb-3 text-xs text-surface-400"><span class="text-green-400">●</span> Gear matches this clear (CP {currentCp!.toFixed(2)} · clear {clearCp!.toFixed(2)})</p>
			{:else}
				<div class="mb-3 rounded-xs border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
					The gear here is {Math.abs(gap).toFixed(1)}% CP {gap > 0 ? 'above' : 'below'} this clear (CP {currentCp!.toFixed(2)} · clear {clearCp!.toFixed(2)}), so the meter applies your edits to different gear than you raided in.
					{#if better}<button type="button" class="ml-1 font-semibold text-amber-100 underline hover:text-white" onclick={better.select}>Use {better.label}</button> (CP {better.cp!.toFixed(2)}).{:else} No kept snapshot matches it.{/if}
				</div>
			{/if}
		{:else}
			<p class="mb-3 text-xs text-surface-400">This clear didn't record CP, so the gear can't be checked against it.</p>
		{/if}

		{#if meter}<DpsMeter {meter} {skillName} {skillIcon} color={classColor(loadout.classId) ?? 'var(--color-accent-500)'} />{/if}
	{/if}
</section>
