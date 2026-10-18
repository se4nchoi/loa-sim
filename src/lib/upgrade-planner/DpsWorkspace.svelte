<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import CharacterSwitcher from '$lib/CharacterSwitcher.svelte';
	import { characterKey, loadSavedCharacter, type SavedCharacter } from '$lib/saved-character';
	import { loadRuns, runsBooks } from '$lib/logs/runs-store.svelte';
	import { raidGateOf } from '$lib/logs/raids';
	import { loadAutosave, savedSimulations, sameBaseline, type SavedSimulation } from './saved-simulations';
	import { initSimState, simulate, type SimState } from './simulate';
	import { raidsOf } from './dps-gates';
	import { comparisonScope, comparisonSample, compareDpsUpgrades, combinedGain, rankDpsCandidates, orderSetup, type DpsSort, type DpsCandidate } from './dps-comparison';
	import { liveUpgrades } from './live-upgrades';
	import { costsForCharacter, bookCost, manualGoldCost, gold, loadGold, formatGold, parsePrice, supportsGoldCost, missingPriceCount } from './gold-costs.svelte';
	import { autoHoningCosts, inventoryMaterials } from './honing-cost';
	import { rollsFor } from './acc-rolls.svelte';
	import { difficultyTone, raidArt } from './raid-art';
	import { CATEGORY_LABELS, type Upgrade } from './upgrades';
	import { formatDate, formatPct } from './format';
	import { className } from './class-names';
	import { iconUrl, itemLook, coreLook, bracerLook, engravingIcon, GOLD_ICON } from './icons';
	import { decodeCore } from './tables';
	import type { BracerGrade } from './bracer';
	import { GEM_SKILLS } from './game-data';
	import { roleOf } from './roles';
	import { btn, btnAccent, selectClass } from './sim/ui';
	import ItemIcon from './sim/ItemIcon.svelte';
	import Segmented from './sim/Segmented.svelte';
	import UpgradeTitle from './UpgradeTitle.svelte';
	import UpgradeDialog from './UpgradeDialog.svelte';
	import MaterialPrices from './MaterialPrices.svelte';
	import DpsRunsImport from './DpsRunsImport.svelte';

	let character = $state<SavedCharacter | null>(null);
	let working = $state.raw<SimState | null>(null);
	let plans = $state.raw<SavedSimulation[]>([]);
	let selectedPlan = $state('working');
	let showImport = $state(false);
	let pricesOpen = $state(false);
	let inventoryOpen = $state(false);
	const wanted = $derived(page.url.searchParams.get('c'));
	function refresh() {
		character = loadSavedCharacter(wanted);
		if (character?.loadout) {
			const k = characterKey(character);
			working = loadAutosave(k, character.loadout) ?? initSimState(character.loadout);
			plans = savedSimulations(k).filter(plan => sameBaseline(plan.loadout, character!.loadout!));
			if (!plans.some(plan => plan.id === selectedPlan)) selectedPlan = 'working';
		} else { working = null; plans = []; }
		if (character) loadRuns(characterKey(character), true);
	}
	$effect(() => { void wanted; untrack(() => { selectedPlan = 'working'; refresh(); }); });
	/** What this page reads from storage, as stored. Returning to the tab re-reads (and recomputes) only when it changed,
	 *  e.g. after editing the plan in Simulator; a plain alt-tab or a closing file dialog leaves the page as it is. */
	function stored() {
		const k = character ? characterKey(character) : (wanted ?? '').toLowerCase();
		try {
			return ['loa-sim:characters', 'loa-sim:simulations:v1', `loa-sim:autosave:v1:${k}`, `loa-sim:dps-runs:v1:${k}`].map(key => localStorage.getItem(key) ?? '').join('\u0000');
		} catch { return ''; }
	}
	let seen = '';
	function refreshIfChanged() {
		const now = stored();
		if (now === seen) return;
		seen = now;
		refresh();
	}
	onMount(() => {
		loadGold();
		seen = stored();
		const storageChanged = (e: StorageEvent) => { if (!e.key || e.key.startsWith('loa-sim:')) refreshIfChanged(); };
		window.addEventListener('storage', storageChanged);
		window.addEventListener('focus', refreshIfChanged);
		return () => { window.removeEventListener('storage', storageChanged); window.removeEventListener('focus', refreshIfChanged); };
	});
	const key = $derived(character ? characterKey(character) : '');
	const loadout = $derived(character?.loadout ?? null);
	const sourceState = $derived(plans.find(plan => plan.id === selectedPlan)?.state ?? working);
	const base = $derived(loadout ? initSimState(loadout) : null);
	const book = $derived(key ? runsBooks.byCharacter[key] ?? null : null);
	const support = $derived(loadout ? roleOf(loadout).support : false);
	const cp = $derived(loadout && sourceState && base ? simulate(loadout, sourceState, base).cp : null);
	const simulatorUrl = $derived(`/sim?c=${encodeURIComponent(key)}`);
	const raids = $derived(book ? raidsOf(book.runs) : []);
	let selectedRaids = $state<string[]>([]);
	let gateFilter = $state('');
	let runPick = $state('');
	let orderFilter = $state('');
	let pick = $state<string | null>(null);
	let sort = $state<DpsSort>('dps');
	let category = $state('All');
	let budgetText = $state('');
	let allOptions = $state(false);
	let showAll = $state(false);
	$effect(() => {
		const k = key;
		untrack(() => {
			try {
				const saved = localStorage.getItem(`loa-sim:dps-raids:${k}`);
				const parsed = saved ? JSON.parse(saved) : null;
				const legacy = localStorage.getItem(`loa-sim:dps-raid:${k}`);
				selectedRaids = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : legacy ? [legacy] : [];
			} catch { selectedRaids = []; }
			gateFilter = ''; runPick = ''; orderFilter = ''; pick = null; category = 'All'; budgetText = '';
		});
	});
	const selected = $derived.by(() => {
		const found = raids.filter(r => selectedRaids.includes(r.key));
		// Nothing chosen yet: the newest raid, not a one-off fight (Guardian raid, solo, Deskaluda) that happens to be newer.
		if (found.length) return found;
		const newest = raids.find(r => r.kind === 'raid') ?? raids[0];
		return newest ? [newest] : [];
	});
	function chooseRaid(raidKey: string) {
		const current = selected.map(r => r.key);
		selectedRaids = current.includes(raidKey) ? current.length > 1 ? current.filter(k => k !== raidKey) : current : [...current, raidKey];
		gateFilter = ''; runPick = ''; pick = null;
		try { localStorage.setItem(`loa-sim:dps-raids:${key}`, JSON.stringify(selectedRaids)); } catch { /* this visit only */ }
	}
	const gates = $derived(selected.flatMap(r => r.gates));
	const gateRuns = $derived(selected.flatMap(r => gateFilter ? r.gates.find(g => g.key === gateFilter)?.runs ?? [] : r.runs).toSorted((a, b) => b.start - a.start));
	const pickedRuns = $derived(runPick ? gateRuns.filter(r => r.id === Number(runPick)) : gateRuns);
	const orderOptions = $derived([...new Set(gateRuns.map(orderSetup).filter((v): v is string => v !== null))].sort());
	const scope = $derived(loadout && character ? comparisonScope(loadout, pickedRuns, character.name, orderFilter) : { included: [], excluded: [], unchecked: 0 });
	const runs = $derived(scope.included);
	const eligibleBuildRuns = $derived(loadout && character && book ? comparisonScope(loadout, book.runs, character.name, orderFilter).included : []);
	const sample = $derived(comparisonSample(runs));
	const upgrades = $derived(loadout && sourceState && base ? liveUpgrades(loadout, sourceState, base, rollsFor(key), true) : []);
	const candidates = $derived(loadout && sourceState && base && !support ? compareDpsUpgrades(loadout, sourceState, base, eligibleBuildRuns, runs, upgrades) : []);
	const quotes = $derived(costsForCharacter(key));
	const bound = $derived(gold.bound[key] ?? {});
	const auto = $derived(sourceState ? autoHoningCosts(upgrades.map(u => u.key), sourceState.gear, gold.prices, bound, sourceState.karma) : {});
	// Simulator's per-level gem quote also prices each individual skill gem here.
	const priceUpgrade = (u: Upgrade) => {
		if (u.category !== 'gem' || quotes[u.key] !== undefined) return u;
		const [, tier, level] = u.key.split(':');
		return { ...u, key: `gem:${tier}:${level}`, subject: undefined, title: `${tier} gem Lv. ${level} → ${Number(level) + 1}` };
	};
	const pricedAuto = $derived(Object.fromEntries(Object.entries(auto).filter(([, h]) => !h.breakdown?.average.materials.some(m => m.bought > 0 && gold.prices[m.id] === undefined))));
	const costs = $derived.by(() => {
		const out: Record<string, number> = {};
		for (const u of upgrades) {
			if (!supportsGoldCost(u)) continue;
			const computed = pricedAuto[u.key]?.expected;
			const value = u.books ? bookCost(u, gold.bookPrices) : manualGoldCost(u, quotes) ?? manualGoldCost(priceUpgrade(u), quotes) ?? computed ?? u.knownCost;
			if (value !== undefined && Number.isFinite(value) && value >= 0) out[u.key] = value;
		}
		return out;
	});
	const pricingUpgrades = $derived([...new Map(upgrades.map(u => [priceUpgrade(u).key, priceUpgrade(u)])).values()]);
	const pricingCosts = $derived(Object.fromEntries(upgrades.filter(u => costs[u.key] !== undefined).map(u => [priceUpgrade(u).key, costs[u.key]])));
	const budget = $derived(budgetText.trim() ? parsePrice(budgetText) : null);
	const ranked = $derived(rankDpsCandidates(candidates, costs, sort));
	const tabs = $derived(['All', ...new Set(candidates.map(c => CATEGORY_LABELS[c.upgrade.category]))]);
	const filtered = $derived.by(() => {
		const seen = new Set<string>();
		return ranked.filter(c => category === 'All' || CATEGORY_LABELS[c.upgrade.category] === category)
			.filter(c => budget === null || costs[c.id] === undefined || costs[c.id] <= budget)
			.filter(c => { const group = ['accessory', 'quality'].includes(c.upgrade.category) ? c.upgrade.group ?? c.id : c.id; if (!allOptions && seen.has(group)) return false; seen.add(group); return true; });
	});
	const listed = $derived(showAll ? filtered : filtered.slice(0, 10));
	const shown = $derived(filtered.find(c => c.id === pick) ?? filtered[0]);
	const missingPrices = $derived(missingPriceCount(pricingUpgrades, pricingCosts));
	const materials = $derived(sourceState ? inventoryMaterials(sourceState.gear, !!sourceState.bracer) : []);
	const perRaid = $derived(shown ? selected.map(raid => ({ raid, gain: combinedGain(shown.clears.filter(c => raid.runs.some(r => r.id === c.run.id))) })) : []);
	const raidScale = $derived(Math.max(.01, ...perRaid.map(r => Math.abs(r.gain ?? 0))));
	const fmt = (n: number | null) => n === null ? '—' : `≈${formatPct(n)}%`;
	const duration = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
	const gateName = (boss: string) => raidGateOf(boss)?.label.replace(/ \(.*\)$/, '') ?? boss;
	const partNames: Record<string, string> = { attack: 'Atk. Power', additionalDamage: 'Additional Damage', evoDamage: 'Evolution Damage', critRate: 'Crit Rate', critDamage: 'Crit Damage' };
	function choose(c: DpsCandidate) {
		pick = c.id;
		if (!matchMedia('(min-width: 1100px)').matches) document.getElementById('dps-breakdown')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' });
	}
	function look(c: DpsCandidate) {
		if (c.gem) return { icon: iconUrl(book?.skills[c.gem.choice.skill]?.[1] || GEM_SKILLS[c.gem.choice.skill]?.[1]), grade: undefined };
		const slot = c.upgrade.key.split(':')[1];
		if (c.upgrade.key.startsWith('bracer:') && loadout) return bracerLook(loadout.classId, slot as BracerGrade);
		if (c.upgrade.category === 'core') { const info = decodeCore(Number(slot)); if (info) return coreLook(info); }
		if (c.upgrade.category === 'engraving') return { icon: engravingIcon(Number(slot)), grade: 5 };
		return itemLook(loadout?.items?.find(i => i.slot === slot)?.id);
	}
