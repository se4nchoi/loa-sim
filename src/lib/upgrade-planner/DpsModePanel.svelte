<!--
	DPS mode on the Simulator: pick a raid and one of its clears (or the same-gear clears of that gate), check that the
	gear being simulated is the gear of that clear, and watch the clear's DPS follow the cards' edits on the meter.
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { loadRuns, runsBooks } from '$lib/logs/runs-store.svelte';
	import { raidGateOf } from '$lib/logs/raids';
	import type { RunSummary } from '$lib/logs/protocol';
	import { bibleSnapshotPage, isSnapshotHash, type ClearSnapshot } from '$lib/bible-data';
	import { clearSnapshot } from './clear-snapshots';
	import { setupDiff, sameGear as sameSetupGear } from './setup-diff';
	import DpsRunsImport from './DpsRunsImport.svelte';
	import DpsMeter from './sim/DpsMeter.svelte';
	import { classColor } from './class-colors';
	import { comparisonScope, formatDamage } from './dps-comparison';
	import { raidsOf } from './dps-gates';
	import { dpsMeter, matchSnapshot, sameGear, type SnapshotOption } from './dps-meter';
	import { formatDate, formatPct } from './format';
	import { GEM_SKILLS } from './game-data';
	import { iconUrl } from './icons';
	import { difficultyTone, raidArt, raidTone } from './raid-art';
	import { initSimState, simulate, type SimState } from './simulate';
	import { clearState } from './clear-state';
	import { btn } from './sim/ui';
	import Segmented from './sim/Segmented.svelte';
	import type { Loadout } from './types';

	let { loadout, simState, characterKey, characterName, snapshots = [], onsimulate }: {
		loadout: Loadout;
		/** The Simulator's live edit state. */
		simState: SimState;
		characterKey: string;
		characterName: string;
		snapshots?: SnapshotOption[];
		/** Puts a state into the Simulator (the clear's setup). */
		onsimulate?: (state: SimState) => void;
	} = $props();

	// The order core model: a large table, so it loads with DPS mode.
	let arkGridModel = $state<typeof import('./ark-grid-dps') | null>(null);
	$effect(() => {
		import('./ark-grid-dps').then((m) => (arkGridModel = m));
	});

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

	// Is the gear being simulated the gear of this clear? Its recorded CP against the snapshots' CP.
	const clearCp = $derived(clear?.combatPower ?? null);
	const current = $derived(snapshots.find((s) => s.current) ?? null);
	const currentCp = $derived(current?.cp ?? loadout.combatPower?.score ?? null);
	const gap = $derived(clearCp && currentCp ? (currentCp / clearCp - 1) * 100 : null);
	const matches = $derived(gap !== null && Math.abs(gap) <= 0.5);
	const better = $derived(matches ? null : matchSnapshot(clearCp, snapshots.filter((s) => !s.current)));

	// The clear's own setup: LOA Logs links each clear to a lostark.bible snapshot of the gear it was played with.
	let setup = $state<{ hash: string; snap: ClearSnapshot | null; error: string | null } | null>(null);
	$effect(() => {
		const hash = clear?.loadoutHash;
		if (!hash || !isSnapshotHash(hash)) {
			setup = null;
			return;
		}
		let live = true;
		setup = { hash, snap: null, error: null };
		clearSnapshot(hash)
			.then((snap) => { if (live) setup = { hash, snap, error: null }; })
			.catch((e) => { if (live) setup = { hash, snap: null, error: e instanceof Error ? e.message : String(e) }; });
		return () => { live = false; };
	});
	const diff = $derived(setup?.snap ? setupDiff(loadout, setup.snap) : null);
	// The clear's setup as a Simulator state: the meter's baseline, so gear changed since the clear counts with the edits.
	const clearSetup = $derived(setup?.snap && setup.hash === clear?.loadoutHash ? clearState(loadout, $state.snapshot(setup.snap) as ClearSnapshot) : null);
	const clearSetupCp = $derived(clearSetup ? simulate(loadout, clearSetup.state, base).cp : null);
	const meter = $derived(runs.length ? dpsMeter(loadout, clearSetup?.state ?? base, plain, buildRuns, runs, arkGridModel?.orderCoreEffect) : null);

	const gate = (r: RunSummary) => raidGateOf(r.boss)?.gate;
	const time = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
	const clearLabel = (r: RunSummary) => `${formatDate(r.start)} · ${gate(r) ? `G${gate(r)}` : r.boss} · ${time(r.duration)} · ${formatDamage(r.damage / (r.duration / 1000))}`;
	const skillName = (id: number) => book?.skills[id]?.[0] ?? GEM_SKILLS[id]?.[0] ?? `Skill ${id}`;
	const skillIcon = (id: number) => { const icon = book?.skills[id]?.[1] || GEM_SKILLS[id]?.[1]; return icon ? iconUrl(icon) : undefined; };
	const select = 'rounded-xs border border-surface-700 bg-surface-800 px-2 py-1 text-xs text-surface-100';
