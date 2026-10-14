<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import CharacterSwitcher from '$lib/CharacterSwitcher.svelte';
	import { characterKey, loadSavedCharacter, setLoadoutKind, setSnapshot, type SavedCharacter } from '$lib/saved-character';
	import { listSnapshots } from '$lib/snapshot-history';
	import type { LoadoutKind } from '$lib/bible-data';
	import { loadRuns, runsBooks } from '$lib/logs/runs-store.svelte';
	import { raidGateOf } from '$lib/logs/raids';
	import type { SavedStatValues } from '$lib/logs/stat-values-store.svelte';
	import { loadAutosave, savedSimulations, sameBaseline, type SavedSimulation } from './saved-simulations';
	import { initSimState, simulate, type SimState } from './simulate';
	import { combineStatValues, gateSample, raidsOf, type RaidGroup } from './dps-gates';
	import { analyzeDpsPlan } from './dps-plan';
	import { explainGem, gemChoices, planModel, runGains, statExplanations, type GemExplanation, type StatExplanation } from './dps-explain';
	import { modelGain, modelMarginals, type PartKey } from './dps-model';
	import { checkEngravings, raidLoadout, type LoadoutOption } from './dps-loadout';
	import { difficultyTone, raidArt, raidTone } from './raid-art';
	import { CATEGORY_LABELS, type UpgradeCategory } from './upgrades';
	import { GEM_SKILLS } from './game-data';
	import { formatDate, formatPct } from './format';
	import { className } from './class-names';
	import { iconUrl } from './icons';
	import { roleOf } from './roles';
	import DpsRunsImport from './DpsRunsImport.svelte';

	let character = $state<SavedCharacter | null>(null);
	let working = $state.raw<SimState | null>(null);
	let plans = $state<SavedSimulation[]>([]);
	let selectedPlan = $state('working');
	let hasAutosave = $state(false);
	let showImport = $state(false);
	const wanted = $derived(page.url.searchParams.get('c'));
	function refresh() {
		character = loadSavedCharacter(wanted);
		if (character?.loadout) {
			const key = characterKey(character);
			const draft = loadAutosave(key, character.loadout);
			hasAutosave = !!draft;
			working = draft ?? initSimState(character.loadout);
			plans = savedSimulations(key).filter(plan => sameBaseline(plan.loadout, character!.loadout!));
			if (!plans.some(plan => plan.id === selectedPlan)) selectedPlan = 'working';
		} else { working = null; plans = []; }
		if (character) loadRuns(characterKey(character), true);
	}
	$effect(() => { void wanted; untrack(() => { selectedPlan = 'working'; refresh(); }); });
	onMount(() => {
		const storageChanged = (e: StorageEvent) => {
			if (!e.key || e.key.startsWith('loa-sim:')) refresh();
		};
		window.addEventListener('storage', storageChanged);
		window.addEventListener('focus', refresh);
		return () => {
			window.removeEventListener('storage', storageChanged);
			window.removeEventListener('focus', refresh);
		};
	});
	const key = $derived(character ? characterKey(character) : '');
	const loadout = $derived(character?.loadout ?? null);
	const chosen = $derived(plans.find(plan => plan.id === selectedPlan));
	const sourceState = $derived(chosen?.state ?? working);
	const book = $derived(key ? runsBooks.byCharacter[key] ?? null : null);
	const day = formatDate;

	// Which raid: cards, newest first; Guardian raids, solo and other fights sit apart. Gate and run narrow it down.
	const raids = $derived(book ? raidsOf(book.runs) : []);
	const mainRaids = $derived(raids.filter(r => r.kind === 'raid'));
	const otherRaids = $derived(raids.filter(r => r.kind === 'other'));
	let selectedRaid = $state<string | null>(null);
	let gateFilter = $state<string | null>(null);
	let runPick = $state<number | null>(null);
	const raidStorage = $derived(`loa-sim:dps-raid:${key}`);
	$effect(() => { void raidStorage; untrack(() => { try { selectedRaid = localStorage.getItem(raidStorage); } catch { selectedRaid = null; } }); });
	function chooseRaid(raidKey: string) {
		selectedRaid = raidKey;
		gateFilter = null;
		runPick = null;
		pick = null;
		tab = 'All';
		try { localStorage.setItem(raidStorage, raidKey); } catch { /* remembered for this visit only */ }
	}
	const raid = $derived<RaidGroup | null>(raids.find(r => r.key === selectedRaid) ?? mainRaids[0] ?? otherRaids[0] ?? null);
	const gateRuns = $derived(raid ? (raid.gates.find(g => g.key === gateFilter)?.runs ?? raid.runs) : []);
	const runs = $derived(runPick !== null ? gateRuns.filter(r => r.id === runPick) : gateRuns);
	const gateLabel = (boss: string) => { const g = raidGateOf(boss)?.gate; return g ? `G${g}` : ''; };
	const scopeName = $derived(raid ? `${raid.name}${gateFilter && raid.gates.length > 1 ? ` ${gateLabel(raid.gates.find(g => g.key === gateFilter)!.boss)}` : ''}` : '');
	const scopeDetail = $derived.by(() => {
		if (!raid || !runs.length) return '';
		if (runPick !== null) return `1 clear on ${day(runs[0].start)}`;
		const first = runs[runs.length - 1].start, last = runs[0].start;
		return `${runs.length} ${runs.length === 1 ? 'clear' : 'clears'}${raid.gates.length > 1 && !gateFilter ? ', all gates' : ''} · ${day(first)}${first !== last ? ` – ${day(last)}` : ''}`;
	});
	const duration = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`;

	// The plan with this scope's skill shares.
	const gs = $derived(runs.length ? gateSample(runs) : null);
	const sample = $derived<SavedStatValues | undefined>(gs && book
		? { values: gs.values, label: scopeName, at: book.importedAt, skillShares: gs.skillShares, skillCooldownUse: gs.skillCooldownUse }
		: undefined);
	const analysis = $derived(loadout && sourceState ? analyzeDpsPlan(loadout, sourceState, sample) : null);
	const simulatorUrl = $derived(`/sim?c=${encodeURIComponent(key)}`);
	const support = $derived(loadout ? roleOf(loadout).support : false);
	const cp = $derived(loadout && analysis ? { from: simulate(loadout, analysis.base, analysis.base).cp, to: simulate(loadout, analysis.target, analysis.base).cp } : null);
	const skillName = (id: number, fallback: string) => book?.skills[id]?.[0] ?? fallback;
	const skillIcon = (id: number) => book?.skills[id]?.[1] || GEM_SKILLS[id]?.[1];

	// Is the loaded gear what the player raids in? Logs record the engravings each clear used.
	type Ref = { kind: LoadoutKind } | { snapshot: string };
	const gearCheck = $derived.by(() => {
		const newest = raid?.runs[0];
		if (!character || !loadout || !newest) return null;
		const check = checkEngravings(loadout, newest);
		if (!check || !check.notInRun.length) return null;
		const options: LoadoutOption<Ref>[] = [
			...(Object.entries(character.loadouts ?? {}) as [LoadoutKind, NonNullable<typeof loadout>][]).map(([kind, l]) => ({ loadout: l, ref: { kind } as Ref, label: kind === 'current' ? 'your latest raid snapshot' : "bible's estimated loadout" })),
			...listSnapshots(key).map(s => ({ loadout: s.loadout, ref: { snapshot: s.id } as Ref, label: `your kept snapshot from ${day(s.takenAt)}` }))
		].filter(o => o.loadout !== loadout);
		return { check, run: newest, better: raidLoadout(options, newest) };
	});
	function switchGear(ref: Ref) {
		if ('kind' in ref) setLoadoutKind(key, ref.kind); else setSnapshot(key, ref.snapshot);
		refresh();
	}

	// The stat model: bucket totals from the build's recent runs with the meter's values, crit rate from this scope.
	const model = $derived(loadout && analysis && book && runs.length ? planModel(loadout, analysis.target, analysis.base, book.runs, runs) : null);

	// Upgrades, each one step on top of the current plan, ranked by DPS in this raid.
	const shares = $derived(sample?.skillShares ?? sourceState?.skillShares ?? {});
	const cooldownUse = $derived(sample?.skillCooldownUse ?? sourceState?.skillCooldownUse ?? {});
	interface Candidate { id: string; label: string; group: string; distinct: string; gainPct: number | null; cpPct: number; rough: boolean; gem?: GemExplanation; stat?: StatExplanation }
	const candidates = $derived.by((): Candidate[] => {
		if (!loadout || !analysis || !model) return [];
		const gems = gemChoices(loadout, analysis.target).map(c => explainGem(loadout, analysis.target, analysis.base, c, shares, cooldownUse, model.input));
		const stats = statExplanations(loadout, analysis.target, analysis.base, model.input);
		return [
			...gems.map(g => ({ id: `gem:${g.choice.index}`, label: g.choice.label, group: 'Gem', distinct: `gem:${g.choice.index}`, gainPct: g.gainPct, cpPct: g.cpPct, rough: g.rough, gem: g })),
			...stats.map(e => ({ id: `stat:${e.key}`, label: e.label, group: CATEGORY_LABELS[e.category as UpgradeCategory] ?? e.category, distinct: e.group, gainPct: e.gainPct, cpPct: e.cpPct, rough: false, stat: e }))
		];
	});
	/** Options that exclude each other (one accessory slot's lines) show their best one unless asked. */
	let allOptions = $state(false);
	let showAll = $state(false);
	const ranked = $derived.by(() => {
		const seen = new Set<string>();
		return candidates
			.filter(c => c.gainPct !== null)
			.toSorted((x, y) => y.gainPct! - x.gainPct! || y.cpPct - x.cpPct)
			.filter(c => allOptions || (!seen.has(c.distinct) && !!seen.add(c.distinct)));
	});
	const unestimated = $derived(candidates.filter(c => c.gainPct === null));
	const statsBlocked = $derived(!!model && !model.input.buckets);
	const cpRank = $derived(new Map(ranked.toSorted((x, y) => y.cpPct - x.cpPct).map((c, i) => [c.id, i + 1])));
	const dpsRank = $derived(new Map(ranked.map((c, i) => [c.id, i + 1])));
	/** Category tabs over the ranked list; rows keep their overall DPS rank. */
	let tab = $state('All');
	const tabs = $derived(['All', ...new Set(ranked.map(c => c.group))]);
	const tabLabel = (t: string) => (t === 'Gem' ? 'Gems' : t);
	const inTab = $derived(tab === 'All' || !tabs.includes(tab) ? ranked : ranked.filter(c => c.group === tab));
	const TOP = 8;
	const listed = $derived(showAll ? inTab : inTab.slice(0, TOP));
	const runsWithValues = $derived(runs.filter(r => r.statValues).length);
	const topScale = $derived(Math.max(0.01, ...ranked.map(c => c.gainPct ?? 0)));
	let pick = $state<string | null>(null);
	const shown = $derived(ranked.find(c => c.id === pick) ?? ranked[0]);
	function choose(id: string) {
		pick = id;
		// Desktop keeps the explanation beside the list (sticky); narrower screens stack it below, so go to it.
		if (!matchMedia('(min-width: 1280px)').matches) document.getElementById('dps-why')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	// Why: the breakdown of the chosen upgrade.
	const partName: Record<PartKey, string> = { attack: 'Attack', additionalDamage: 'Additional Damage', evoDamage: 'Evolution Damage', critRate: 'Crit Rate', critDamage: 'Crit Damage' };
	const statNote = (part: PartKey, change: number) => {
		const b = model?.input.buckets;
		const n = (v: number, d = 1) => v.toFixed(d);
		switch (part) {
			case 'attack': return `attack +${n(change, 2)}%; ${b ? `${n(b.ownAttack * 100, 0)}% of your attack in fights is your own, the rest is party buffs` : ''}`;
			case 'additionalDamage': return `+${n(change)}% on top of the ${b ? n(b.additionalDamage) : '?'}% you have`;
			case 'evoDamage': return `+${n(change)}% on top of the ${b ? n(b.evoDamage) : '?'}% you have`;
			case 'critDamage': return `+${n(change)}% × ${b ? n(b.critDamage, 3) : '?'}% per point (about the same in every fight)`;
			case 'critRate': return `+${n(change)}% × ${model?.input.critRate != null ? n(model.input.critRate, 3) : '?'}% per point in this raid`;
		}
	};
	type Row = { name: string; icon?: string; note: string; value: number };
	const rows = $derived.by((): Row[] => {
		if (!shown) return [];
		if (shown.stat) return shown.stat.parts.map(p => ({ name: partName[p.key], note: statNote(p.key, p.change), value: p.gainPct }));
		const g = shown.gem!;
		const kindWord = g.choice.kind === 'damage' ? 'harder' : 'more often';
		const list: Row[] = g.parts.map(p => ({ name: skillName(p.skill, p.name), icon: skillIcon(p.skill), note: `${p.share.toFixed(1)}% of your damage × ${g.effectPct.toFixed(2)}% ${kindWord}`, value: p.gainPct }));
		if (g.baseAttackPct) list.push({ name: 'Base attack', note: `the gem adds ${g.baseAttack.toFixed(2)}% base attack to every skill`, value: g.baseAttackPct });
		return list;
	});
	const scale = $derived(Math.max(0.01, ...rows.map(r => Math.abs(r.value))));
	const skillShareTotal = $derived(shown?.gem ? shown.gem.parts.reduce((s, p) => s + p.share, 0) : 0);

	// The same upgrade in the player's other raids, and run by run here.
	const acrossRaids = $derived.by(() => {
		if (!shown || !loadout || !analysis || !book) return [];
		return mainRaids.slice(0, 8).map(r => {
			const m = planModel(loadout, analysis.target, analysis.base, book.runs, r.runs).input;
			let gain: number | null;
			if (shown.gem) {
				const s = gateSample(r.runs);
				gain = explainGem(loadout, analysis.target, analysis.base, shown.gem.choice, s.skillShares, s.skillCooldownUse, m).gainPct;
			} else gain = modelGain(shown.stat!.delta, m).gainPct;
			return { raid: r, gain };
		});
	});
	const raidScale = $derived(Math.max(0.01, ...acrossRaids.map(x => Math.abs(x.gain ?? 0))));
	const sameEverywhere = $derived(!!shown?.stat && !shown.stat.delta.critRate);
	const shownRuns = $derived(shown?.gem ? runGains(runs, shown.gem).map(r => ({ ...r, totalPct: ((1 + r.gainPct / 100) * (1 + (shown.gem!.baseAttackPct ?? 0) / 100) - 1) * 100 })) : []);
	const runScale = $derived(Math.max(0.01, ...shownRuns.map(r => Math.abs(r.totalPct))));
	const check = $derived.by(() => {
		if (!model) return null;
		const ours = modelMarginals(model.input);
		const meter = combineStatValues(runs.map(r => r.statValues));
		const keys = [['weaponPower', '+1,000 Weapon Power'], ['mainStat', '+1,000 main stat'], ['attackPowerPct', '+1% Atk. Power'], ['additionalDamage', '+1% Additional Damage'], ['evoDamage', '+1% Evolution Damage'], ['critDamage', '+1% Crit Damage'], ['critRate', '+1% Crit Rate']] as const;
		return keys.map(([k, label]) => ({ label, ours: ours[k] ?? null, meter: meter?.statSamples?.[k] ? meter[k] : null }));
	});

	const pct = (n: number | null) => n === null ? '—' : `${formatPct(n)}%`;
	const panel = 'rounded-xl border border-surface-700 bg-surface-900 p-4';
	const heading = 'mb-3 text-sm font-semibold uppercase tracking-wider text-surface-400';
	const bar = 'grid grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-x-3 gap-y-1 text-sm';
</script>

{#snippet raidCard(r: RaidGroup, small: boolean)}
	{@const art = raidArt(r.name)}
	{@const on = r === raid}
	<button class="relative shrink-0 overflow-hidden rounded-xl border text-left transition {small ? 'h-24 w-36 lg:h-20 lg:w-full' : 'h-32 w-48 lg:h-20 lg:w-full'} {raidTone(r.name)} {on ? 'ring-2 ring-sky-400 ring-offset-2 ring-offset-surface-950' : 'opacity-75 hover:opacity-100'}" onclick={() => chooseRaid(r.key)} aria-pressed={on}>
		{#if art}<span class="absolute inset-0" style={art}></span>{/if}
		<span class="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/10 lg:bg-gradient-to-r lg:from-black/80 lg:via-black/35 lg:to-transparent"></span>
		<span class="absolute left-2 top-2 rounded-xs px-1.5 text-xs font-semibold {difficultyTone(r.difficulty)} backdrop-blur-sm lg:left-auto lg:right-2">{r.difficulty || 'Normal'}</span>
		{#if on}<span class="absolute right-2 top-2 rounded-full bg-sky-400 px-1.5 text-xs font-bold text-surface-950 lg:hidden">✓</span>{/if}
		<span class="absolute inset-x-2 bottom-2">
			<span class="block truncate font-semibold text-white {small ? 'text-sm' : 'text-lg lg:text-base'}">{r.name}</span>
			<span class="block truncate text-xs text-white/70">{r.subtitle ? `${r.subtitle} · ` : ''}{r.runs.length} {r.runs.length === 1 ? 'clear' : 'clears'} · {day(r.last)}</span>
		</span>
	</button>
{/snippet}

{#if character && loadout && analysis}
	<CharacterSwitcher current={key} simulatorPath="/dps" />
	<!-- Top bar: who, which gear plan, and what that plan does to CP. -->
	<header class="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border border-surface-700 bg-surface-900 px-4 py-3">
		<div class="min-w-0">
			<p class="text-xs uppercase tracking-widest text-sky-300">DPS Sim · experimental</p>
			<h1 class="mt-0.5 text-2xl font-semibold">{character.name} <span class="text-sm font-normal text-surface-400">{className(loadout.classId)}</span></h1>
			<label class="mt-1 flex flex-wrap items-center gap-2 text-sm text-surface-400">Gear
				<select class="rounded-xs border border-surface-600 bg-surface-800 px-2 py-0.5 text-surface-100" bind:value={selectedPlan}>
					<option value="working">{hasAutosave ? 'Current Simulator changes' : 'Snapshot, no changes'}</option>
					{#each plans as plan}<option value={plan.id}>{plan.name}</option>{/each}
				</select>
				<a href={simulatorUrl} class="text-sky-300 hover:underline">Edit</a>
			</label>
		</div>
		{#if cp}
			<div class="ml-auto text-right">
				<p class="text-xs text-surface-400">Combat Power</p>
				<p class="tabular-nums"><span class="text-lg text-surface-300">{cp.from.toFixed(2)}</span>{#if Math.abs(cp.to - cp.from) > 0.005}<span class="px-2 text-surface-500">→</span><span class="text-lg font-semibold">{cp.to.toFixed(2)}</span> <span class="text-sm text-green-400">{formatPct((cp.to / cp.from - 1) * 100)}%</span>{/if}</p>
			</div>
		{/if}
	</header>

	{#if !book || showImport}
		<section class="mb-4 {panel}" aria-label="Import logs">
			{#if !book}<p class="mb-3 text-sm text-surface-300">How much an upgrade is worth depends on how much damage each skill deals in your own raids. Import your LOA Logs to start.</p>{/if}
			{#key key}<DpsRunsImport characterKey={key} characterName={character.name} ondone={() => { showImport = false; }} />{/key}
			{#if book}<button class="mt-3 text-xs text-sky-300 hover:underline" onclick={() => (showImport = false)}>Close</button>{/if}
		</section>
	{/if}

	{#if book}
		<!-- Phones: raid, list, why stacked. lg: raids beside the list, why under it. xl: three columns, why sticky. -->
		<div class="grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[16rem_minmax(0,1fr)_22rem]">
			<!-- 1 · Raid, and the data behind it -->
			<aside class="flex min-w-0 flex-col gap-3 lg:sticky lg:top-16 lg:row-span-2 lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto lg:pr-1" aria-label="Raid">
				<p class="text-xs font-semibold uppercase tracking-wider text-surface-400">1 · Raid</p>
				<div class="-mx-1 flex items-end gap-3 overflow-x-auto px-1 pt-1 pb-2 lg:mx-0 lg:flex-col lg:items-stretch lg:gap-2 lg:overflow-visible lg:p-1" aria-label="Raids">
					{#each mainRaids as r (r.key)}{@render raidCard(r, false)}{/each}
					{#if otherRaids.length}
						<span class="mx-1 h-24 w-px shrink-0 self-center bg-surface-700 lg:hidden"></span>
						<div class="shrink-0 lg:w-full">
							{#if raid?.kind === 'other'}{@render raidCard(raid, true)}{/if}
							<label class="mt-1 block text-xs text-surface-400">Guardian raids and other
								<select class="mt-0.5 block w-36 rounded-xs border border-surface-700 bg-surface-800 px-1.5 py-1 text-xs text-surface-100 lg:w-full" value={raid?.kind === 'other' ? raid.key : ''} onchange={(e) => e.currentTarget.value && chooseRaid(e.currentTarget.value)}>
									<option value="">{otherRaids.length} more…</option>
									{#each otherRaids as r}<option value={r.key}>{r.name} · {r.difficulty} · {r.runs.length}</option>{/each}
								</select>
							</label>
						</div>
					{/if}
				</div>

				<div class="flex flex-col gap-2.5 rounded-xl border border-surface-700 bg-surface-900 p-3 text-sm" aria-label="Your data">
					<p class="text-xs font-semibold uppercase tracking-wider text-surface-400">Your data</p>
					{#if gearCheck}
						<div class="rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs">
							<p class="text-amber-200">Gear check: the gear here has <span class="font-semibold">{gearCheck.check.notInRun.join(', ')}</span>, which your {raid?.name} clears didn't use (newest {day(gearCheck.run.start)}). Upgrades are for the gear loaded here.</p>
							{#if gearCheck.better}
								<button class="mt-1.5 rounded-md bg-amber-500/20 px-2 py-0.5 font-semibold text-amber-100 hover:bg-amber-500/30" onclick={() => switchGear(gearCheck.better!.ref)}>Use {gearCheck.better.label}</button>
							{:else}
								<p class="mt-1 text-amber-200/80">No saved loadout matches. Load your raid gear on lostark.bible or in Simulator.</p>
							{/if}
						</div>
					{:else if raid}
						<p class="flex items-center gap-2 text-surface-300"><span class="size-2 shrink-0 rounded-full bg-green-400"></span>Gear check: matches your clears</p>
					{/if}
					{#if raid}
						<p class="flex items-center gap-2 text-surface-300"><span class="size-2 shrink-0 rounded-full {runsWithValues ? 'bg-green-400' : 'bg-amber-400'}"></span>{runsWithValues}/{runs.length} {runs.length === 1 ? 'clear' : 'clears'} with the meter's stat values</p>
						{#if raid.gates.length > 1}
							<div class="flex flex-wrap gap-1.5" role="group" aria-label="Gates">
								{#each [null, ...raid.gates.map(g => g.key)] as g}
									<button class="rounded-full border px-2.5 py-0.5 text-xs {gateFilter === g ? 'border-sky-400 bg-sky-500/15 text-sky-200' : 'border-surface-700 text-surface-300 hover:border-surface-500'}" onclick={() => { gateFilter = g; runPick = null; }}>{g === null ? 'All gates' : gateLabel(raid.gates.find(x => x.key === g)!.boss) || raid.gates.find(x => x.key === g)!.boss}</button>
								{/each}
							</div>
						{/if}
						{#if gateRuns.length > 1}
							<select class="w-full rounded-xs border border-surface-700 bg-surface-800 px-2 py-1 text-xs text-surface-200" aria-label="Clear" value={runPick ?? ''} onchange={(e) => runPick = e.currentTarget.value ? Number(e.currentTarget.value) : null}>
								<option value="">All {gateRuns.length} clears</option>
								{#each gateRuns as r}<option value={r.id}>{day(r.start)} · {gateLabel(r.boss) || r.boss} · {duration(r.duration)}</option>{/each}
							</select>
						{/if}
					{/if}
					<button class="self-start text-xs text-sky-300 hover:underline" onclick={() => (showImport = !showImport)}>{showImport ? 'Close import' : 'Re-import logs'}</button>
				</div>
			</aside>

			<!-- 2 · Best DPS upgrades for the raid -->
			<div class="min-w-0">
				{#if support}
					<p class="{panel} text-sm text-surface-300">DPS estimates cover damage dealers for now. Pick a dealer character to compare upgrades.</p>
				{:else if raid && runs.length}
					{@const art = raidArt(raid.name)}
					<section class="overflow-hidden rounded-xl border border-surface-700 bg-surface-900" aria-label="Upgrades ranked by DPS">
						<div class="relative px-4 py-3.5 {raidTone(raid.name)} border-0 border-b">
							<!-- The art sits on the right, about a card's shape, so its crop (tuned for cards) shows the boss
							     instead of a thin strip across a very wide banner; it fades into the title on the left. -->
							{#if art}<span class="absolute inset-y-0 right-0 w-[min(60%,26rem)]" style={art}></span>{/if}
							<span class="absolute inset-0 bg-gradient-to-r from-black/90 via-black/60 to-black/0"></span>
							<div class="relative">
								<p class="text-xs uppercase tracking-wider text-white/70">2 · Best DPS upgrades for</p>
								<p class="text-2xl font-semibold text-white">{scopeName} <span class="ml-1 rounded-xs px-1.5 align-middle text-xs font-semibold {difficultyTone(raid.difficulty)}">{raid.difficulty || 'Normal'}</span></p>
								<p class="text-xs text-white/70">From your {scopeDetail}</p>
							</div>
						</div>
						{#if tabs.length > 2}
							<div class="flex flex-wrap gap-1.5 border-b border-surface-800 px-4 py-2" role="tablist" aria-label="Upgrade type">
								{#each tabs as t (t)}
									<button role="tab" aria-selected={tab === t} class="rounded-full border px-2.5 py-0.5 text-xs {tab === t ? 'border-sky-400 bg-sky-500/15 text-sky-200' : 'border-surface-700 text-surface-300 hover:border-surface-500'}" onclick={() => { tab = t; showAll = false; }}>
										{tabLabel(t)} <span class="text-surface-500">{t === 'All' ? ranked.length : ranked.filter(c => c.group === t).length}</span>
									</button>
								{/each}
							</div>
						{/if}
						{#if !ranked.length}
							<p class="p-4 text-sm text-surface-300">No upgrade can be estimated for this raid yet.</p>
						{:else}
							<div class="grid grid-cols-[minmax(0,1fr)_4.5rem_3.5rem] gap-3 px-4 pt-2 text-xs text-surface-500 sm:grid-cols-[minmax(0,1fr)_minmax(0,9rem)_4.5rem_3.5rem]">
								<span class="pl-7">Upgrade</span><span class="hidden sm:block"></span><span class="text-right">DPS</span><span class="text-right">CP</span>
							</div>
						{/if}
						{#each listed as c (c.id)}
							{@const r = dpsRank.get(c.id) ?? 0}
							{@const cr = cpRank.get(c.id) ?? 0}
							<button class="grid w-full grid-cols-[minmax(0,1fr)_4.5rem_3.5rem] items-center gap-3 border-t border-surface-800 px-4 py-2.5 text-left text-sm transition sm:grid-cols-[minmax(0,1fr)_minmax(0,9rem)_4.5rem_3.5rem] {c === shown ? 'bg-sky-500/10' : 'hover:bg-surface-800/60'}" onclick={() => choose(c.id)} aria-pressed={c === shown}>
								<span class="flex min-w-0 items-center gap-3">
									<span class="w-4 shrink-0 text-right text-xs tabular-nums text-surface-500">{r}</span>
									<span class="min-w-0">
										<span class="block truncate {c === shown ? 'font-semibold text-surface-50' : ''}">{c.label}</span>
										<span class="text-xs text-surface-500">{c.group}{c.rough ? ' · rough' : ''}{cr - r >= 3 ? ` · CP ranks it #${cr}` : ''}</span>
									</span>
								</span>
								<span class="hidden h-2 rounded-xs bg-surface-800 sm:block"><span class="block h-full rounded-xs {c.rough ? 'bg-amber-400/60' : 'bg-sky-400'}" style="width: {Math.max(0, c.gainPct ?? 0) / topScale * 100}%"></span></span>
								<span class="text-right font-semibold tabular-nums text-green-400">{pct(c.gainPct)}</span>
								<span class="text-right text-xs tabular-nums text-surface-500">{pct(c.cpPct)}</span>
							</button>
						{/each}
						<div class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-surface-800 px-4 py-2 text-xs text-surface-400">
							{#if inTab.length > TOP}<button class="text-sky-300 hover:underline" onclick={() => showAll = !showAll}>{showAll ? `Show top ${TOP}` : `Show all ${inTab.length}`}</button>{/if}
							{#if showAll || tab !== 'All'}<label class="flex items-center gap-1.5"><input type="checkbox" bind:checked={allOptions} /> every option per accessory slot</label>{/if}
							{#if statsBlocked}
								<span class="text-amber-300">Gear upgrades need one recent clear recorded with LOA Logs' low performance mode off. Gems are ranked from every clear.</span>
							{:else if unestimated.length}
								<span>{unestimated.length} more can't be estimated here yet{runPick === null && !raid.withStats ? ' (crit rate needs a clear of this raid with low performance mode off)' : ''}.</span>
							{/if}
						</div>
					</section>
				{/if}
			</div>

			<!-- 3 · Why the selected upgrade is worth that -->
			{#if !support && raid && runs.length && shown}
				<div class="flex min-w-0 flex-col gap-3 lg:col-start-2 xl:sticky xl:top-16 xl:col-start-3 xl:row-start-1 xl:max-h-[calc(100vh-5rem)] xl:overflow-y-auto">
					<section id="dps-why" class="scroll-mt-16 {panel}" aria-label="Where the gain comes from">
						<p class={heading}>3 · Why it's worth {pct(shown.gainPct)}</p>
						<p class="mb-3 font-semibold">{shown.label}</p>
						<div class="space-y-2">
							{#each rows as row}
								<div class={bar}>
									<div class="flex min-w-0 items-center gap-2">
										{#if row.icon}<img src={iconUrl(row.icon)} alt="" class="size-7 shrink-0 rounded-xs" />{:else if shown.gem}<span class="size-7 shrink-0"></span>{/if}
										<div class="min-w-0"><p class="truncate">{row.name}</p><p class="text-xs text-surface-400">{row.note}</p></div>
									</div>
									<span class="text-right tabular-nums">{pct(row.value)}</span>
									<div class="col-span-2 h-2.5 rounded-xs bg-surface-800"><div class="h-full rounded-xs {row.value < 0 ? 'bg-red-400' : 'bg-sky-400'}" style="width: {Math.abs(row.value) / scale * 100}%"></div></div>
								</div>
							{/each}
						</div>
						{#if shown.gem}
							{@const g = shown.gem}
							<p class="mt-3 text-sm text-surface-300">
								{#if g.choice.kind === 'damage'}
									Level {g.choice.from} → {g.choice.to} makes {g.parts.length > 1 ? 'these skills' : 'this skill'} hit {g.effectPct.toFixed(2)}% harder, and {g.parts.length > 1 ? 'they deal' : 'it deals'} {skillShareTotal.toFixed(1)}% of your damage in {scopeName}.
								{:else}
									Level {g.choice.from} → {g.choice.to} shortens the cooldown. The skill is on cooldown {g.cooldownUse?.toFixed(0)}% of the fight, so it could be cast about {g.effectPct.toFixed(2)}% more often.
								{/if}
							</p>
							{#if g.rough}<p class="mt-2 text-xs text-amber-300">Rough: extra casts are counted as free. In a real rotation they push other skills out, so the true gain is likely lower.</p>{/if}
						{:else}
							<p class="mt-3 text-sm text-surface-300">A stat's bonus adds to what you already have in its bucket, so it's worth less the more you have. Different buckets multiply.</p>
						{/if}
					</section>

					<details class={panel}>
						<summary class="cursor-pointer text-sm font-semibold text-surface-200">In your other raids</summary>
						<div class="mt-3">
							{#if sameEverywhere}
								<p class="text-sm text-surface-300">The same {pct(shown.gainPct)} everywhere: it doesn't change crit rate, the one stat worth more in some fights than others.</p>
							{:else}
								<div class="space-y-1.5">
									{#each acrossRaids as x (x.raid.key)}
										<button class={bar + ' w-full text-left'} onclick={() => chooseRaid(x.raid.key)}>
											<span class="min-w-0 truncate {x.raid === raid ? 'font-semibold text-surface-50' : ''}">{x.raid.name} <span class="rounded-xs px-1 text-xs {difficultyTone(x.raid.difficulty)}">{x.raid.difficulty}</span></span>
											<span class="text-right tabular-nums {x.gain === null ? 'text-surface-500' : ''}">{pct(x.gain)}</span>
											<span class="col-span-2 h-2.5 rounded-xs bg-surface-800"><span class="block h-full rounded-xs {x.raid === raid ? 'bg-sky-400' : 'bg-sky-400/50'}" style="width: {Math.abs(x.gain ?? 0) / raidScale * 100}%"></span></span>
										</button>
									{/each}
								</div>
								<p class="mt-2 text-xs text-surface-400">{shown.gem ? 'Skills deal a different share of your damage in each raid.' : 'Crit rate is worth more in some raids than others. "—": no clear of that raid recorded the meter’s values.'}</p>
							{/if}
						</div>
					</details>

					<details class={panel}>
						<summary class="cursor-pointer text-sm font-semibold text-surface-200">Run by run, and how it's calculated</summary>
						<div class="mt-3 space-y-4">
							{#if shownRuns.length > 1}
								<div class="space-y-1.5">
									{#each shownRuns as r}
										<div class={bar}>
											<div class="min-w-0"><p class="truncate">{day(r.start)} <span class="text-surface-400">{gateLabel(r.boss)}</span></p><p class="text-xs text-surface-400">skill deals {r.share.toFixed(1)}%</p></div>
											<span class="text-right tabular-nums">{pct(r.totalPct)}</span>
											<div class="col-span-2 h-2.5 rounded-xs bg-surface-800"><div class="h-full rounded-xs bg-sky-400/80" style="width: {Math.abs(r.totalPct) / runScale * 100}%"></div></div>
										</div>
									{/each}
								</div>
							{/if}
							{#if model}
								<p class="text-sm text-surface-300">
									{#if model.build.length}
										Your gear's damage buckets come from your {model.build.length} most recent {model.build.length === 1 ? 'clear' : 'clears'} with the meter's stat values ({model.build.map(r => `${raidGateOf(r.boss)?.label.replace(/ \(.*\)$/, '') ?? r.boss} ${day(r.start)}`).join(', ')}); they stay the same from fight to fight for the same gear.
									{:else}
										None of your imported clears has the meter's stat values (LOA Logs skips them in low performance mode), so gear upgrades can't be valued yet.
									{/if}
									{model.gateValued ? `Crit rate uses ${model.gateValued} ${model.gateValued === 1 ? 'clear' : 'clears'} here with values.` : ''}
								</p>
								{#if check && check.some(c => c.meter !== null)}
									<table class="w-full text-sm">
										<thead class="text-xs text-surface-400"><tr><th class="pb-1 text-left font-normal">One more…</th><th class="pb-1 text-right font-normal">Our model</th><th class="pb-1 text-right font-normal">Meter here</th></tr></thead>
										<tbody>
											{#each check as c}<tr class="border-t border-surface-800"><td class="py-1">{c.label}</td><td class="text-right tabular-nums">{c.ours === null ? '—' : `${formatPct(c.ours, 3)}%`}</td><td class="text-right tabular-nums text-surface-400">{c.meter === null ? '—' : `${formatPct(c.meter, 3)}%`}</td></tr>{/each}
										</tbody>
									</table>
								{/if}
							{/if}
						</div>
					</details>
				</div>
			{/if}
		</div>
	{/if}
{:else}
	<h1 class="text-2xl font-semibold">DPS Sim</h1>
	<p class="mt-2 text-surface-300">Load a character first. Then import your LOA Logs here to compare upgrades in your own raids.</p>
	<a href="/" class="mt-4 inline-block rounded-lg bg-accent-700 px-4 py-2 font-semibold text-white">Load a character →</a>
{/if}
