<!--
	DPS mode on the Simulator: pick a raid and one of its runs, check that the gear being simulated is the gear of that
	run, and watch the run's DPS follow the cards' edits on the meter. One run at a time: each fight's crits, buffs and
	rotation are its own. Next Upgrades ranks by the same meter (dps-selection); Target DPS plans on it.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { setDpsSelection, type DpsSelection } from './dps-selection.svelte';
	import { hasStoredRuns, loadRuns, runsBooks } from '$lib/logs/runs-store.svelte';
	import { currentRaids, raidGateOf } from '$lib/logs/raids';
	import type { RunSummary } from '$lib/logs/protocol';
	import { bibleSnapshotPage, isSnapshotHash, type ClearSnapshot } from '$lib/bible-data';
	import { clearSnapshot, orderCoreKey, snapshotFitsRun } from './clear-snapshots';
	import { setupDiff, sameGear as sameSetupGear } from './setup-diff';
	import DpsRunsImport from './DpsRunsImport.svelte';
	import DpsMeter from './sim/DpsMeter.svelte';
	import DpsTarget from './DpsTarget.svelte';
	import SupportMeterView from './sim/SupportMeter.svelte';
	import DpsLimits from './sim/DpsLimits.svelte';
	import DpsHint from './sim/DpsHint.svelte';
	import { dpsByBuild, dpsSpread } from './run-spread';
	import { CORE_NAMES } from './game-data';
	import { supportMeter } from './support-meter';
	import FoldChip from './sim/FoldChip.svelte';
	import { classColor } from './class-colors';
	import { formatDamage } from './dps-comparison';
	import { raidsOf } from './dps-gates';
	import { dpsMeter, matchSnapshot, statValueRuns, type SnapshotOption } from './dps-meter';
	import { formatDate, formatPct } from './format';
	import { GEM_SKILLS } from './game-data';
	import { iconUrl } from './icons';
	import { difficultyTone, raidArt, raidTone } from './raid-art';
	import { initSimState, simulate, type SimState } from './simulate';
	import { clearState } from './clear-state';
	import { btn } from './sim/ui';
	import Segmented from './sim/Segmented.svelte';
	import { wipeGap, wipeStory } from './dps-wipe';
	import type { Loadout } from './types';
	import { shareableRun, type SharedDps } from './shared-dps';

	let { loadout, simState, characterKey, characterName, snapshots = [], onsimulate, shared }: {
		loadout: Loadout;
		/** The Simulator's live edit state. */
		simState: SimState;
		characterKey: string;
		characterName: string;
		snapshots?: SnapshotOption[];
		/** Puts a state into the Simulator (the run's setup, a Target DPS plan). */
		onsimulate?: (state: SimState) => void;
		/** A shared link's run: shown on its own, read-only (no import, tabs or raid list), nothing remembered. */
		shared?: SharedDps;
	} = $props();

	// The order core model: a large table, so it loads with DPS mode.
	let arkGridModel = $state<typeof import('./ark-grid-dps') | null>(null);
	$effect(() => {
		import('./ark-grid-dps').then((m) => (arkGridModel = m));
	});

	$effect(() => {
		if (!shared) loadRuns(characterKey);
	});
	const book = $derived(runsBooks.byCharacter[characterKey] ?? null);
	// Switching to DPS mode puts this panel over the cards: a skeleton for at least a second, so the change reads as
	// loading instead of a jump, then the panel. Shaped like what comes next: the panel when this browser has runs, the
	// import card when it doesn't.
	let warm = $state(false);
	onMount(() => { const t = setTimeout(() => (warm = true), 1000); return () => clearTimeout(t); });
	const hasRuns = $derived(!!shared || hasStoredRuns(characterKey));
	let importing = $state(false);
	const base = $derived(initSimState(loadout));
	let confirmed = $state<string | null>(null);

	// Read before the first draw to avoid shifting the panel after a remembered dismissal. The new hint is shown
	// once even when the old numbered intro was dismissed; its explanation and limits are different.
	const VIEW_KEY = 'loa-sim:dps-panel';
	let view = $state<{ folded: boolean; hint: boolean }>((() => {
		try {
			const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? 'null');
			return { folded: saved?.folded === true, hint: saved?.hint !== false };
		} catch {
			return { folded: false, hint: true };
		}
	})());
	function setView(next: Partial<typeof view>) {
		view = { ...view, ...next };
		try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)); } catch { /* this visit only */ }
	}

	// The character's own runs.
	const own = $derived(shared ? [shared.run] : book ? book.runs.filter((r) => r.player.toLowerCase() === characterName.toLowerCase() && r.damage > 0 && r.duration > 0) : []);
	const allRaids = $derived(raidsOf(own));
	type Use = 'cleared' | 'failed';
	/** The runs each tab works on: clears, or wipes with the boss HP recorded. */
	const fits = (r: RunSummary, use: Use) => (use === 'cleared' ? r.cleared !== false : wipeGap(r) !== null);
	const raids = $derived(shared ? allRaids : allRaids.filter((r) => r.runs.some((x) => fits(x, pick.use))));
	const mainRaids = $derived(raids.filter((r) => r.kind === 'raid'));
	const otherRaids = $derived(raids.filter((r) => r.kind === 'other'));
	/** Current raids with no run on this tab, listed dimmed under the played ones. */
	const unplayed = $derived(currentRaids().filter((name) => !mainRaids.some((r) => r.name === name)));

	// What's picked: tab, raid and run. Remembered per character.
	const storeKey = $derived(`loa-sim:dps-meter:${characterKey}`);
	// enrage / notEnrage: pulls the player marked (or unmarked) as enrage wipes. loaded: runs where the player chose
	// "Use loaded gear" (run and loaded gear, as gearKeyOf), so the choice holds across visits until the gear changes.
	type Pick = { raid: string | null; clear: number | null; use: Use; enrage: number[]; notEnrage: number[]; loaded: string[] };
	const NO_PICK: Pick = { raid: null, clear: null, use: 'cleared', enrage: [], notEnrage: [], loaded: [] };
	let pick = $state<Pick>({ ...NO_PICK });
	$effect(() => {
		const key = storeKey;
		untrack(() => {
			if (shared) {
				pick = { ...NO_PICK, use: shared.run.cleared === false ? 'failed' : 'cleared', enrage: shared.enrage ? [shared.run.id] : [] };
				return;
			}
			try {
				const v = JSON.parse(localStorage.getItem(key) ?? 'null');
				const ids = (x: unknown) => (Array.isArray(x) ? x.filter((n): n is number => typeof n === 'number') : []);
				pick = { raid: typeof v?.raid === 'string' ? v.raid : null, clear: typeof v?.clear === 'number' ? v.clear : null,
					use: v?.use === 'failed' || v?.use === 'enrage' ? 'failed' : 'cleared', enrage: ids(v?.enrage), notEnrage: ids(v?.notEnrage),
					loaded: Array.isArray(v?.loaded) ? v.loaded.filter((k: unknown): k is string => typeof k === 'string') : [] };
			} catch {
				pick = { ...NO_PICK };
			}
		});
	});
	function remember(next: Partial<typeof pick>) {
		pick = { ...pick, ...next };
		if (shared) return;
		try { localStorage.setItem(storeKey, JSON.stringify(pick)); } catch { /* this visit only */ }
	}

	/** With nothing picked yet: the raid played most in the two weeks before the newest run (then the newest). */
	const busiest = $derived.by(() => {
		const pool = mainRaids.length ? mainRaids : raids;
		const newest = Math.max(0, ...pool.flatMap((r) => r.runs.map((x) => x.start)));
		const recent = (r: (typeof pool)[number]) => r.runs.filter((x) => x.start >= newest - 14 * 86_400_000).length;
		return pool.toSorted((a, b) => recent(b) - recent(a) || b.last - a.last)[0] ?? null;
	});
	const raid = $derived(raids.find((r) => r.key === pick.raid) ?? busiest);
	const clears = $derived(raid ? raid.runs.filter((r) => shared || fits(r, pick.use)).toSorted((a, b) => b.start - a.start) : []);
	/** A wipe's story against its gate's other wipes (a timer shows as pulls ending at one time, boss at different HP). */
	const storyOf = (r: RunSummary) => wipeStory(r, raid ? raid.runs.filter((x) => x.cleared === false && gate(x) === gate(r)) : [],
		Math.max(0, ...(raid?.runs ?? []).filter((x) => x.cleared === true && gate(x) === gate(r)).map((x) => x.duration / 1000)));
	/** An enrage wipe: the player marked it, or the pattern says so and they didn't unmark it. */
	const isEnrage = (r: RunSummary) => pick.enrage.includes(r.id) || (storyOf(r)?.pattern?.kind === 'time' && !pick.notEnrage.includes(r.id));
	// Which Order cores each run was played on (its gear snapshot): a run on other cores is another rotation, so the
	// newest run on the simulated cores is the default, and the others are marked. Fetched for the raid on screen only,
	// one request per gear snapshot (cached).
	const nowCores = $derived(orderCoreKey(simState.arkGrid.map((c) => c.as ?? c.id)));
	let runCores = $state<Record<string, string>>({});
	$effect(() => {
		if (shared) return;
		// And a run without LOA Logs' stat values: the nearest runs that have them, to lend them on the same cores.
		const lenders = clear && !clear.statValues
			? own.filter((r) => r.statValues && Math.abs(r.start - clear!.start) <= 14 * 86_400_000).toSorted((a, b) => Math.abs(a.start - clear!.start) - Math.abs(b.start - clear!.start)).slice(0, 4)
			: [];
		const candidates = [...lenders, ...clears], model = arkGridModel;
		const hashes = [...new Set(candidates.map((r) => r.loadoutHash).filter((h): h is string => !!h && isSnapshotHash(h) && !(h in untrack(() => runCores))))].slice(0, 16);
		let live = true;
		(async () => {
			for (const h of hashes) {
				try {
					const snap = await clearSnapshot(h);
					if (!live) return;
					// A snapshot of another setup (lostark.bible's highest-CP one) says nothing about this run's cores.
					const run = candidates.find((r) => r.loadoutHash === h);
					if (!snapshotFitsRun(snap, run?.arkPassives?.enlightenment)) continue;
					if (model?.snapshotCoresContradicted((snap.arkGridCores ?? []).map((c) => c.id), { names: run?.buffNames })) continue;
					runCores = { ...runCores, [h]: orderCoreKey((snap.arkGridCores ?? []).map((c) => c.id)) };
				} catch { /* left unknown */ }
			}
		})();
		return () => { live = false; };
	});
	/** true: played on the simulated Order cores; false: on others; null: not known (no snapshot, or not read yet). */
	const sameCores = (r: RunSummary) => (r.loadoutHash && r.loadoutHash in runCores ? runCores[r.loadoutHash] === nowCores : null);
	const clear = $derived(clears.find((r) => r.id === pick.clear) ?? (pick.use === 'failed' ? clears.find(isEnrage) : null)
		?? clears.find((r) => sameCores(r) === true) ?? clears[0] ?? null);
	function markEnrage(r: RunSummary, on: boolean) {
		remember({ enrage: on ? [...new Set([...pick.enrage, r.id])] : pick.enrage.filter((x) => x !== r.id),
			notEnrage: on ? pick.notEnrage.filter((x) => x !== r.id) : [...new Set([...pick.notEnrage, r.id])] });
	}
	const runs = $derived<RunSummary[]>(clear ? [clear] : []);
	// Calibration belongs to the selected run; when LOA Logs didn't record its stat values, the nearest run on the same
	// gear snapshot or Order cores lends them (statValueRuns). Similar CP alone doesn't prove the same build.
	const coresOfRun = (r: RunSummary) => (r.loadoutHash && r.loadoutHash in runCores ? runCores[r.loadoutHash] : null);
	const buildRuns = $derived(clear ? statValueRuns(clear, own, (r) => coresOfRun(r) !== null && coresOfRun(r) === coresOfRun(clear)) : runs);
	// The Simulator's state is reactive (a proxy); the meter works on a plain copy of it.
	const plain = $derived($state.snapshot(simState) as SimState);

	// Is the gear being simulated the gear of this run? Its recorded CP against the snapshots' CP.
	const clearCp = $derived(clear?.combatPower ?? null);
	const current = $derived(snapshots.find((s) => s.current) ?? null);
	const currentCp = $derived(current?.cp ?? loadout.combatPower?.score ?? null);
	const gap = $derived(clearCp && currentCp ? (currentCp / clearCp - 1) * 100 : null);
	const matches = $derived(gap !== null && Math.abs(gap) <= 0.5);
	const better = $derived(matches ? null : matchSnapshot(clearCp, snapshots.filter((s) => !s.current)));

	// The run's own setup: LOA Logs links each run to a lostark.bible snapshot of the gear it was played with.
	let setup = $state<{ hash: string; snap: ClearSnapshot | null; error: string | null } | null>(null);
	/** The run's snapshot is another setup than the one played (its Ark Passive differs): the loaded gear stands in. */
	let otherSetup = $state(false);
	/** The run whose setup was last put into the Simulator ("Simulate from this setup"). */
	let fromSetup = $state<number | null>(null);
	$effect(() => {
		const hash = clear?.loadoutHash, ran = clear?.arkPassives?.enlightenment, buffs = clear?.buffNames, model = arkGridModel;
		otherSetup = false;
		if (shared || !hash || !isSnapshotHash(hash)) {
			setup = null;
			return;
		}
		let live = true;
		setup = { hash, snap: null, error: null };
		clearSnapshot(hash)
			.then((snap) => {
				if (snap.classId.replaceAll('_', '').toLowerCase() !== loadout.classId.replaceAll('_', '').toLowerCase()) throw new Error('The snapshot class does not match this character.');
				if (!live) return;
				const cores = (snap.arkGridCores ?? []).map((c) => c.id);
				if (snapshotFitsRun(snap, ran) && !model?.snapshotCoresContradicted(cores, { names: buffs })) setup = { hash, snap, error: null };
				else { setup = null; otherSetup = true; }
			})
			.catch((e) => { if (live) setup = { hash, snap: null, error: e instanceof Error ? e.message : String(e) }; });
		return () => { live = false; };
	});
	const diff = $derived(setup?.snap ? setupDiff(loadout, setup.snap) : null);
	// The run's setup as a Simulator state: the meter's baseline, so gear changed since the run counts with the edits.
	const clearSetup = $derived(shared ? { state: shared.baseline, notes: [] as string[] } : setup?.snap && setup.hash === clear?.loadoutHash ? clearState(loadout, $state.snapshot(setup.snap) as ClearSnapshot, clear?.skills) : null);
	/** A run with the loaded gear standing in: the run and a short digest of the loaded gear (a reload or another
	 *  snapshot asks again). */
	const digest = (text: string) => { let h = 0; for (let i = 0; i < text.length; i++) h = (Math.imul(h, 31) + text.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
	const baselineKey = $derived(clear ? `${clear.id}:${clear.start}:${digest(JSON.stringify(base))}` : '');
	const baselineReady = $derived(!!clearSetup || confirmed === baselineKey || pick.loaded.includes(baselineKey));
	const clearSetupCp = $derived(clearSetup ? simulate(loadout, clearSetup.state, base).cp : null);
	// Tripod conditions ("With Possession") are checked on the run's own skills when its snapshot has them.
	const clearSkills = $derived(shared ? shared.arkSkills : (setup?.snap?.raw?.skills as { id: number; tripods?: number[] }[] | undefined));
	const arkGrid = $derived.by(() => {
		const model = arkGridModel;
		if (!model) return undefined;
		const skills = clearSkills;
		return skills ? ((l: Loadout, b: SimState, st: SimState, r: RunSummary) => model.orderCoreEffect({ ...l, skills } as Loadout, b, st, r)) as typeof model.orderCoreEffect : model.orderCoreEffect;
	});
	// A support's sim is the party damage their buffs added (support-meter.ts); a dealer's, their own skills' damage.
	const isSupport = $derived(loadout.battlePoint.isSupport);
	const meter = $derived(!isSupport && runs.length ? dpsMeter(loadout, clearSetup?.state ?? base, baselineReady ? plain : clearSetup?.state ?? base, buildRuns, runs, arkGrid) : null);
	// What a share link carries from here: this run, its baseline, its skills' names and icons (shared-dps.ts).
	const share = $derived.by<SharedDps | undefined>(() => {
		if (!clear || !baselineReady || isSupport) return undefined;
		const skills = Object.fromEntries(clear.skills.map((s) => [s.id, [skillName(s.id), skillsBook?.[s.id]?.[1] || GEM_SKILLS[s.id]?.[1] || '']])) as SharedDps['skills'];
		const tripods = clearSkills?.filter((s) => clear.skills.some((x) => x.id === s.id)).map((s) => ({ id: s.id, ...(s.tripods ? { tripods: s.tripods } : {}) }));
		return { run: shareableRun($state.snapshot(clear) as RunSummary), baseline: $state.snapshot(clearSetup?.state ?? base) as SimState, skills, ...(tripods?.length ? { arkSkills: tripods } : {}), ...(clear.cleared === false && isEnrage(clear) ? { enrage: true } : {}) };
	});
	const selection = $derived<DpsSelection | null>(!runs.length || !baselineReady ? null
		: isSupport ? (clear?.support ? { baseline: clearSetup?.state ?? base, buildRuns: [], runs, support: true } : null)
		: { baseline: clearSetup?.state ?? base, buildRuns, runs, arkGrid, share });
	// Shared with Next Upgrades, which ranks upgrades on this meter.
	$effect(() => {
		const key = characterKey;
		setDpsSelection(key, selection);
		return () => setDpsSelection(key, null);
	});
	const supMeter = $derived(isSupport && clear?.support ? supportMeter(loadout, clearSetup?.state ?? base, baselineReady ? plain : clearSetup?.state ?? base, clear) : null);
	/** The headline numbers from whichever meter this character has: the dealer's own DPS, or the party DPS a support added. */
	const head = $derived(meter ? { before: meter.before, after: meter.after, ms: meter.durationMs, notIn: meter.notInMeter }
		: supMeter ? { before: supMeter.before, after: supMeter.after, ms: supMeter.durationMs, notIn: supMeter.notInMeter } : null);
	const seconds = $derived(head ? head.ms / 1000 : 1);
	const recordedDps = $derived(head ? head.before / seconds : 0);
	const simulatedDps = $derived(head ? head.after / seconds : 0);
	const gainPct = $derived(head && head.before > 0 ? (head.after / head.before - 1) * 100 : 0);

	const gate = (r: RunSummary) => raidGateOf(r.boss)?.gate;
	const time = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
	const hpText = (pct: number) => `${pct < 10 ? pct.toFixed(1) : Math.round(pct)}%`;
	const runLabel = (r: RunSummary) => {
		const g = wipeGap(r);
		const outcome = r.cleared === true ? 'Clear' : r.cleared === false ? `Failed${g ? ` at ${hpText(g.hpLeftPct)}` : ''}${isEnrage(r) ? ' · enrage' : ''}` : 'Unknown';
		// A support's run reads as the party DPS their buffs added; a dealer's, their own.
		const damage = r.support ? Object.values(r.support.kinds).reduce((x, y) => x + y, 0) : r.damage;
		return `${formatDate(r.start)} · ${gate(r) ? `G${gate(r)}` : r.boss} · ${outcome} · ${time(r.duration)} · ${formatDamage(damage / (r.duration / 1000))}${sameCores(r) === false ? ' · other cores' : ''}`;
	};
	/** A run's colour in the menu: failed pulls light red, clears light green. */
	const runTone = (r: RunSummary) => (sameCores(r) === false ? 'text-surface-400' : r.cleared === false ? 'text-rose-300' : r.cleared === true ? 'text-emerald-200' : 'text-white');
	const wipe = $derived(clear ? storyOf(clear) : null);
	/** The same fight on the same gear, run to run (null under two runs). */
	const spread = $derived(clear && !shared ? dpsSpread(clear, own) : null);
	// The fight by build (Order cores, read off each run's own snapshot, and spec): a core swap can't be simulated, but
	// the runs on each build can be measured.
	const buildOfRun = (r: RunSummary) => { const c = coresOfRun(r); return c === null ? null : `${c}|${r.spec ?? ''}`; };
	const byBuild = $derived(clear && !shared ? dpsByBuild(clear, own, buildOfRun) : null);
	/** "Footsteps of the Dead · Full Moon Harvester": the build's sun core and spec. */
	const buildName = (key: string) => {
		const [cores, spec] = key.split('|');
		const sun = cores.split(',').find((id) => id[4] === '0');
		return [sun ? CORE_NAMES[sun] ?? sun : 'No Order cores', spec].filter(Boolean).join(' · ');
	};
	const enrage = $derived(clear ? isEnrage(clear) : false);
	const skillsBook = $derived(shared ? shared.skills : book?.skills);
	const skillName = (id: number) => skillsBook?.[id]?.[0] ?? GEM_SKILLS[id]?.[0] ?? `Skill ${id}`;
	const skillIcon = (id: number) => { const icon = skillsBook?.[id]?.[1] || GEM_SKILLS[id]?.[1]; return icon ? iconUrl(icon) : undefined; };
	/** A raid's chip: how many runs the tab has of it ("3 clears"). */
	const runCount = (runs: RunSummary[]) => {
		const n = runs.filter((x) => fits(x, pick.use)).length;
		return `${n} ${pick.use === 'cleared' ? (n === 1 ? 'clear' : 'clears') : (n === 1 ? 'wipe' : 'wipes')}`;
	};
	/** 1.316b: as the meter's headline. */
	const dpsText = (n: number) => (n >= 1e9 ? `${(n / 1e9).toFixed(3)}b` : formatDamage(n));
	/** Menus on the raid banner: dark glass over the art. */
	const banner = 'w-fit rounded-xs border border-white/20 bg-black/55 px-2 py-1 text-white backdrop-blur-sm hover:border-white/40 [&_option]:bg-surface-900 [&_optgroup]:bg-surface-900';

	// Tag-along: once the panel's numbers scroll away (editing the cards below), a small DPS bar follows the page.
	let section = $state<HTMLElement | null>(null);
	let header = $state<HTMLElement | null>(null);
	let meterBox = $state<HTMLElement | null>(null);
	// Open, the meter (headline and skill bars) is what has to scroll away; folded, the header.
	const anchor = $derived(view.folded ? header : meterBox);
	let away = $state(false);
	$effect(() => {
		const el = anchor;
		if (!el) { away = false; return; }
		const check = () => (away = el.getBoundingClientRect().bottom < 48);
		check();
		window.addEventListener('scroll', check, { passive: true });
		window.addEventListener('resize', check);
		return () => { window.removeEventListener('scroll', check); window.removeEventListener('resize', check); };
	});
	// The bar shown or gone: the Simulator re-measures its sticky offset on resize.
	$effect(() => {
		void away;
		dispatchEvent(new Event('resize'));
	});
	let target = $state<DpsTarget | null>(null);
</script>

{#snippet gainText(cls = '')}
	<span class="tabular-nums {cls} {Math.abs(gainPct) < 0.0005 ? 'text-surface-400' : gainPct > 0 ? 'text-green-400' : 'text-red-400'}">{Math.abs(gainPct) < 0.0005 ? '±0' : `${formatPct(gainPct)}%`}</span>
{/snippet}

<section bind:this={section} class="mb-3 scroll-mt-16 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800" aria-label="DPS sim">
	<!-- Header: folds the panel; folded, it still shows the run and its DPS. -->
	<div class="flex items-center gap-2 px-3 py-2 sm:px-4" bind:this={header}>
	<span class="font-semibold text-surface-100">DPS sim</span>
	<span class="rounded-xs bg-amber-500/15 px-1 text-[10px] font-semibold text-amber-300">BETA</span>
	<button type="button" class="flex size-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold transition {view.hint && !view.folded ? 'border-amber-400/60 bg-amber-500/15 text-amber-200' : 'border-surface-600 text-surface-400 hover:border-surface-400 hover:text-surface-100'}" title="How the DPS sim works" aria-label="How the DPS sim works" aria-expanded={view.hint && !view.folded} aria-controls="dps-sim-hint" onclick={() => setView({ hint: !(view.hint && !view.folded), folded: false })}>?</button>
	<button type="button" class="group flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-left" aria-expanded={!view.folded} aria-label={view.folded ? 'Show the DPS sim' : 'Hide the DPS sim'} onclick={() => setView({ folded: !view.folded })}>
		{#if head && raid && clear}
			<span class="flex min-w-0 items-center gap-1.5 text-xs text-surface-400 {view.folded ? '' : 'max-sm:hidden'}"><span class="truncate">{raid.name}{gate(clear) ? ` G${gate(clear)}` : ''}</span>
				<span class="text-surface-300 tabular-nums">{dpsText(recordedDps)} → <span class="font-semibold text-surface-50">{dpsText(simulatedDps)}</span></span>{@render gainText('font-semibold')}</span>
		{/if}
		<span class="ml-auto"><FoldChip open={!view.folded} /></span>
	</button>
	</div>

	{#if !view.folded}
	<div class="px-3 pb-3 sm:px-4 sm:pb-4">
	{#if view.hint}<DpsHint support={isSupport} ondismiss={() => setView({ hint: false })} />{/if}
	{#if (!warm || (!shared && !(characterKey in runsBooks.byCharacter))) && !hasRuns}
		<!-- No runs in this browser yet: the import card's shape (its label and file picker). -->
		<div class="animate-pulse" role="status" aria-label="Loading the DPS sim">
			<div class="h-5 w-40 rounded-xs bg-surface-800"></div>
			<div class="mt-1 h-7 w-full max-w-md rounded-xs bg-surface-800/70"></div>
		</div>
	{:else if !warm || (!shared && !(characterKey in runsBooks.byCharacter))}
		<!-- The panel's shape while it opens and this browser's imported logs are read: tabs, raids, banner, run, setup,
		     Target DPS, meter. -->
		<div class="animate-pulse" role="status" aria-label="Loading the DPS sim">
			<div class="mb-3 flex gap-2"><div class="h-8 w-60 rounded-xs bg-surface-800"></div><div class="ml-auto h-8 w-28 rounded-xs bg-surface-800"></div></div>
			<div class="{shared ? '' : 'lg:grid lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-4'}">
				{#if !shared}<div class="flex flex-col gap-1.5 max-lg:hidden">{#each [0, 1, 2, 3, 4, 5] as i (i)}<div class="h-14 rounded-xs bg-surface-800/70"></div>{/each}</div>{/if}
				<div>
					<div class="mb-3 h-28 rounded-xs bg-surface-800/60"></div>
					<div class="mb-3 h-28 rounded-xs bg-surface-800/50"></div>
					<div class="mb-3 h-20 rounded-xs bg-surface-800/50"></div>
					<div class="mb-3 h-[7.5rem] rounded-xs bg-surface-800/50"></div>
					<div class="mb-3 h-14 w-72 rounded-xs bg-surface-800"></div>
					<div class="space-y-1">{#each [100, 98, 97, 85, 67, 38, 13, 7] as w (w)}<div class="h-8 rounded-xs bg-surface-800/70" style:width="{w}%"></div>{/each}</div>
					<div class="mt-3 h-4 w-28 rounded-xs bg-surface-800/60"></div>
					<div class="mt-3 h-4 w-80 rounded-xs bg-surface-800/60"></div>
				</div>
			</div>
		</div>
	{:else if !shared && (!book || importing)}
		<!-- Where Re-import logs was, so the way back is under the pointer. -->
		{#if book}<div class="mb-3 flex"><button type="button" class="{btn} ml-auto h-8 px-3" onclick={() => (importing = false)}>Cancel re-import</button></div>{/if}
		{#key characterKey}<DpsRunsImport {characterKey} {characterName} {loadout} cores={nowCores} ondone={() => (importing = false)} />{/key}
	{:else}
		<!-- Two tabs: clears, or failed pulls and what they needed. A shared link has its one run. -->
		<div class="mb-3 flex items-center gap-2" hidden={!!shared}>
			<Segmented label="Runs" value={pick.use} options={[{ value: 'cleared', label: 'Cleared runs' }, { value: 'failed', label: 'Failed runs' }]} onselect={(v) => remember({ use: v as Use, clear: null })} size="h-8 px-4 text-sm" />
			<button type="button" class="{btn} ml-auto h-8 px-3" onclick={() => (importing = true)}>Re-import logs</button>
		</div>
		{#if !raid || !clear}
			<p class="text-sm text-surface-300">{pick.use === 'failed' ? 'No failed runs with boss HP.' : 'No cleared runs.'}</p>
		{:else}
		{@const art = raidArt(raid.name, true)}
		<!-- Two columns on wide screens: the raids on the left (best DPS on each), the picked one on the right. -->
		<div class={shared ? '' : 'lg:grid lg:grid-cols-[12.5rem_minmax(0,1fr)] lg:gap-4'}>
		<nav class="flex flex-col gap-1.5 max-lg:hidden" aria-label="Raids" hidden={!!shared}>
			{#each mainRaids as r (r.key)}
				{@const rart = raidArt(r.name)}
				{@const on = r === raid}
				<button type="button" class="relative h-14 w-full shrink-0 overflow-hidden rounded-xs border text-left transition {raidTone(r.name)} {on ? 'ring-2 ring-accent-300' : 'opacity-50 saturate-50 hover:opacity-100 hover:saturate-100'}" aria-pressed={on} onclick={() => remember({ raid: r.key, clear: null })}>
					{#if rart}<span class="absolute inset-0" style={rart}></span>{/if}
					<span class="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/10"></span>
					<span class="absolute inset-x-2 top-1.5 flex items-center gap-1.5"><span class="truncate text-sm font-semibold text-white">{r.name}</span></span>
					<span class="absolute inset-x-2 bottom-1.5 flex items-center gap-1.5">
						<span class="rounded-xs px-1 text-[10px] font-semibold {difficultyTone(r.difficulty)}">{r.difficulty || 'Normal'}</span>
						<span class="ml-auto rounded-xs bg-black/70 px-1 text-[10px] font-semibold tabular-nums {pick.use === 'failed' ? 'text-rose-200' : 'text-emerald-200'}">{runCount(r.runs)}</span>
					</span>
				</button>
			{/each}
			{#if unplayed.length}
				<ul class="mt-1 flex flex-col gap-0.5" aria-label="No runs">
					{#each unplayed as name (name)}
						<li class="flex items-center gap-1.5 rounded-xs px-1.5 py-1 text-xs text-surface-500"><span class="truncate">{name}</span><span class="ml-auto">no {pick.use === 'cleared' ? 'clears' : 'wipes'}</span></li>
					{/each}
				</ul>
			{/if}
			{#if otherRaids.length}
				<details class="mt-1" open={raid.kind === 'other'}>
				<summary class="cursor-pointer text-xs font-semibold tracking-wide text-surface-500 uppercase select-none hover:text-surface-300">Other fights ({otherRaids.length})</summary>
				<div class="mt-1 flex flex-col gap-0.5">
				{#each otherRaids as r (r.key)}
					{@const on = r === raid}
					<button type="button" class="flex items-center gap-1.5 rounded-xs px-1.5 py-1 text-left text-xs transition {on ? 'bg-surface-700 text-surface-50 ring-1 ring-accent-300' : 'text-surface-300 hover:bg-surface-800'}" aria-pressed={on} onclick={() => remember({ raid: r.key, clear: null })}>
						<span class="min-w-0 truncate">{r.name} <span class="text-surface-500">· {r.difficulty || 'Normal'}</span></span>
						<span class="ml-auto text-xs text-surface-400 tabular-nums">{runCount(r.runs)}</span>
					</button>
				{/each}
				</div>
				</details>
			{/if}
		</nav>
		<div class="min-w-0">
		<!-- Raid and run: one banner in the picked raid's official art, with the menus on it (the raid menu on phones). -->
		<div class="relative mb-3 overflow-hidden rounded-xs border {raidTone(raid.name)}" aria-label="Raid and run">
			{#if art}<span class="absolute inset-0" style={art} aria-hidden="true"></span>{/if}
			<span class="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/10" aria-hidden="true"></span>
			<div class="relative flex flex-wrap items-end gap-x-4 gap-y-2 px-3 py-3 sm:min-h-28">
				<div class="flex min-w-0 flex-col gap-1.5">
					<span class="flex items-center gap-2">
						<span class="rounded-xs px-1 text-[10px] font-semibold {difficultyTone(raid.difficulty)}">{raid.difficulty || 'Normal'}</span>
						<span class="text-xs text-white/70">{clears.length} {pick.use === 'cleared' ? (clears.length === 1 ? 'clear' : 'clears') : (clears.length === 1 ? 'failed run' : 'failed runs')}</span>
					</span>
					<h3 class="text-lg font-semibold text-white max-lg:hidden">{raid.name}</h3>
					<select class="{banner} max-w-full text-lg font-semibold lg:hidden" aria-label="Raid" value={raid.key} onchange={(e) => remember({ raid: e.currentTarget.value, clear: null })}>
						<optgroup label="Raids">{#each mainRaids as r (r.key)}<option value={r.key}>{r.name} · {r.difficulty || 'Normal'}</option>{/each}</optgroup>
						{#if otherRaids.length}<optgroup label="Other fights">{#each otherRaids as r (r.key)}<option value={r.key}>{r.name} · {r.difficulty || 'Normal'}</option>{/each}</optgroup>{/if}
					</select>
					<select class="{banner} {runTone(clear)} max-w-full text-xs" aria-label="Run" value={clear.id} onchange={(e) => remember({ clear: Number(e.currentTarget.value) })}>
						{#each clears as r (r.id)}<option value={r.id} class={runTone(r)}>{runLabel(r)}</option>{/each}
					</select>
				</div>
				{#if shared}<span class="ml-auto self-start rounded-xs border border-white/20 bg-black/55 px-2 py-1 text-xs text-white/90 backdrop-blur-sm">Shared run · {shared.run.player}</span>
				{:else}
					<!-- The run's full log (every player, every hit) on lostark.bible, when LOA Logs synced it. -->
					{#if clear.upstreamId}<a class="ml-auto self-start rounded-xs border border-white/20 bg-black/55 px-2 py-1 text-xs text-white/90 backdrop-blur-sm hover:border-white/40 hover:text-white" href="https://lostark.bible/logs/{clear.upstreamId}" target="_blank" rel="noopener">Log details ↗</a>{/if}
				{/if}
			</div>
		</div>

		<!-- The run in a few facts, the same shape for clears and wipes (left: how it ended; right: your part), so switching
		     runs or tabs doesn't move the page. An enrage's right side: the party's shortfall and your part of it (everyone the
		     same +%, so your DPS by the party's missing percent). -->
		{#if clear}
		{@const yours = clear.damage / (clear.duration / 1000)}
		{@const sharePct = clear.partyDamage ? Math.min(100, (clear.damage / clear.partyDamage) * 100) : null}
		<!-- A support's part of the run: the party damage their buffs added, and how much of the party's damage that was. -->
		{@const added = clear.support ? Object.values(clear.support.kinds).reduce((a, b) => a + b, 0) : 0}
		{@const need = wipe ? yours * (1 + wipe.partyPct / 100) : 0}
		{@const hint = wipe?.pattern?.kind === 'time' ? `${wipe.pattern.count} pulls ended near ${time(wipe.pattern.at * 1000)}, boss HP varied` : wipe?.pattern?.kind === 'hp' ? `${wipe.pattern.count} pulls ended near ${hpText(wipe.pattern.at)} HP` : undefined}
		<div class="mb-3 grid gap-x-6 gap-y-2 rounded-xs border px-3 py-2 text-sm sm:grid-cols-2 {wipe && enrage ? 'border-rose-500/40 bg-rose-950/30' : 'border-surface-700 bg-surface-950/50'}">
			<dl class="grid grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3 gap-y-0.5 text-surface-300">
				<dt>{wipe ? 'Wiped at' : clear.cleared ? 'Cleared at' : 'Ended at'}</dt><dd class="font-semibold text-surface-50 tabular-nums">{time(clear.duration)}</dd>
				<dt class="max-w-48 truncate">{clear.boss}</dt><dd class="font-semibold tabular-nums {wipe ? 'text-rose-200' : 'text-emerald-300'}">{wipe ? `${hpText(wipe.hpLeftPct)} HP` : clear.cleared ? 'Cleared' : '—'}</dd>
				<dt>Players dead</dt><dd class="font-semibold text-surface-50 tabular-nums">{clear.dead?.of ? `${clear.dead.count} of ${clear.dead.of}` : '—'}</dd>
				<dd class="col-span-2 mt-1 flex h-6 min-w-0 items-center gap-2" title={hint}>
					{#if wipe}
						<Segmented label="Cause" value={enrage ? 'enrage' : 'mech'} options={[{ value: 'enrage', label: 'Enrage', color: 'var(--color-rose-700)' }, { value: 'mech', label: 'Mech fail' }]} onselect={(v) => markEnrage(clear, v === 'enrage')} size="h-6 px-2 text-xs" />
						{#if hint}<span class="truncate text-xs text-surface-500">{hint}</span>{/if}
					{/if}
				</dd>
			</dl>
			<dl class="grid grid-cols-[max-content_minmax(0,1fr)] content-start gap-x-3 gap-y-0.5 text-surface-300">
				{#if isSupport}
					<dt>Party DPS added</dt><dd class="font-semibold text-surface-50 tabular-nums">{added ? formatDamage(added / (clear.duration / 1000)) : '—'}</dd>
					<dt>Of party damage</dt><dd class="font-semibold text-surface-50 tabular-nums">{added && clear.partyDamage ? `${((added / clear.partyDamage) * 100).toFixed(1)}%` : '—'}</dd>
					{#if spread}<dt>Same gear</dt><dd class="text-surface-200 tabular-nums" title="This fight's cleared runs on this run's gear (same gear snapshot): run-to-run spread">{formatDamage(spread.low)}–{formatDamage(spread.high)} <span class="text-surface-500">({spread.count} runs)</span></dd>{/if}
					{#if byBuild}
						<dt class="self-start">By build</dt>
						<dd><ul class="space-y-0.5">{#each byBuild as b (b.build)}<li class="tabular-nums {b.build === buildOfRun(clear) ? 'text-surface-50' : 'text-surface-400'}" title="This fight's cleared runs on this build: average DPS (cores read off each run's own snapshot)"><span class="font-semibold">{formatDamage(b.avg)}</span> {buildName(b.build)} <span class="text-surface-500">({b.count})</span></li>{/each}</ul></dd>
					{/if}
					{#if wipe && enrage}<dt>Party short</dt><dd class="font-semibold text-rose-100 tabular-nums">+{wipe.partyPct.toFixed(1)}% damage</dd>{/if}
				{:else if wipe && enrage}
					<dt>Party short</dt><dd class="font-semibold text-rose-100 tabular-nums">+{wipe.partyPct.toFixed(1)}% damage</dd>
					<dt>Your part</dt><dd class="text-rose-100 tabular-nums">{formatDamage(yours)} → <span class="font-semibold">{formatDamage(need)}</span> DPS</dd>
					<dt>Short by</dt><dd class="font-semibold text-rose-100 tabular-nums">{formatDamage(need - yours)}</dd>
					<dd class="col-span-2 mt-1 flex h-6 items-center">{#if target}<button type="button" class="h-6 rounded-xs border border-rose-400/50 bg-rose-500/15 px-2 text-xs font-semibold text-rose-100 hover:bg-rose-500/30" onclick={() => target?.planFor(`${(need / 1e6).toFixed(1)}m`)}>Plan DPS</button>{/if}</dd>
				{:else}
					<dt>Your DPS</dt><dd class="font-semibold text-surface-50 tabular-nums">{formatDamage(yours)}</dd>
					<dt>Party share</dt><dd class="font-semibold text-surface-50 tabular-nums">{sharePct !== null ? `${sharePct.toFixed(1)}%` : '—'}</dd>
					{#if spread}<dt>Same gear</dt><dd class="text-surface-200 tabular-nums" title="This fight's cleared runs on this run's gear (same gear snapshot): run-to-run spread">{formatDamage(spread.low)}–{formatDamage(spread.high)} <span class="text-surface-500">({spread.count} runs)</span></dd>{/if}
					{#if byBuild}
						<dt class="self-start">By build</dt>
						<dd><ul class="space-y-0.5">{#each byBuild as b (b.build)}<li class="tabular-nums {b.build === buildOfRun(clear) ? 'text-surface-50' : 'text-surface-400'}" title="This fight's cleared runs on this build: average DPS (cores read off each run's own snapshot)"><span class="font-semibold">{formatDamage(b.avg)}</span> {buildName(b.build)} <span class="text-surface-500">({b.count})</span></li>{/each}</ul></dd>
					{/if}
				{/if}
			</dl>
		</div>
		{/if}

		<!-- Baseline: the run's own setup (its snapshot). One status line; what else differs folds away. -->
		{#if shared}
			<div class="mb-3 flex flex-wrap items-center gap-x-2 rounded-xs border border-surface-700 bg-surface-950/50 px-3 py-2 text-xs text-surface-300">
				<span class="text-sm font-semibold text-surface-100">Run setup</span>
				<span class="tabular-nums">CP {simulate(loadout, shared.baseline, base).cp.toFixed(2)}</span>
				{#if onsimulate}<button type="button" class="ml-auto rounded-xs border border-accent-500/70 bg-accent-700/30 px-2 py-0.5 font-semibold text-accent-100 hover:bg-accent-700/60" title="Load the run's gear into the Simulator (Undo brings the shared edits back)" onclick={() => onsimulate(structuredClone($state.snapshot(shared.baseline)) as SimState)}>Simulate from this setup</button>{/if}
			</div>
		{:else if setup}
			{@const recorded = setup.snap?.combatPower?.score ?? null}
			{@const build = diff ? [...(diff.cores ? ['Ark Grid cores'] : []), ...diff.passives.map((t) => t.tree), ...diff.other] : []}
			<div class="mb-3 rounded-xs border border-surface-700 bg-surface-950/50 px-3 py-2 text-xs">
				<p class="flex flex-wrap items-center gap-x-2 text-surface-300">
					<span class="text-sm font-semibold text-surface-100">Run setup</span>
					{#if recorded}<span class="tabular-nums">CP {recorded.toFixed(2)}</span>{/if}
					<span class="text-surface-400" title="LOA Logs saves a lostark.bible snapshot of your gear with each fight; the meter starts from it, so only your edits count">· LOA Logs snapshot</span>
					<a class="ml-auto text-sky-300 hover:underline" href={bibleSnapshotPage(setup.hash)} target="_blank" rel="noopener">lostark.bible ↗</a>
				</p>
				{#if setup.error}
					<p class="mt-1 text-amber-300">{setup.error}</p>
				{:else if !diff}
					<div class="animate-pulse" aria-label="Loading"><div class="mt-1.5 h-3 w-32 rounded-xs bg-surface-800"></div><div class="mt-1.5 h-3 w-96 max-w-full rounded-xs bg-surface-800"></div></div>
				{:else}
					{#if sameSetupGear(diff)}
						<p class="mt-1 text-green-400">● Same gear as now</p>
					{:else}
						<p class="mt-1 text-amber-300">● Changed since: {[...diff.gear, ...(diff.gems ? ['Gems'] : [])].join(', ')}</p>
						<!-- The run was on other gear: the meter replays it with today's. To plan from the gear it was played with, the
						     run's setup goes into the Simulator (Undo brings the edits back). -->
						{#if clearSetup && onsimulate}
							<div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
								<button type="button" class="h-9 rounded-xs bg-accent-700 px-4 text-sm font-semibold text-white hover:bg-accent-600" title="Load this run's gear, cores and gems into the Simulator, so upgrades and Target DPS start from it (Undo brings yours back)" onclick={() => { onsimulate(structuredClone($state.snapshot(clearSetup.state)) as SimState); fromSetup = clear?.id ?? null; }}>Simulate from this setup</button>
								{#if fromSetup === clear?.id}<span class="text-green-400">● Planning from this run's gear</span>{/if}
							</div>
						{/if}
					{/if}
					{#if build.length}
						<details class="mt-0.5 text-surface-400">
							<summary class="cursor-pointer select-none hover:text-surface-200">Different build: {build.join(', ')} <span class="text-surface-500">(not valued)</span></summary>
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
		{:else}
			<!-- No snapshot for this run: the loaded gear stands in once the player says so, as close as its CP is. -->
			<div class="mb-3 rounded-xs border border-amber-500/40 px-3 py-2 text-xs text-amber-200">
				<p class="flex flex-wrap items-center gap-2">
					<span class="text-sm font-semibold text-surface-100">Run setup</span>
					<span>{#if otherSetup}<span title="Its Ark Passive or Order cores aren't the ones this run recorded: lostark.bible kept another setup (its highest-CP one)">LOA Logs snapshot is another setup</span>{:else}No LOA Logs snapshot{/if} · loaded gear stands in{#if gap !== null && !matches}{' '}({Math.abs(gap).toFixed(1)}% CP {gap > 0 ? 'above' : 'below'} the run){/if}</span>
					{#if better}<button type="button" class="font-semibold underline hover:text-white" onclick={better.select}>Use {better.label}</button>{/if}
					{#if baselineReady}<span class="ml-auto text-surface-400">Using loaded gear</span>
					{:else}<button type="button" class="ml-auto rounded-xs border border-amber-400/50 px-2 py-0.5 hover:bg-amber-500/10" onclick={() => { confirmed = baselineKey; remember({ loaded: [baselineKey, ...pick.loaded.filter((k) => k !== baselineKey)].slice(0, 100) }); }}>Use loaded gear</button>{/if}
				</p>
			</div>
		{/if}

		<!-- Target DPS above the meter, for clears and wipes alike: the skill list below can be long. -->
		{#if head && onsimulate}
			<!-- Keyed by the run: a plan belongs to the run it was made on, so another raid or run starts clean. -->
			{#key `${clear.id}:${clear.start}`}<div class="mb-3"><DpsTarget bind:this={target} {loadout} simState={plain} {base} {characterKey} {characterName} {selection} meterDps={simulatedDps} onapply={onsimulate} /></div>{/key}
		{/if}
		{#if meter}<div bind:this={meterBox}><DpsMeter {meter} {skillName} {skillIcon} color={classColor(loadout.classId) ?? 'var(--color-accent-500)'} /></div>
			<DpsLimits notIn={meter.notInMeter} notes={meter.notes} />
		{:else if supMeter}<div bind:this={meterBox}><SupportMeterView meter={supMeter} color={classColor(loadout.classId) ?? 'var(--color-accent-500)'} /></div>
			<DpsLimits notIn={supMeter.notInMeter} />
		{:else if isSupport}<p class="text-sm text-surface-300">No buff data for this run. Re-import to read it; LOA Logs records it on newer runs.</p>{/if}
		</div>
		</div>
		{/if}
	{/if}
	</div>
	{/if}
</section>

{#if away && head && raid && clear}
	{@const gap = wipeGap(clear)}
	{@const outcome = clear.cleared === false ? `Failed at ${gap ? hpText(gap.hpLeftPct) : '?'}` : clear.cleared ? 'Clear' : 'Unknown'}
	{@const tint = Math.abs(gainPct) < 0.0005 ? 'border-surface-600 text-surface-300' : gainPct > 0 ? 'border-green-500/50 bg-green-500/15 text-green-300' : 'border-red-500/50 bg-red-500/15 text-red-300'}
	<!-- Follows the page while the cards below are edited: under the site header on wide screens, above Next Upgrades on
	     phones. The Simulator's sticky card headers sit under it (data-dps-bar). A click comes back to the sim. -->
	<div data-dps-bar class="fixed inset-x-0 top-12 z-40 border-b border-surface-800 bg-surface-950/90 shadow-md shadow-black/40 backdrop-blur max-lg:hidden">
		<div class="mx-auto flex h-11 max-w-[1680px] items-center gap-3 px-4 text-xs text-surface-400">
			<span class="h-6 w-1 shrink-0 rounded-full" style:background={classColor(loadout.classId) ?? 'var(--color-accent-500)'}></span>
			<span class="font-semibold text-surface-100">DPS sim</span>
			<span class="rounded-xs px-1 text-[10px] font-semibold {difficultyTone(raid.difficulty)}">{raid.difficulty || 'Normal'}</span>
			<span class="truncate text-surface-200">{raid.name}{gate(clear) ? ` G${gate(clear)}` : ''}</span>
			<span class="shrink-0 {runTone(clear)}">{outcome} · {time(clear.duration)}</span>
			<span class="ml-auto shrink-0">Recorded <span class="font-semibold text-surface-200 tabular-nums">{dpsText(recordedDps)}</span></span>
			<span aria-hidden="true">→</span>
			<span class="shrink-0">Simulated <span class="text-base font-bold text-surface-50 tabular-nums">{dpsText(simulatedDps)}</span></span>
			<span class="shrink-0 rounded-xs border px-1.5 py-0.5 font-semibold tabular-nums {tint}">{Math.abs(gainPct) < 0.0005 ? '±0' : `${simulatedDps >= recordedDps ? '+' : ''}${formatDamage(simulatedDps - recordedDps)} (${formatPct(gainPct)}%)`}</span>
			{#if head.notIn.length}<span class="shrink-0 text-amber-300" title="Edits that still count toward CP, not DPS: {head.notIn.join(', ')}">※ {head.notIn.length} not counted</span>{/if}
			<button type="button" class="shrink-0 rounded-xs border border-surface-600 px-2 py-1 text-surface-200 hover:border-surface-400 hover:text-surface-50" onclick={() => section?.scrollIntoView({ block: 'start' })}>↑ DPS sim</button>
		</div>
	</div>
	<button type="button" class="fixed inset-x-3 bottom-[4.25rem] z-30 flex flex-col gap-0.5 rounded-xs border bg-surface-900/95 px-3 py-1.5 text-left text-xs shadow-lg shadow-black/60 backdrop-blur lg:hidden {tint.split(' ')[0]}" onclick={() => section?.scrollIntoView({ block: 'start' })} aria-label="Back to the DPS sim">
		<span class="flex w-full items-center gap-2 text-surface-400">
			<span class="h-3 w-1 shrink-0 rounded-full" style:background={classColor(loadout.classId) ?? 'var(--color-accent-500)'}></span>
			<span class="truncate text-surface-200">{raid.name}{gate(clear) ? ` G${gate(clear)}` : ''}</span>
			<span class="shrink-0 {runTone(clear)}">{outcome}</span>
			{#if head.notIn.length}<span class="ml-auto shrink-0 text-amber-300">※ {head.notIn.length}</span>{/if}
		</span>
		<span class="flex w-full items-center gap-2">
			<span class="text-surface-400 tabular-nums">{dpsText(recordedDps)} →</span>
			<span class="text-sm font-bold text-surface-50 tabular-nums">{dpsText(simulatedDps)}</span>
			<span class="ml-auto rounded-xs border px-1.5 font-semibold tabular-nums {tint}">{Math.abs(gainPct) < 0.0005 ? '±0' : `${formatPct(gainPct)}%`}</span>
		</span>
	</button>
{/if}