</script>

<section class="mb-3 rounded-xs bg-surface-900 p-3 shadow-sm shadow-neutral-800 sm:p-4" aria-label="DPS meter">
	{#if !(characterKey in runsBooks.byCharacter)}
		<!-- Holds the meter's space while this browser's imported logs are read. -->
		<div class="animate-pulse" aria-hidden="true">
			<div class="flex gap-2 pt-1 pb-2.5">{#each [0, 1, 2, 3, 4] as i (i)}<div class="h-14 w-40 shrink-0 rounded-xs bg-surface-800"></div>{/each}</div>
			<div class="mt-1.5 mb-3 h-6 w-48 rounded-xs bg-surface-800"></div>
			<div class="mb-3 h-16 rounded-xs bg-surface-800/60"></div>
			<div class="mb-3 h-12 w-56 rounded-xs bg-surface-800"></div>
			<div class="space-y-1">{#each [100, 98, 97, 85, 67, 38, 13, 7] as w (w)}<div class="h-8 rounded-xs bg-surface-800/70" style:width="{w}%"></div>{/each}</div>
		</div>
	{:else if !book || importing}
		<p class="mb-3 text-sm text-surface-300">DPS mode replays one of your own clears with the edits you make below. Import your LOA Logs to pick a clear.</p>
		{#key characterKey}<DpsRunsImport {characterKey} {characterName} ondone={() => (importing = false)} />{/key}
		{#if book}<button type="button" class="{btn} mt-3" onclick={() => (importing = false)}>Close</button>{/if}
	{:else if !raid || !clear}
		<p class="text-sm text-surface-300">No clears of {characterName} in the imported logs. <button type="button" class="text-sky-300 hover:underline" onclick={() => (importing = true)}>Import again</button></p>
	{:else}
		<!-- Raid: one card per raid and difficulty; Guardian raids and other fights in a menu. -->
		<div class="-mx-1 flex items-end gap-2 overflow-x-auto px-1 pt-1 pb-2.5" aria-label="Raids">
			{#each mainRaids as r (r.key)}
				{@const art = raidArt(r.name)}
				{@const on = r === raid}
				<button type="button" class="relative h-14 w-40 shrink-0 overflow-hidden rounded-xs border text-left transition {raidTone(r.name)} {on ? 'ring-2 ring-accent-300 ring-offset-2 ring-offset-surface-900' : 'opacity-40 saturate-50 hover:opacity-90 hover:saturate-100'}" aria-pressed={on} onclick={() => remember({ raid: r.key, clear: null })}>
					{#if art}<span class="absolute inset-0" style={art}></span>{/if}
					<span class="absolute inset-0 bg-gradient-to-r from-black/85 via-black/40 to-transparent"></span>
					<span class="absolute top-1 right-1 rounded-xs px-1 text-[10px] font-semibold {difficultyTone(r.difficulty)}">{r.difficulty || 'Normal'}</span>
					<span class="absolute inset-x-2 bottom-1"><span class="block truncate text-sm font-semibold text-white">{r.name}</span><span class="block text-[11px] text-white/70">{r.runs.length} {r.runs.length === 1 ? 'clear' : 'clears'}</span></span>
				</button>
			{/each}
			{#if otherRaids.length}
				<select class="{select} shrink-0 self-center {raid.kind === 'other' ? 'border-accent-400 ring-2 ring-accent-300 ring-offset-2 ring-offset-surface-900' : ''}" aria-label="Other fights" value={raid.kind === 'other' ? raid.key : ''} onchange={(e) => e.currentTarget.value && remember({ raid: e.currentTarget.value, clear: null })}>
					<option value="">Other fights ({otherRaids.length})…</option>
					{#each otherRaids as r (r.key)}<option value={r.key}>{r.name} · {r.difficulty}</option>{/each}
				</select>
			{/if}
			<button type="button" class="ml-auto shrink-0 self-center text-xs text-sky-300 hover:underline" onclick={() => (importing = true)}>Re-import logs</button>
		</div>

		<!-- Clear: one by default; the same-gear clears of its gate averaged on request. -->
		<div class="mt-1.5 mb-3 flex flex-wrap items-center gap-2 text-xs">
			<select class={select} aria-label="Clear" value={clear.id} onchange={(e) => remember({ clear: Number(e.currentTarget.value) })}>
				{#each clears as r (r.id)}<option value={r.id}>{clearLabel(r)}</option>{/each}
			</select>
			{#if sameGearClears.length > 1}
				<Segmented label="Clears" value={pick.average ? 'average' : 'one'} options={[{ value: 'one', label: 'This clear' }, { value: 'average', label: `Average of ${sameGearClears.length}`, title: `The ${sameGearClears.length} clears of ${gate(clear) ? `G${gate(clear)}` : 'this fight'} played with the same gear` }]} onselect={(v) => remember({ average: v === 'average' })} size="h-7 px-2.5 text-xs" />
			{/if}
		</div>

		<!-- Baseline: the clear's own setup (its snapshot). One status line; what else differs folds away. -->
		{#if setup}
			{@const recorded = setup.snap?.combatPower?.score ?? null}
			{@const build = diff ? [...(diff.cores ? ['Ark Grid cores'] : []), ...diff.passives.map((t) => t.tree), ...diff.other] : []}
			<div class="mb-3 rounded-xs border border-surface-700 bg-surface-950/50 px-3 py-2 text-xs">
				<p class="flex flex-wrap items-center gap-x-2 text-surface-300">
					<span class="font-semibold text-surface-100">This clear's setup</span>
					{#if recorded}<span class="tabular-nums">CP {recorded.toFixed(2)}</span>{/if}
					{#if clearSetup && onsimulate}
						<button type="button" class="ml-auto rounded-xs border border-accent-500/70 bg-accent-700/30 px-2 py-0.5 font-semibold text-accent-100 hover:bg-accent-700/60" title="Load this clear's gear, cores and gems into the Simulator, so your edits start from what you raided with (Undo brings yours back)" onclick={() => onsimulate(structuredClone($state.snapshot(clearSetup.state)) as SimState)}>Simulate from this setup</button>
					{/if}
					<a class="{clearSetup && onsimulate ? '' : 'ml-auto'} text-sky-300 hover:underline" href={bibleSnapshotPage(setup.hash)} target="_blank" rel="noopener">lostark.bible ↗</a>
				</p>
				{#if setup.error}
					<p class="mt-1 text-amber-300">{setup.error}</p>
				{:else if !diff}
					<div class="animate-pulse" aria-label="Loading"><div class="mt-1.5 h-3 w-32 rounded-xs bg-surface-800"></div><div class="mt-1.5 h-3 w-96 max-w-full rounded-xs bg-surface-800"></div></div>
				{:else}
					{#if sameSetupGear(diff)}
						<p class="mt-1 text-green-400">● Same gear as now</p>
					{:else}
						<p class="mt-1 text-amber-300">● Gear changed since: {[...diff.gear, ...(diff.gems ? ['Gems'] : [])].join(', ')} <span class="text-surface-400">(counted in the meter)</span></p>
					{/if}
					{#if build.length}
						<details class="mt-0.5 text-surface-400">
							<summary class="cursor-pointer select-none hover:text-surface-200">Different build: {build.join(', ')} <span class="text-surface-500">(not valued yet)</span></summary>
							<ul class="mt-1 space-y-0.5 pl-3 text-surface-300">
								{#each diff.passives as t (t.tree)}
									<li><span class="text-surface-400">{t.tree}:</span> {t.clear.join(', ') || 'other levels'} <span class="text-surface-500">→ now</span> {t.now.join(', ') || 'other levels'}</li>
								{/each}
								{#if diff.cores}<li><span class="text-surface-400">Ark Grid:</span> {diff.cores.clear.join(', ')} <span class="text-surface-500">→ now</span> {diff.cores.now.join(', ')}</li>{/if}
								{#each clearSetup?.notes ?? [] as note (note)}<li class="text-surface-400">{note}</li>{/each}
								{#if clearSetupCp !== null && recorded}<li class="text-surface-500 tabular-nums">Simulator CP for this setup: {clearSetupCp.toFixed(2)} ({formatPct((clearSetupCp / recorded - 1) * 100)}%)</li>{/if}
							</ul>
						</details>
					{/if}
				{/if}
			</div>
		{:else if gap !== null}
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