</script>

{#if character && loadout && sourceState && base}
	<CharacterSwitcher current={key} simulatorPath="/dps" />
	<div class="dps-workspace">
		<header class="flex flex-wrap items-end justify-between gap-3">
			<div class="min-w-0 max-w-full"><h1 class="text-2xl font-semibold">{character.name} <span class="text-sm font-normal text-surface-400">{className(loadout.classId)}</span></h1>
				<label class="mt-2 flex flex-wrap items-center gap-2 text-sm text-surface-300">Build
					<select class={selectClass(false)} bind:value={selectedPlan}><option value="working">Current simulation</option>{#each plans as plan}<option value={plan.id}>{plan.name}</option>{/each}</select>
				</label>
			</div>
			<div class="flex flex-wrap items-center gap-3"><span class="text-sm text-surface-400">CP <strong class={support ? 'text-green-400' : 'text-red-400'}>{cp?.toFixed(2)}</strong></span><a href={simulatorUrl} class={btnAccent}>Simulator</a></div>
		</header>
		{#if !book || showImport}
			<section class="dps-panel p-4" aria-label="Import logs">
				{#if !book}<h2 class="mb-3 font-semibold">Import LOA Logs</h2>{/if}
				{#key key}<DpsRunsImport characterKey={key} characterName={character.name} ondone={() => { showImport = false; }} />{/key}
				{#if book}<button class="{btn} mt-3" onclick={() => showImport = false}>Close</button>{/if}
			</section>
		{/if}
		{#if book}
			<section class="dps-panel p-3 sm:p-4" aria-label="Raids">
				<div class="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 class="font-semibold">Raids</h2><button class={btn} onclick={() => showImport = !showImport}>{showImport ? 'Close import' : 'Re-import logs'}</button></div>
				<div class="dps-raids">
					{#each raids.filter(r => r.kind === 'raid') as raid (raid.key)}
						{@const art = raidArt(raid.name)}{@const active = selected.some(r => r.key === raid.key)}
						<button class="dps-raid {active ? 'dps-selected' : ''}" onclick={() => chooseRaid(raid.key)} aria-pressed={active}>
							{#if art}<span class="absolute inset-0" style={art}></span>{/if}<span class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/15"></span>
							<span class="relative flex items-start justify-between gap-2"><span class="rounded-xs px-1 text-xs {difficultyTone(raid.difficulty)}">{raid.difficulty || 'Normal'}</span><span class="text-xs text-white">{active ? '✓ Included' : 'Include'}</span></span>
							<span class="relative mt-4 block"><strong class="block text-base text-white">{raid.name}</strong><span class="text-xs text-white/75">{raid.runs.length} {raid.runs.length === 1 ? 'clear' : 'clears'} · {formatDate(raid.last)}</span></span>
						</button>
					{/each}
				</div>
				<div class="mt-3 flex flex-wrap items-center gap-3 text-sm">
					{#if raids.some(r => r.kind === 'other')}<label class="dps-field">Other fights<select class={selectClass(false)} value="" onchange={e => { if (e.currentTarget.value) chooseRaid(e.currentTarget.value); }}><option value="">Select…</option>{#each raids.filter(r => r.kind === 'other') as r}<option value={r.key}>{selected.includes(r) ? '✓ ' : ''}{r.name} · {r.difficulty}</option>{/each}</select></label>{/if}
					<label class="dps-field">Gates<select class={selectClass(false)} bind:value={gateFilter} onchange={() => runPick = ''}><option value="">All gates</option>{#each gates as gate (gate.key)}<option value={gate.key}>{gate.label} · {gate.difficulty}</option>{/each}</select></label>
					<label class="dps-field">Clears<select class={selectClass(false)} bind:value={runPick}><option value="">All {gateRuns.length} clears</option>{#each gateRuns as run}<option value={run.id}>{formatDate(run.start)} · {gateName(run.boss)} · {duration(run.duration)}</option>{/each}</select></label>
					{#if orderOptions.length}<label class="dps-field">Order cores<select class={selectClass(!!orderFilter)} bind:value={orderFilter}><option value="">All recorded</option>{#each orderOptions as setup}<option value={setup}>{setup.replaceAll('/', '')}</option>{/each}</select></label>{/if}
					{#each selected.filter(r => r.kind === 'other') as r}<button class={btnAccent} onclick={() => chooseRaid(r.key)} aria-label={`Remove ${r.name} ${r.difficulty}`}>{r.name} ×</button>{/each}
				</div>
				<div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-surface-800 pt-3 text-sm">
					<p class="font-semibold text-surface-100">{#if orderFilter}Order cores {orderFilter.replaceAll('/', '')} only · {/if}{runs.length} {runs.length === 1 ? 'clear' : 'clears'}{selected.length > 1 ? ' · Mixed raids' : ''}</p>
					<span class="text-xs text-surface-400">{selected.map(r => `${r.name} · ${r.difficulty || 'Normal'}`).join(' / ')}</span>
				</div>
				{#if !orderOptions.length}<p class="mt-2 text-xs text-amber-300">Order cores not recorded in this import. Re-import logs to check.</p>
				{:else if !orderFilter && (orderOptions.length > 1 || gateRuns.some(r => !orderSetup(r)))}<p class="mt-2 text-xs text-amber-300">Order core setups are not filtered.</p>{/if}
				{#if orderFilter}<p class="mt-2 text-xs text-amber-300">Core choices only. Core points and astrogems are not checked.</p>{/if}
				<details class="mt-3 border-t border-surface-800 pt-2 text-xs text-surface-400">
					<summary>{scope.excluded.length ? `${scope.excluded.length} excluded · ` : ''}Log details</summary>
					<div class="mt-3 space-y-2">
						<p>Imported {formatDate(book.importedAt)} · {book.fileName} · {book.player}</p>
						<p>Order cores are the recorded Sun / Moon / Star choices. Core points, grade and astrogems are not checked against the snapshot.</p>
						<p>{scope.unchecked ? `${scope.unchecked} clears have no engraving data. ` : ''}Engravings are checked where recorded; other gear changes between clears are not verified.</p>
						{#each scope.excluded as x}<p class="flex flex-wrap justify-between gap-1"><span>{formatDate(x.run.start)} · {gateName(x.run.boss)}</span><span>{x.reason}</span></p>{/each}
					</div>
				</details>
			</section>
			{#if support}<p class="dps-panel p-4 text-sm text-surface-300">DPS estimates are available for damage dealers.</p>
			{:else if !runs.length}<p class="dps-panel p-4 text-sm text-amber-300">No clears match these filters. Check Order cores, gates and excluded clears.</p>
			{:else}
				<div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-semibold">Next Upgrades</h2><div class="flex flex-wrap gap-2"><button class={btn} onclick={() => inventoryOpen = true}>Material prices / inventory</button><button class={btn} onclick={() => pricesOpen = true}>{missingPrices ? `${missingPrices} missing prices` : 'Prices'}</button></div></div>
				<div class="dps-columns">
					<section class="dps-panel min-w-0" aria-label="Next Upgrades">
						<div class="flex flex-wrap items-center justify-between gap-3 border-b border-surface-800 p-3">
							<Segmented value={sort} options={[{ value: 'dps', label: 'Most DPS' }, { value: 'cp', label: 'Most CP' }, { value: 'gold', label: 'Per gold' }]} onselect={v => sort = v} label="Upgrade ranking" size="h-8 px-2 text-xs" />
							<label class="flex items-center gap-2 text-xs text-surface-300">Budget<input class="h-8 w-24 rounded-xs border border-surface-700 bg-surface-950 px-2 text-sm text-surface-100" inputmode="decimal" placeholder="Any" aria-label="Gold budget" bind:value={budgetText} /><span class="text-amber-300">gold</span></label>
						</div>
						{#if budgetText.trim() && budget === null}<p class="px-3 pt-2 text-xs text-amber-300" role="alert">Enter a gold amount, e.g. 100k.</p>{/if}
						{#if budget !== null && missingPrices}<p class="px-3 pt-2 text-xs text-amber-300">Unpriced upgrades remain visible.</p>{/if}
						<div class="flex flex-wrap gap-1.5 border-b border-surface-800 p-3" role="group" aria-label="Upgrade type">{#each tabs as tab}<button class={category === tab ? btnAccent : btn} aria-pressed={category === tab} onclick={() => { category = tab; showAll = false; }}>{tab}</button>{/each}</div>
						<div class="dps-row dps-row-head text-xs text-surface-400"><span>Upgrade</span><span class="text-right">DPS / CP</span><span class="text-right">Cost</span></div>
						{#each listed as c (c.id)}
							{@const image = look(c)}{@const cost = costs[c.id]}
							<button class="dps-row dps-upgrade {c === shown ? 'dps-current' : ''}" onclick={() => choose(c)} aria-pressed={c === shown}>
								<span class="flex min-w-0 items-center gap-3">{#if image.icon}<ItemIcon src={image.icon} grade={image.grade} size="size-9" />{/if}<span class="min-w-0"><UpgradeTitle u={c.upgrade} /><span class="mt-1 block text-xs text-surface-400">{c.gainPct === null ? 'DPS not estimated' : c.gem ? 'From logs' : 'Calculated'}{#if c.upgrade.detail === 'KR preview'}{' · '}<span class="text-amber-300">KR preview</span>{/if}</span></span></span>
								<span class="dps-gain text-right"><strong class="block text-base font-semibold text-green-400">{fmt(c.gainPct)}</strong><span class="mt-0.5 block text-xs text-red-400">CP {formatPct(c.cpPct)}%</span></span>
								<span class="dps-cost text-right text-sm"><span class={cost === undefined ? 'text-amber-300/80' : 'text-amber-300'}>{cost === undefined ? supportsGoldCost(c.upgrade) ? 'Price needed' : '—' : `${formatGold(cost)} gold`}</span><span class="mt-0.5 block text-xs text-surface-400">{cost !== undefined && c.gainPct !== null && c.gainPct > 0 ? `${formatGold(cost / c.gainPct)} / 1% DPS` : '—'}</span></span>
							</button>
						{/each}
						{#if !filtered.length}<p class="p-4 text-sm text-surface-300">No upgrades match these filters.</p>{/if}
						<div class="flex flex-wrap items-center justify-between gap-3 border-t border-surface-800 p-3 text-xs text-surface-400">{#if filtered.length > 10}<button class="text-accent-300 hover:underline" onclick={() => showAll = !showAll}>{showAll ? 'Show top 10' : `Show all ${filtered.length}`}</button>{/if}<label class="flex items-center gap-2"><input type="checkbox" bind:checked={allOptions} />All options per slot</label><span>{filtered.length} upgrades</span></div>
					</section>
					{#if shown}
						<aside id="dps-breakdown" class="dps-panel dps-inspector p-4" aria-label="Breakdown">
							<h2 class="mb-3 font-semibold">Breakdown</h2><UpgradeTitle u={shown.upgrade} />
							{#if shown.upgrade.detail === 'KR preview'}<p class="mt-2 text-xs text-amber-300">KR preview</p>{/if}
							<div class="mt-4 flex flex-wrap items-end justify-between gap-2" aria-live="polite"><div><p class="text-xs text-surface-400">DPS gain</p><p class="text-3xl font-semibold text-green-400">{fmt(shown.gainPct)}</p></div><div class="text-right"><p class="text-xs text-surface-400">CP gain</p><p class="text-sm text-red-400">{formatPct(shown.cpPct)}% (+{((cp ?? 0) * shown.cpPct / 100).toFixed(2)})</p></div></div>
							{#if shown.reason}<p class="mt-3 text-sm text-amber-300">{shown.reason}</p>
							{:else if shown.gainPct === null}<p class="mt-3 text-sm text-amber-300">DPS not estimated · {shown.covered}/{runs.length} clears covered.</p>{/if}
							{#each shown.notes as note}<p class="mt-2 text-xs text-amber-300/90">※ {note}</p>{/each}
							{#if shown.gem && !shown.gem.rough}<div class="mt-4 space-y-2 border-t border-surface-800 pt-3">{#each shown.gem.parts as part}<div class="flex items-center justify-between gap-3 text-sm"><span class="min-w-0 break-words">{book.skills[part.skill]?.[0] ?? part.name}</span><span class="shrink-0 text-surface-200">{(sample.skillShares[part.skill] ?? 0).toFixed(1)}% of damage</span></div>{/each}<p class="text-xs text-surface-400">Skill damage {formatPct(shown.gem.effectPct)}%{shown.gem.baseAttack ? ` · Base Atk. Power +${shown.gem.baseAttack.toFixed(2)}%` : ''}</p></div>{/if}
							<div class="mt-4 border-t border-surface-800 pt-3"><h3 class="mb-2 text-sm font-semibold">By raid</h3><div class="space-y-3">{#each perRaid as result}<div><div class="mb-1 flex flex-wrap justify-between gap-2 text-xs"><span>{result.raid.name} · {result.raid.difficulty}</span><span>{fmt(result.gain)}</span></div><div class="h-1.5 rounded-xs bg-surface-800"><div class="h-full rounded-xs bg-accent-500" style:width={`${Math.abs(result.gain ?? 0) / raidScale * 100}%`}></div></div></div>{/each}</div></div>
							<div class="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-surface-800 pt-3 text-sm"><span class="flex items-center gap-1.5 text-amber-300"><img src={GOLD_ICON} alt="" class="size-4" />{costs[shown.id] === undefined ? 'Price needed' : `${formatGold(costs[shown.id])} gold`}</span><button class={btn} onclick={() => pricesOpen = true}>Edit prices</button></div>
							<details class="mt-4 border-t border-surface-800 pt-3 text-xs text-surface-400"><summary>Calculation details</summary><div class="mt-3 space-y-3">
								<p>Each clear is calculated separately. Combined gain compares total estimated damage with total recorded damage over the same fight time.</p>
								<p>Same rotation and fight duration. The loaded build is not a verified historical match for every clear.</p>
								{#if shown.stat}<div class="space-y-1">{#each shown.stat.parts as part}<p class="flex justify-between gap-2"><span>{partNames[part.key]}</span><span>{fmt(part.gainPct)}</span></p>{/each}</div>{/if}
								{#if shown.gem?.missing.length && shown.gainPct === null}<p>{shown.gem.missing.join(' ')}</p>{/if}
								<p>Honing uses average cost and this character's bound materials. Each upgrade is priced separately against the same inventory.</p>
								{#if pricedAuto[shown.id]}<p>Pity: {formatGold(pricedAuto[shown.id].worst)} gold · {pricedAuto[shown.id].maxTaps} taps.</p>{/if}
								{#if shown.upgrade.quality}<p>Quality cost assumes unlimited Chaos Stones.</p>{/if}
								{#if shown.upgrade.category === 'accessory'}<p>Accessory prices exclude Pheon costs.</p>{/if}
								{#if budget !== null}<p>Upgrades without prices remain visible; they are not confirmed within budget.</p>{/if}
								<details><summary>By clear · {shown.covered}/{runs.length} covered</summary><div class="mt-2 space-y-2">{#each shown.clears as clear}<p class="flex flex-wrap justify-between gap-2"><span>{formatDate(clear.run.start)} · {gateName(clear.run.boss)}</span><span>{fmt(clear.gainPct)}</span></p>{/each}</div></details>
							</div></details>
						</aside>
					{/if}
				</div>
			{/if}
		{/if}
	</div>
	{#if inventoryOpen}<MaterialPrices ids={materials} characterKey={key} characterName={character.name} onclose={() => inventoryOpen = false} />{/if}
	{#if pricesOpen}<UpgradeDialog upgrades={pricingUpgrades} characterKey={key} cp={cp ?? 0} costs={pricingCosts} auto={pricedAuto} mode="gold" focusKey={shown ? priceUpgrade(shown.upgrade).key : null} onclose={() => pricesOpen = false} />{/if}
{:else}
	<h1 class="text-2xl font-semibold">DPS</h1><p class="mt-2 text-sm text-surface-300">Load a character, then import LOA Logs to compare upgrades.</p><a href="/" class="{btnAccent} mt-4">Load a character</a>
{/if}

<style>
	.dps-workspace { display: grid; gap: 1rem; }
	.dps-workspace > * { min-width: 0; }
	.dps-workspace header select { min-width: 0; max-width: 100%; }
	.dps-panel { border-radius: 2px; background: var(--color-surface-900); box-shadow: 0 1px 2px var(--color-neutral-800); }
	.dps-raids { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); gap: .6rem; }
	.dps-raid { position: relative; overflow: hidden; border: 1px solid var(--color-surface-700); border-radius: 2px; padding: .7rem; text-align: left; }
	.dps-selected { border-color: var(--color-accent-400); box-shadow: inset 0 -3px var(--color-accent-400); }
	.dps-field { display: flex; align-items: center; gap: .5rem; min-width: 0; max-width: 100%; }
	.dps-field select { min-width: 0; max-width: 18rem; }
	.dps-columns { display: grid; grid-template-columns: minmax(0, 1fr); gap: 1rem; align-items: start; }
	.dps-row { display: grid; grid-template-columns: minmax(0, 1fr) 6.5rem 7.5rem; gap: .8rem; align-items: center; padding: .8rem; }
	.dps-row-head { padding-block: .5rem; }
	.dps-upgrade { width: 100%; text-align: left; border-top: 1px solid var(--color-surface-800); }
	.dps-upgrade:hover { background: var(--color-surface-800); }
	.dps-current { background: color-mix(in oklab, var(--color-accent-700) 13%, transparent); box-shadow: inset 3px 0 var(--color-accent-500); }
	.dps-inspector { min-width: 0; scroll-margin-top: 4rem; overflow-wrap: anywhere; }
	@media (min-width: 1100px) { .dps-columns { grid-template-columns: minmax(0, 1fr) 20rem; } .dps-inspector { position: sticky; top: 4rem; } }
	@media (max-width: 600px) {
		.dps-raids { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.dps-field { flex: 1 1 100%; justify-content: space-between; }
		.dps-field select { width: min(75%, 18rem); }
		.dps-row { grid-template-columns: minmax(0, 1fr) 7rem; gap: .5rem; }
		.dps-row-head { display: none; }
		.dps-upgrade > span:first-child { grid-row: span 2; }
		.dps-gain, .dps-cost { grid-column: 2; }
	}
	@media (pointer: coarse) { .dps-workspace :is(button, select, input:not([type='checkbox'])) { min-height: 44px; } .dps-workspace :is(input, select) { font-size: 16px; } }
</style>
