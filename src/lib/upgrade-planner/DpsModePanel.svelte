<!--
	DPS mode on the Simulator: pick a raid and one of its clears, check that the gear being simulated is the gear of that
	clear, and watch the clear's DPS follow the cards' edits on the meter. One clear at a time: each fight's crits,
	buffs and rotation are its own. Next Upgrades ranks by the same meter (dps-selection).
-->
<script lang="ts">
	import { untrack } from 'svelte';
	import { setDpsSelection } from './dps-selection.svelte';
	import { loadRuns, runsBooks } from '$lib/logs/runs-store.svelte';
	import { raidGateOf } from '$lib/logs/raids';
	import type { RunSummary } from '$lib/logs/protocol';
	import { bibleSnapshotPage, isSnapshotHash, type ClearSnapshot } from '$lib/bible-data';
	import { clearSnapshot } from './clear-snapshots';
	import { setupDiff, sameGear as sameSetupGear } from './setup-diff';
	import DpsRunsImport from './DpsRunsImport.svelte';
	import DpsMeter from './sim/DpsMeter.svelte';
	import { classColor } from './class-colors';
	import { formatDamage } from './dps-comparison';
	import { raidsOf } from './dps-gates';
	import { dpsMeter, matchSnapshot, type SnapshotOption } from './dps-meter';
	import { formatDate, formatPct } from './format';
	import { GEM_SKILLS } from './game-data';
	import { iconUrl } from './icons';
	import { difficultyTone, raidArt, raidTone } from './raid-art';
	import { initSimState, simulate, type SimState } from './simulate';
	import { clearState } from './clear-state';
	import { btn } from './sim/ui';
	import type { Loadout } from './types';
	import DpsStatContext from './DpsStatContext.svelte';
	import type { DamageContext } from './dps-stat-engine';
	import DpsCheckpoint from './DpsCheckpoint.svelte';
	import { configuredPlanGain } from './dps-configured';

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
	let context = $state<DamageContext | null>(null);
	let confirmed = $state<string | null>(null);

	// The character's own clears; the gear's damage buckets come from the clears played with these engravings.
	const own = $derived(book ? book.runs.filter((r) => r.player.toLowerCase() === characterName.toLowerCase() && r.damage > 0 && r.duration > 0) : []);
	const raids = $derived(raidsOf(own));
	const mainRaids = $derived(raids.filter((r) => r.kind === 'raid'));
	const otherRaids = $derived(raids.filter((r) => r.kind === 'other'));

	// What's picked: raid and clear. Remembered per character.
	const storeKey = $derived(`loa-sim:dps-meter:${characterKey}`);
	let pick = $state<{ raid: string | null; clear: number | null }>({ raid: null, clear: null });
	$effect(() => {
		const key = storeKey;
		untrack(() => {
			try {
				const v = JSON.parse(localStorage.getItem(key) ?? 'null');
				pick = { raid: typeof v?.raid === 'string' ? v.raid : null, clear: typeof v?.clear === 'number' ? v.clear : null };
			} catch {
				pick = { raid: null, clear: null };
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
	const runs = $derived<RunSummary[]>(clear ? [clear] : []);
	// Calibration belongs to the selected attempt. Similar CP/engravings on another run do not prove the same build.
	const buildRuns = $derived(runs);
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
			.then((snap) => {
				if (snap.classId.replaceAll('_', '').toLowerCase() !== loadout.classId.replaceAll('_', '').toLowerCase()) throw new Error('The snapshot class does not match this character.');
				if (live) setup = { hash, snap, error: null };
			})
			.catch((e) => { if (live) setup = { hash, snap: null, error: e instanceof Error ? e.message : String(e) }; });
		return () => { live = false; };
	});
	const diff = $derived(setup?.snap ? setupDiff(loadout, setup.snap) : null);
	// The clear's setup as a Simulator state: the meter's baseline, so gear changed since the clear counts with the edits.
	const clearSetup = $derived(setup?.snap && setup.hash === clear?.loadoutHash ? clearState(loadout, $state.snapshot(setup.snap) as ClearSnapshot) : null);
	const baselineKey = $derived(clear ? `${characterKey}:${clear.id}:${clear.start}:${JSON.stringify(base)}` : '');
	const baselineReady = $derived(!!clearSetup || confirmed === baselineKey);
	const clearSetupCp = $derived(clearSetup ? simulate(loadout, clearSetup.state, base).cp : null);
	// Tripod conditions ("With Possession") are checked on the clear's own skills when its snapshot has them.
	const clearSkills = $derived(setup?.snap?.raw?.skills as { id: number; tripods?: number[] }[] | undefined);
	const arkGrid = $derived.by(() => {
		const model = arkGridModel;
		if (!model) return undefined;
		const skills = clearSkills;
		return skills ? ((l: Loadout, b: SimState, st: SimState, r: RunSummary) => model.orderCoreEffect({ ...l, skills } as Loadout, b, st, r)) as typeof model.orderCoreEffect : model.orderCoreEffect;
	});
	const meter = $derived(runs.length ? dpsMeter(loadout, clearSetup?.state ?? base, baselineReady ? plain : clearSetup?.state ?? base, buildRuns, runs, arkGrid, context ?? undefined) : null);
	const configuredGain = $derived(context && !runs.length ? configuredPlanGain(loadout, base, base, plain, context) : null);
	// Shared with Next Upgrades, which ranks upgrades on this meter.
	$effect(() => {
		const key = characterKey;
		setDpsSelection(key, runs.length && baselineReady ? { baseline: clearSetup?.state ?? base, buildRuns, runs, arkGrid: arkGrid, context: context ?? undefined }
			: !runs.length && context ? {baseline: base, buildRuns: [], runs: [], context} : null);
		return () => setDpsSelection(key, null);
	});

	const gate = (r: RunSummary) => raidGateOf(r.boss)?.gate;
	const time = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
	const outcome = (r: RunSummary) => r.cleared === true ? 'Clear' : r.cleared === false ? 'Failed' : 'Unknown outcome';
	const clearLabel = (r: RunSummary) => `${formatDate(r.start)} · ${gate(r) ? `G${gate(r)}` : r.boss} · ${outcome(r)} · ${time(r.duration)} · ${formatDamage(r.damage / (r.duration / 1000))}`;
	const skillName = (id: number) => book?.skills[id]?.[0] ?? GEM_SKILLS[id]?.[0] ?? `Skill ${id}`;
	const skillIcon = (id: number) => { const icon = book?.skills[id]?.[1] || GEM_SKILLS[id]?.[1]; return icon ? iconUrl(icon) : undefined; };
	/** A raid's best recorded DPS, for its chip. */
	const bestDps = (runs: RunSummary[]) => Math.max(0, ...runs.map((r) => r.damage / Math.max(1, r.duration / 1000)));
	const select = 'rounded-xs border border-surface-700 bg-surface-800 px-2 py-1 text-xs text-surface-100';
	/** Menus on the raid banner: dark glass over the art. */
	const banner = 'w-fit rounded-xs border border-white/20 bg-black/55 px-2 py-1 text-white backdrop-blur-sm hover:border-white/40 [&_option]:bg-surface-900 [&_optgroup]:bg-surface-900';
</script>

<section class="mb-3 rounded-xs bg-surface-900 p-3 shadow-sm shadow-neutral-800 sm:p-4" aria-label="DPS meter">
	{#key characterKey}<DpsStatContext {loadout} base={clearSetup?.state ?? base} {characterKey} oncontext={(c) => { context = c; }} />{/key}
	{#if context && !runs.length}<p class="mb-3 text-sm text-surface-100">Configured damage change: <strong class="text-sky-300 tabular-nums">{configuredGain === null ? 'Not estimated for these edits' : `${formatPct(configuredGain)}%`}</strong></p>{/if}
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
		<p class="mb-3 text-sm text-surface-300">Configure combat totals above for per-stat upgrade estimates, or import a clear or failed pull to estimate changes to recorded DPS.</p>
		{#key characterKey}<DpsRunsImport {characterKey} {characterName} ondone={() => (importing = false)} />{/key}
		{#if book}<button type="button" class="{btn} mt-3" onclick={() => (importing = false)}>Close</button>{/if}
	{:else if !raid || !clear}
		<p class="text-sm text-surface-300">No attempts of {characterName} in the imported logs. <button type="button" class="text-sky-300 hover:underline" onclick={() => (importing = true)}>Import again</button></p>
	{:else}
		<!-- Two columns on wide screens: the raids on the left (best DPS on each), the picked one on the right. -->
		{@const art = raidArt(raid.name)}
		<div class="lg:grid lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-4">
		<nav class="flex flex-col gap-1.5 max-lg:hidden" aria-label="Raids">
			{#each mainRaids as r (r.key)}
				{@const rart = raidArt(r.name)}
				{@const on = r === raid}
				<button type="button" class="relative h-14 w-full shrink-0 overflow-hidden rounded-xs border text-left transition {raidTone(r.name)} {on ? 'ring-2 ring-accent-300' : 'opacity-50 saturate-50 hover:opacity-100 hover:saturate-100'}" aria-pressed={on} onclick={() => remember({ raid: r.key, clear: null })}>
					{#if rart}<span class="absolute inset-0" style={rart}></span>{/if}
					<span class="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/10"></span>
					<span class="absolute inset-x-2 top-1.5 flex items-center gap-1.5"><span class="truncate text-sm font-semibold text-white">{r.name}</span></span>
					<span class="absolute inset-x-2 bottom-1.5 flex items-center gap-1.5">
						<span class="rounded-xs px-1 text-[10px] font-semibold {difficultyTone(r.difficulty)}">{r.difficulty || 'Normal'}</span>
						<span class="ml-auto rounded-xs bg-black/70 px-1 text-[10px] font-semibold text-sky-200 tabular-nums" title="Best recorded DPS of {r.runs.length} {r.runs.length === 1 ? 'attempt' : 'attempts'}">{formatDamage(bestDps(r.runs))}</span>
					</span>
				</button>
			{/each}
			{#if otherRaids.length}
				<p class="mt-1 text-[11px] font-semibold tracking-wide text-surface-500 uppercase">Other fights</p>
				{#each otherRaids as r (r.key)}
					{@const on = r === raid}
					<button type="button" class="flex items-center gap-1.5 rounded-xs px-1.5 py-1 text-left text-xs transition {on ? 'bg-surface-700 text-surface-50 ring-1 ring-accent-300' : 'text-surface-300 hover:bg-surface-800'}" aria-pressed={on} onclick={() => remember({ raid: r.key, clear: null })}>
						<span class="min-w-0 truncate">{r.name} <span class="text-surface-500">· {r.difficulty || 'Normal'}</span></span>
						<span class="ml-auto text-[10px] text-sky-300 tabular-nums">{formatDamage(bestDps(r.runs))}</span>
					</button>
				{/each}
			{/if}
		</nav>
		<div class="min-w-0">
		<!-- Raid and attempt: one banner in the picked raid's official art, with the menus on it (the raid menu on phones). -->
		<div class="relative mb-3 overflow-hidden rounded-xs border {raidTone(raid.name)}" aria-label="Raid and attempt">
			{#if art}<span class="absolute inset-0" style={art} aria-hidden="true"></span>{/if}
			<span class="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/10" aria-hidden="true"></span>
			<div class="relative flex flex-wrap items-end gap-x-4 gap-y-2 px-3 py-3 sm:min-h-28">
				<div class="flex min-w-0 flex-col gap-1.5">
					<span class="flex items-center gap-2">
						<span class="rounded-xs px-1 text-[10px] font-semibold {difficultyTone(raid.difficulty)}">{raid.difficulty || 'Normal'}</span>
						<span class="text-[11px] text-white/70">{raid.runs.length} {raid.runs.length === 1 ? 'attempt' : 'attempts'}</span>
					</span>
					<h3 class="text-lg font-semibold text-white max-lg:hidden">{raid.name}</h3>
					<select class="{banner} max-w-full text-lg font-semibold lg:hidden" aria-label="Raid" value={raid.key} onchange={(e) => remember({ raid: e.currentTarget.value, clear: null })}>
						<optgroup label="Raids">{#each mainRaids as r (r.key)}<option value={r.key}>{r.name} · {r.difficulty || 'Normal'}</option>{/each}</optgroup>
						{#if otherRaids.length}<optgroup label="Other fights">{#each otherRaids as r (r.key)}<option value={r.key}>{r.name} · {r.difficulty || 'Normal'}</option>{/each}</optgroup>{/if}
					</select>
					<select class="{banner} max-w-full text-xs" aria-label="Attempt" value={clear.id} onchange={(e) => remember({ clear: Number(e.currentTarget.value) })}>
						{#each clears as r (r.id)}<option value={r.id}>{clearLabel(r)}</option>{/each}
					</select>
				</div>
				<button type="button" class="ml-auto self-start rounded-xs border border-white/20 bg-black/55 px-2 py-1 text-xs text-white/90 backdrop-blur-sm hover:border-white/40 hover:text-white" onclick={() => (importing = true)}>Re-import logs</button>
			</div>
		</div>
		{#if !clearSetup}
			<div class="mb-3 rounded-xs border border-amber-500/40 px-3 py-2 text-xs text-amber-200">
				{#if baselineReady}Using the loaded equipment, confirmed for this attempt.
				{:else}This attempt has no resolved equipment baseline. CP similarity alone does not verify the build.
				<button type="button" class="ml-2 underline" onclick={() => { confirmed = baselineKey; }}>Use loaded equipment for this attempt</button>{/if}
			</div>
		{/if}

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
				<p class="mb-3 text-xs text-surface-400">Similar recorded CP (loaded {currentCp!.toFixed(2)} · attempt {clearCp!.toFixed(2)}); equipment still needs confirmation.</p>
			{:else}
				<div class="mb-3 rounded-xs border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
					The gear here is {Math.abs(gap).toFixed(1)}% CP {gap > 0 ? 'above' : 'below'} this clear (CP {currentCp!.toFixed(2)} · clear {clearCp!.toFixed(2)}), so the meter applies your edits to different gear than you raided in.
					{#if better}<button type="button" class="ml-1 font-semibold text-amber-100 underline hover:text-white" onclick={better.select}>Use {better.label}</button> (CP {better.cp!.toFixed(2)}).{:else} No kept snapshot matches it.{/if}
				</div>
			{/if}
		{:else}
			{#if !baselineReady}<p class="mb-3 text-xs text-surface-400">This attempt didn't record CP; equipment must be selected or confirmed separately.</p>{/if}
		{/if}

		{#if meter}<DpsMeter {meter} {skillName} {skillIcon} color={classColor(loadout.classId) ?? 'var(--color-accent-500)'} />{/if}
		{#key `${characterKey}:${clear.id}:${clear.start}`}<DpsCheckpoint run={clear} {loadout} baseline={clearSetup?.state ?? base} simState={plain} {context} ready={baselineReady} />{/key}
		</div>
		</div>
	{/if}
</section>
