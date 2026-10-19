<script lang="ts">
	import { onMount, tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import CharacterSwitcher from '$lib/CharacterSwitcher.svelte';
	import { characterKey, loadSavedCharacter, type SavedCharacter } from '$lib/saved-character';
	import { loadRuns, runsBooks } from '$lib/logs/runs-store.svelte';
	import { raidGateOf } from '$lib/logs/raids';
	import { loadAutosave, savedSimulations, sameBaseline, type SavedSimulation } from './saved-simulations';
	import { initSimState, simulate, type SimState } from './simulate';
	import { raidsOf } from './dps-gates';
	import { buildRuns } from './dps-model';
	import { comparisonScope, comparisonSample, compareDpsUpgrades, combinedGain, rankDpsCandidates, orderSetup, recordedDps, formatDamage, slotGroup, dpsCpRanks, clearSpread, statWorth, type DpsSort, type DpsCandidate } from './dps-comparison';
	import { liveUpgrades } from './live-upgrades';
	import { skillTable, type Range } from './dps-skills';
	import { gemMembers } from './dps-explain';
	import { costsForCharacter, bookCost, bookPricesFor, materialPricesFor, manualGoldCost, gold, loadGold, formatGold, parsePrice, supportsGoldCost, missingPriceCount } from './gold-costs.svelte';
	import { autoHoningCosts, inventoryMaterials } from './honing-cost';
	import { rollsFor } from './acc-rolls.svelte';
	import { difficultyTone, raidArt } from './raid-art';
	import { CATEGORY_LABELS, type Upgrade } from './upgrades';
	import { formatDate, formatPct } from './format';
	import { className } from './class-names';
	import { classColor } from './class-colors';
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
	/** LOA Logs runs on PC and imported logs stay in the browser that read them: phones get a pointer to the PC instead
	 *  of a file picker (which a player can still ask for). The page doesn't render on the server, so this is safe. */
	const phone = matchMedia('(pointer: coarse) and (max-width: 767px)').matches;
	let pickerAnyway = $state(false);
	/** "How this is evaluated": open until the player closes it once (remembered in this browser). */
	let aboutOpen = $state(true);
	try { aboutOpen = localStorage.getItem('loa-sim:dps-about-closed') !== '1'; } catch { /* stays open */ }
	function aboutToggled(open: boolean) {
		aboutOpen = open;
		try { localStorage.setItem('loa-sim:dps-about-closed', open ? '0' : '1'); } catch { /* this visit only */ }
	}
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
	/** Re-reading and recomputing takes about a second on a full log import: a spinner goes up first. */
	let refreshing = $state(false);
	async function refreshIfChanged() {
		const now = stored();
		if (now === seen || refreshing) return;
		seen = now;
		refreshing = true;
		// Let the spinner paint before the work blocks the page (a background tab paints no frames: don't wait for one).
		await tick();
		await new Promise(r => { requestAnimationFrame(() => setTimeout(r)); setTimeout(r, 100); });
		try {
			refresh();
			await tick();
		} finally {
			refreshing = false;
		}
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
	/** A click on a raid shows that raid alone; "+ Compare" (compare = true) adds it to, or drops it from, the selection. */
	function chooseRaid(raidKey: string, compare = false) {
		const current = selected.map(r => r.key);
		selectedRaids = !compare ? [raidKey]
			: current.includes(raidKey) ? current.length > 1 ? current.filter(k => k !== raidKey) : current : [...current, raidKey];
		gateFilter = ''; runPick = ''; pick = null;
		try { localStorage.setItem(`loa-sim:dps-raids:${key}`, JSON.stringify(selectedRaids)); } catch { /* this visit only */ }
	}
	const gates = $derived(selected.flatMap(r => r.gates));
	const gateRuns = $derived(selected.flatMap(r => gateFilter ? r.gates.find(g => g.key === gateFilter)?.runs ?? [] : r.runs).toSorted((a, b) => b.start - a.start));
	const pickedRuns = $derived(runPick ? gateRuns.filter(r => r.id === Number(runPick)) : gateRuns);
	const orderOptions = $derived([...new Set(gateRuns.map(orderSetup).filter((v): v is string => v !== null))].sort());
	const scope = $derived(loadout && character ? comparisonScope(loadout, pickedRuns, character.name, orderFilter) : { included: [], excluded: [], unchecked: 0 });
	const runs = $derived(scope.included);
	/** Clears recorded with the meter's stat values (LOA Logs leaves them out in low performance mode). */
	const valued = $derived(runs.filter(r => r.statValues).length);
	const eligibleBuildRuns = $derived(loadout && character && book ? comparisonScope(loadout, book.runs, character.name, orderFilter).included : []);
	const sample = $derived(comparisonSample(runs));
	/** The clears the gear's damage totals are read from; their recorded CP far from the plan's means different gear. */
	const bucketRun = $derived(buildRuns(eligibleBuildRuns)[0]);
	const cpGap = $derived(bucketRun?.combatPower && cp ? cp / bucketRun.combatPower - 1 : 0);
	const upgrades = $derived(loadout && sourceState && base ? liveUpgrades(loadout, sourceState, base, rollsFor(key), true) : []);
	const candidates = $derived(loadout && sourceState && base && !support ? compareDpsUpgrades(loadout, sourceState, base, eligibleBuildRuns, runs, upgrades) : []);
	const quotes = $derived(costsForCharacter(key));
	const bound = $derived(gold.bound[key] ?? {});
	// Prices are kept per market region (NA or EUC); the character decides which.
	const materialPrices = $derived(materialPricesFor(key));
	const auto = $derived(sourceState ? autoHoningCosts(upgrades.map(u => u.key), sourceState.gear, materialPrices, bound, sourceState.karma) : {});
	// Simulator's per-level gem quote also prices each individual skill gem here.
	const priceUpgrade = (u: Upgrade) => {
		if (u.category !== 'gem' || quotes[u.key] !== undefined) return u;
		const [, tier, level] = u.key.split(':');
		return { ...u, key: `gem:${tier}:${level}`, subject: undefined, title: `${tier} gem Lv. ${level} → ${Number(level) + 1}` };
	};
	const pricedAuto = $derived(Object.fromEntries(Object.entries(auto).filter(([, h]) => !h.breakdown?.average.materials.some(m => m.bought > 0 && materialPrices[m.id] === undefined))));
	const costs = $derived.by(() => {
		const out: Record<string, number> = {};
		for (const u of upgrades) {
			if (!supportsGoldCost(u)) continue;
			const computed = pricedAuto[u.key]?.expected;
			const value = u.books ? bookCost(u, bookPricesFor(key)) : manualGoldCost(u, quotes) ?? manualGoldCost(priceUpgrade(u), quotes) ?? computed ?? u.knownCost;
			if (value !== undefined && Number.isFinite(value) && value >= 0) out[u.key] = value;
		}
		return out;
	});
	const pricingUpgrades = $derived([...new Map(upgrades.map(u => [priceUpgrade(u).key, priceUpgrade(u)])).values()]);
	const pricingCosts = $derived(Object.fromEntries(upgrades.filter(u => costs[u.key] !== undefined).map(u => [priceUpgrade(u).key, costs[u.key]])));
	const budget = $derived(budgetText.trim() ? parsePrice(budgetText) : null);
	const ranked = $derived(rankDpsCandidates(candidates, costs, sort));
	// A category gets a tab only once at least one of its upgrades has a DPS estimate; the rest wait in "Not estimated yet".
	const tabs = $derived(['All', ...new Set(candidates.filter(c => c.gainPct !== null).map(c => CATEGORY_LABELS[c.upgrade.category]))]);
	$effect(() => { if (!tabs.includes(category)) untrack(() => { category = 'All'; }); });
	const filtered = $derived.by(() => {
		const seen = new Set<string>();
		return ranked.filter(c => category === 'All' || CATEGORY_LABELS[c.upgrade.category] === category)
			.filter(c => budget === null || costs[c.id] === undefined || costs[c.id] <= budget)
			.filter(c => { const group = slotGroup(c); if (!allOptions && seen.has(group)) return false; seen.add(group); return true; });
	});
	const estimated = $derived(filtered.filter(c => c.gainPct !== null));
	/** Cooldown gems with an "as you played" figure: shown in their own group, never ranked with the estimates. */
	const asPlayedGain = (c: DpsCandidate) => c.gainPct === null ? c.asPlayed?.gainPct ?? null : null;
	const cooldownGems = $derived(filtered.filter(c => asPlayedGain(c) !== null).toSorted((a, b) => asPlayedGain(b)! - asPlayedGain(a)!));
	const unestimated = $derived(filtered.filter(c => c.gainPct === null && asPlayedGain(c) === null));
	const worth = $derived(loadout && sourceState && base && !support ? statWorth(loadout, sourceState, base, eligibleBuildRuns, runs) : null);
	const worthSentence = $derived.by(() => {
		const r = worth?.critVsDamage ?? null;
		if (r === null) return "Crit Rate isn't measured in these clears (no stat values), so it can't be compared with Crit Damage here.";
		if (r >= 1.15) return `Here, +1% Crit Rate is worth about ${r.toFixed(1)}× as much as +1% Crit Damage.`;
		if (r <= 0.87) return `Here, +1% Crit Damage is worth about ${(1 / r).toFixed(1)}× as much as +1% Crit Rate.`;
		return 'Here, +1% Crit Rate and +1% Crit Damage are worth about the same.';
	});
	/** The per-clear what-ifs behind the shown figure: the estimate's, or a cooldown gem's "as you played". */
	const replayOf = (c: DpsCandidate) => clearSpread(asPlayedGain(c) !== null ? c.asPlayed!.clears : c.gainPct !== null ? c.clears : []);
	// Skills table: the meter's columns over the selected clears, with this plan's gems and their next step.
	const skills = $derived(skillTable(runs));
	let allSkills = $state(false);
	const gemsOf = (id: number) => (sourceState?.gems ?? []).flatMap((g, index) => g.skill !== null && (g.skill === id || gemMembers(g.skill).includes(id)) ? [{ ...g, index }] : []);
	const gemCandidate = (index: number) => candidates.find(c => c.gem?.choice.index === index);
	const skillRows = $derived(skills.filter(r => allSkills || r.share >= 0.5 || gemsOf(r.id).length));
	const topShare = $derived(Math.max(1, ...skills.map(r => r.share)));
	const spanText = (r: Range | null, digits = 1) => r && r.high - r.low >= 1 ? `${r.low.toFixed(digits)}–${r.high.toFixed(digits)}` : '';
	function openGem(c: DpsCandidate) {
		category = 'All';
		choose(c);
	}
	const pctRange = (low: number, high: number) => `${formatPct(low)} to ${formatPct(high)}%`;
	const listed = $derived(showAll ? estimated : estimated.slice(0, 10));
	const shown = $derived(filtered.find(c => c.id === pick) ?? estimated[0] ?? filtered[0]);
	const baseDps = $derived(recordedDps(runs));
	const ranks = $derived(dpsCpRanks(candidates));
	/** "DPS #3 · CP #9" when the two rankings disagree by 3 places or more: the disagreement this tab exists to show. */
	const rankBadge = (c: DpsCandidate) => { const r = ranks.get(c.id); return r && !c.atLeast && Math.abs(r.dps - r.cp) >= 3 ? `DPS #${r.dps} · CP #${r.cp}` : null; };
	const dpsGain = (c: DpsCandidate) => c.gainPct !== null && baseDps !== null ? baseDps * c.gainPct / 100 : null;
	/** Only gems (skill shares) and Crit Rate (recorded per fight) differ by raid; every other gain is the same everywhere. */
	const raidSpecific = (c: DpsCandidate) => c.gainPct !== null && (!!c.gem || !!c.stat?.delta.critRate);
	const sourceTag = (c: DpsCandidate) => c.gem
		? { label: 'From your skill damage', hint: "Uses how much of your damage this skill dealt in the selected clears." }
		: { label: 'From your stats', hint: "Uses your gear's stat totals, read from the meter's values in your recent clears." };
	/** The single value when every clear gives the same gain (to the shown precision), so the list needn't repeat it. */
	const sameInAll = (c: DpsCandidate) => {
		const values = c.clears.map(x => x.gainPct);
		return values.length > 1 && values.every(v => v !== null && Math.abs(v - values[0]!) < 0.005) ? values[0] : null;
	};
	const missingPrices = $derived(missingPriceCount(pricingUpgrades, pricingCosts));
	const materials = $derived(sourceState ? inventoryMaterials(sourceState.gear, !!sourceState.bracer) : []);
	const perRaid = $derived(shown ? selected.map(raid => {
		// A cooldown gem's raids use its "as you played" figures, over the clears that recorded cooldown use.
		const played = asPlayedGain(shown) !== null;
		const clears = (played ? shown.asPlayed!.clears.filter(c => c.gainPct !== null) : shown.clears).filter(c => raid.runs.some(r => r.id === c.run.id));
		return { raid, gain: clears.length ? combinedGain(clears) : null };
	}) : []);
	const raidScale = $derived(Math.max(.01, ...perRaid.map(r => Math.abs(r.gain ?? 0))));
	const fmt = (n: number | null) => n === null ? '—' : `≈${formatPct(n)}%`;
	/** "≥" when part of the upgrade isn't valued (the real gain is higher), "≈" otherwise. */
	const gainText = (c: DpsCandidate) => c.atLeast && c.gainPct !== null ? `≥${formatPct(c.gainPct)}%` : fmt(c.gainPct);
	const amountText = (c: DpsCandidate, amount: number) => `${c.atLeast ? '≥' : '≈'} +${formatDamage(amount)}`;
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
	<div class="dps-workspace relative" aria-busy={refreshing}>
		{#if refreshing}
			<div class="absolute inset-0 z-30 bg-surface-950/60" role="status" aria-live="polite">
				<div class="sticky top-[40vh] flex justify-center">
					<span class="flex items-center gap-2 rounded-xs border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-surface-100 shadow-lg shadow-black/50">
						<svg class="size-4 animate-spin text-accent-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.25" stroke-width="3" />
							<path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
						</svg>
						Updating…
					</span>
				</div>
			</div>
		{/if}
		<header class="flex flex-wrap items-end justify-between gap-3">
			<div class="min-w-0 max-w-full"><h1 class="text-2xl font-semibold">{character.name} <span class="text-sm font-normal text-surface-400">{className(loadout.classId)}</span> <span class="rounded-xs bg-amber-500/15 px-1.5 align-middle text-xs font-semibold text-amber-300">DPS Beta</span></h1>
				<p class="mt-1 text-sm text-surface-400">Upgrades ranked by how much they'd raise your DPS in the raids you pick, from your own LOA Logs.</p>
				<label class="mt-2 flex flex-wrap items-center gap-2 text-sm text-surface-300">Build
					<select class={selectClass(false)} bind:value={selectedPlan}><option value="working">Current simulation</option>{#each plans as plan}<option value={plan.id}>{plan.name}</option>{/each}</select>
				</label>
			</div>
			<div class="flex flex-wrap items-center gap-3"><span class="text-sm text-surface-400">CP <strong class={support ? 'text-green-400' : 'text-red-400'}>{cp?.toFixed(2)}</strong></span><a href={simulatorUrl} class={btnAccent}>Simulator</a></div>
		</header>
		<details class="dps-panel p-3 text-sm text-surface-300 sm:p-4" open={aboutOpen} ontoggle={e => aboutToggled(e.currentTarget.open)}>
			<summary class="cursor-pointer font-semibold text-surface-100">How this is evaluated <span class="font-normal text-amber-300">· Beta</span></summary>
			<div class="dps-about mt-3">
				<section><h3>What it does</h3><ul>
					<li>Takes each upgrade Next Upgrades offers and estimates how much DPS it would add in the clears you pick, from your own LOA Logs.</li>
					<li>Each clear is scored on its own, as a replay: that clear again, same rotation and buffs, with the upgrade. The total compares estimated damage with recorded damage over the same fight time.</li>
					<li>"What your stats are worth" applies the same model to one more of each stat.</li>
				</ul></section>
				<section><h3>How</h3><ul>
					<li>Stat upgrades (honing, accessories, bracelet rolls, quality): damage grows with attack, Additional Damage, Evolution Damage and crit, each in its own bucket. Your gear's bucket totals are read back from the meter's stat values in your newest clears.</li>
					<li>Crit Rate is valued per clear from that clear's own meter value, because what it's worth swings by fight (crit buffs, Blunt Thorn's cap).</li>
					<li>Damage gems: the share of your damage that skill dealt in each clear, times the gem's damage bonus.</li>
					<li>Cooldown gems: from how much of each fight the skill spent on cooldown, the extra casts a shorter cooldown allows. Shown separately as "up to", because fight timing isn't simulated.</li>
				</ul></section>
				<section><h3>Assumes</h3><ul>
					<li>The same rotation, fight length and party buffs as the recorded clears.</li>
					<li>One upgrade at a time. Very large jumps are approximate.</li>
					<li>Your plan's gear is close to the gear in your logs (you're warned when CP differs by 2% or more).</li>
				</ul></section>
				<section><h3>Not covered yet</h3><ul>
					<li>Engravings, Ark Grid, karma and bracelet effects: listed under "Not estimated yet".</li>
					<li>Predicting your next clear's DPS: party, buffs and execution change more between clears than one upgrade does.</li>
					<li>Outgoing Damage isn't valued; upgrades that add it show a floor ("≥").</li>
					<li>Clears logged in LOA Logs' low performance mode have no stat values, and Crit Rate needs them.</li>
					<li>Damage dealers only.</li>
					<li>Beta: checked against a small number of characters' logs so far, so numbers may change.</li>
				</ul></section>
			</div>
		</details>
		{#if !book || showImport}
			<section class="dps-panel p-4" aria-label="Import logs">
				{#if !book}<h2 class="mb-3 font-semibold">Import LOA Logs</h2>{/if}
				{#if phone && !pickerAnyway}
					<p class="text-sm text-surface-300">LOA Logs runs on PC, and imported logs stay in the browser that read them. Open this page on the PC where LOA Logs is installed to import your encounters.db.</p>
					<button class="mt-2 text-xs text-accent-300 hover:underline" onclick={() => pickerAnyway = true}>Use a file on this device anyway</button>
				{:else}
					{#key key}<DpsRunsImport characterKey={key} characterName={character.name} ondone={() => { showImport = false; }} />{/key}
				{/if}
				{#if book}<button class="{btn} mt-3" onclick={() => showImport = false}>Close</button>{/if}
			</section>
		{/if}
		{#if book}
			<section class="dps-panel p-3 sm:p-4" aria-label="Raids">
				<div class="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 class="font-semibold">Raids</h2><button class={btn} onclick={() => showImport = !showImport}>{showImport ? 'Close import' : 'Re-import logs'}</button></div>
				<div class="dps-raids">
					{#each raids.filter(r => r.kind === 'raid') as raid (raid.key)}
						{@const art = raidArt(raid.name)}{@const active = selected.some(r => r.key === raid.key)}
						<div class="dps-raid {active ? 'dps-selected' : ''}">
							{#if art}<span class="absolute inset-0" style={art}></span>{/if}<span class="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/15"></span>
							<button class="absolute inset-0 z-10" onclick={() => chooseRaid(raid.key)} aria-pressed={active && selected.length === 1} aria-label={`Show ${raid.name} ${raid.difficulty || 'Normal'}`}></button>
							<span class="pointer-events-none relative flex items-start justify-between gap-2"><span class="rounded-xs px-1 text-xs {difficultyTone(raid.difficulty)}">{raid.difficulty || 'Normal'}</span>
								{#if !active || selected.length > 1}<button class="dps-compare pointer-events-auto relative z-20" onclick={() => chooseRaid(raid.key, true)} aria-pressed={active} aria-label={`${active ? 'Remove' : 'Compare'} ${raid.name} ${raid.difficulty || 'Normal'}`}>{active ? '✓ Compared' : '+ Compare'}</button>{/if}</span>
							<span class="pointer-events-none relative mt-4 block"><strong class="block text-base text-white">{raid.name}</strong><span class="text-xs text-white/75">{raid.runs.length} {raid.runs.length === 1 ? 'clear' : 'clears'} · {formatDate(raid.last)}</span></span>
						</div>
					{/each}
				</div>
				<div class="mt-3 flex flex-wrap items-center gap-3 text-sm">
					{#if raids.some(r => r.kind === 'other')}<label class="dps-field">Other fights<select class={selectClass(false)} value="" onchange={e => { if (e.currentTarget.value) chooseRaid(e.currentTarget.value); }}><option value="">Select…</option>{#each raids.filter(r => r.kind === 'other') as r}<option value={r.key}>{selected.includes(r) ? '✓ ' : ''}{r.name} · {r.difficulty}</option>{/each}</select></label>{/if}
					<label class="dps-field">Gates<select class={selectClass(false)} bind:value={gateFilter} onchange={() => runPick = ''}><option value="">All gates</option>{#each gates as gate (gate.key)}<option value={gate.key}>{gate.label} · {gate.difficulty}</option>{/each}</select></label>
					<label class="dps-field">Clears<select class={selectClass(false)} bind:value={runPick}><option value="">All {gateRuns.length} clears</option>{#each gateRuns as run}<option value={run.id}>{formatDate(run.start)} · {gateName(run.boss)} · {duration(run.duration)}</option>{/each}</select></label>
					{#if orderOptions.length}<label class="dps-field">Order cores<select class={selectClass(!!orderFilter)} bind:value={orderFilter}><option value="">All recorded</option>{#each orderOptions as setup}<option value={setup}>{setup.replaceAll('/', '')}</option>{/each}</select></label>{/if}
					{#each selected.length > 1 ? selected.filter(r => r.kind === 'other') : [] as r}<button class={btnAccent} onclick={() => chooseRaid(r.key, true)} aria-label={`Remove ${r.name} ${r.difficulty}`}>{r.name} ×</button>{/each}
				</div>
				<div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-surface-800 pt-3 text-sm">
					<p class="font-semibold text-surface-100">{#if orderFilter}Order cores {orderFilter.replaceAll('/', '')} only · {/if}{runs.length} {runs.length === 1 ? 'clear' : 'clears'}{selected.length > 1 ? ' · Mixed raids' : ''}</p>
					<span class="text-xs text-surface-400">{selected.map(r => `${r.name} · ${r.difficulty || 'Normal'}`).join(' / ')}</span>
				</div>
				{#if runs.length}<p class="mt-2 text-xs {valued ? 'text-surface-400' : 'text-amber-300'}">Stat values in {valued} of {runs.length} {runs.length === 1 ? 'clear' : 'clears'}{valued < runs.length ? `. ${valued ? 'Crit Rate is valued from these' : "Crit Rate can't be valued for these raids"}; turn off low performance mode in LOA Logs to record stat values in every clear.` : '.'}</p>{/if}
				{#if Math.abs(cpGap) >= 0.02 && bucketRun}<p class="mt-2 text-xs text-amber-300">Your gear's damage totals come from clears at CP {bucketRun.combatPower!.toFixed(2)} ({formatDate(bucketRun.start)}); this plan is CP {cp!.toFixed(2)} ({formatPct(cpGap * 100, 1)}%). Estimates get closer after you clear with this gear and re-import.</p>{/if}
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
				{#if baseDps !== null}<p class="dps-panel p-3 text-sm text-surface-300 sm:p-4">Your recorded DPS in {selected.length === 1 ? selected[0].name : `${selected.length} raids`}: <strong class="text-lg text-surface-50">{formatDamage(baseDps)}</strong> average over {runs.length} {runs.length === 1 ? 'clear' : 'clears'}.</p>{/if}
				{#if worth}
					<section class="dps-panel p-3 sm:p-4" aria-label="What your stats are worth">
						<h2 class="font-semibold">What your stats are worth <span class="text-xs font-normal text-surface-400">in these clears</span></h2>
						<p class="mt-1 text-sm text-surface-300">{worthSentence}</p>
						<dl class="dps-worth mt-3">{#each worth.rows as r (r.key)}<div><dt>{r.label}</dt><dd class={r.gainPct === null ? 'text-surface-500' : 'text-green-400'}>{r.gainPct === null ? 'not measured' : `≈+${r.gainPct.toFixed(2)}% DPS`}</dd></div>{/each}</dl>
						<p class="mt-2 text-xs text-surface-400">Crit Rate from {worth.critClears} of {runs.length} clears with stat values; the others from your gear's totals in {worth.buildClears} recent {worth.buildClears === 1 ? 'clear' : 'clears'}. For small changes: crit has caps, so a big crit change can't be read off these.</p>
					</section>
				{/if}
				<div class="flex flex-wrap items-center justify-between gap-3"><h2 class="font-semibold">Next Upgrades</h2><div class="flex flex-wrap gap-2"><button class={btn} onclick={() => inventoryOpen = true}>Material prices / inventory</button><button class={btn} onclick={() => pricesOpen = true}>{missingPrices ? `${missingPrices} missing prices` : 'Prices'}</button></div></div>
				<div class="dps-columns">
					<section class="dps-panel min-w-0" aria-label="Next Upgrades">
						<div class="flex flex-wrap items-center justify-between gap-3 border-b border-surface-800 p-3">
							<Segmented value={sort} options={[{ value: 'dps', label: 'Most DPS' }, { value: 'cp', label: 'Most CP' }, { value: 'gold', label: 'Per gold' }]} onselect={v => sort = v} label="Upgrade ranking" size="h-8 px-2 text-xs" />
							<label class="flex items-center gap-2 text-xs text-surface-300">Budget<input class="h-8 w-24 rounded-xs border border-surface-700 bg-surface-950 px-2 text-sm text-surface-100" inputmode="decimal" placeholder="Any" aria-label="Gold budget" bind:value={budgetText} /><span class="text-amber-300">gold</span></label>
						</div>
						{#if budgetText.trim() && budget === null}<p class="px-3 pt-2 text-xs text-amber-300" role="alert">Enter a gold amount, e.g. 100k.</p>{/if}
						{#if budget !== null && missingPrices}<p class="px-3 pt-2 text-xs text-amber-300">Unpriced upgrades remain visible.</p>{/if}
						{#if missingPrices}<p class="px-3 pt-2 text-xs text-surface-400">{missingPrices} upgrades have no price yet. <button class="text-accent-300 hover:underline" onclick={() => pricesOpen = true}>Add prices</button> to rank by gold.</p>{/if}
						<div class="flex flex-wrap gap-1.5 border-b border-surface-800 p-3" role="group" aria-label="Upgrade type">{#each tabs as tab}<button class={category === tab ? btnAccent : btn} aria-pressed={category === tab} onclick={() => { category = tab; showAll = false; }}>{tab}</button>{/each}</div>
						<div class="dps-row dps-row-head text-xs text-surface-400"><span>Upgrade</span><span class="text-right">DPS / CP</span><span class="text-right">Cost</span></div>
						{#snippet row(c: DpsCandidate)}
							{@const image = look(c)}{@const cost = costs[c.id]}{@const badge = rankBadge(c)}{@const amount = dpsGain(c)}{@const spread = c.gainPct !== null ? clearSpread(c.clears) : null}
							<button class="dps-row dps-upgrade {c === shown ? 'dps-current' : ''}" onclick={() => choose(c)} aria-pressed={c === shown}>
								<span class="flex min-w-0 items-center gap-3">{#if image.icon}<ItemIcon src={image.icon} grade={image.grade} size="size-9" />{/if}<span class="min-w-0"><UpgradeTitle u={c.upgrade} /><span class="mt-1 block text-xs text-surface-400">{#if asPlayedGain(c) !== null}<span title="If you keep using the skill on cooldown as in these clears">If you keep playing like this</span>{:else if c.gainPct === null}DPS not estimated{:else}<span title={sourceTag(c).hint}>{sourceTag(c).label}</span>{/if}{#if raidSpecific(c)}{' · '}<span class="text-sky-300" title="This gain changes with the raids you pick.">Raid-specific</span>{/if}{#if badge}{' · '}<span class="dps-badge">{badge}</span>{/if}{#if c.upgrade.detail === 'KR preview'}{' · '}<span class="text-amber-300">KR preview</span>{/if}</span></span></span>
								<span class="dps-gain text-right">{#if asPlayedGain(c) !== null}<span class="block text-[10px] text-surface-400">up to</span><strong class="block text-base font-semibold text-green-400/80">{fmt(asPlayedGain(c))}</strong>{:else}<strong class="block text-base font-semibold text-green-400">{gainText(c)}</strong>{/if}{#if amount !== null}<span class="block text-xs text-green-400/80">{amountText(c, amount)}</span>{/if}{#if spread && spread.count > 1 && spread.high - spread.low >= 0.02}<span class="block text-[10px] text-surface-400" title="Lowest to highest over your clears">{formatPct(spread.low)}–{spread.high.toFixed(2)}% by clear</span>{/if}<span class="mt-0.5 block text-xs text-surface-400">CP {formatPct(c.cpPct)}%</span></span>
								<span class="dps-cost text-right text-sm"><span class={cost === undefined ? 'text-surface-500' : 'text-amber-300'}>{cost === undefined ? '—' : `${formatGold(cost)} gold`}</span><span class="mt-0.5 block text-xs text-surface-400">{cost !== undefined && c.gainPct !== null && c.gainPct > 0 ? `${formatGold(cost / c.gainPct)} / 1% DPS` : '—'}</span></span>
							</button>
						{/snippet}
						{#each listed as c (c.id)}{@render row(c)}{/each}
						{#if !filtered.length}<p class="p-4 text-sm text-surface-300">No upgrades match these filters.</p>{/if}
						{#if cooldownGems.length}<p class="border-t border-surface-800 px-3 pt-3 pb-1 text-[11px] font-semibold tracking-wide text-surface-400 uppercase" title="Not ranked with the estimates above: an upper bound that depends on how you use the skill">Cooldown gems · if you keep playing like this</p>{#each cooldownGems as c (c.id)}{@render row(c)}{/each}{/if}
						{#if unestimated.length}<details class="border-t border-surface-800"><summary class="cursor-pointer p-3 text-xs text-surface-400">Not estimated yet · {unestimated.length}</summary>{#each unestimated as c (c.id)}{@render row(c)}{/each}</details>{/if}
						<div class="flex flex-wrap items-center justify-between gap-3 border-t border-surface-800 p-3 text-xs text-surface-400">{#if estimated.length > 10}<button class="text-accent-300 hover:underline" onclick={() => showAll = !showAll}>{showAll ? 'Show top 10' : `Show all ${estimated.length}`}</button>{/if}<label class="flex items-center gap-2"><input type="checkbox" bind:checked={allOptions} />All options per slot</label><span>{filtered.length} upgrades</span></div>
					</section>
					{#if shown}
						<aside id="dps-breakdown" class="dps-panel dps-inspector p-4" aria-label="Breakdown">
							<h2 class="mb-3 font-semibold">Breakdown</h2><UpgradeTitle u={shown.upgrade} />
							{#if shown.upgrade.detail === 'KR preview'}<p class="mt-2 text-xs text-amber-300">KR preview</p>{/if}
							<div class="mt-4 flex flex-wrap items-end justify-between gap-2" aria-live="polite"><div>{#if asPlayedGain(shown) !== null}<p class="text-xs text-surface-400">If you keep playing like this</p><p class="text-3xl font-semibold text-green-400/80"><span class="text-base font-normal">up to </span>{fmt(asPlayedGain(shown))}</p>{:else}<p class="text-xs text-surface-400">DPS gain</p><p class="text-3xl font-semibold text-green-400">{gainText(shown)}</p>{/if}{#if dpsGain(shown) !== null}<p class="text-sm text-green-400/80">{amountText(shown, dpsGain(shown)!)} DPS</p>{/if}{#if rankBadge(shown)}<p class="mt-1 text-xs"><span class="dps-badge">{rankBadge(shown)}</span></p>{/if}</div><div class="text-right"><p class="text-xs text-surface-400">CP gain</p><p class="text-sm text-surface-300">{formatPct(shown.cpPct)}% (+{((cp ?? 0) * shown.cpPct / 100).toFixed(2)})</p></div></div>
							{#if asPlayedGain(shown) !== null && shown.gem}
								{@const use = shown.gem.parts.map(p => sample.skillCooldownUse[p.skill]).find(u => u !== undefined) ?? sample.skillCooldownUse[shown.gem.choice.skill]}
								<div class="mt-3 space-y-1.5 text-xs text-surface-300">
									{#if use !== undefined}<p>{shown.gem.choice.name} was on cooldown {use.toFixed(0)}% of the fight in these clears; that much of its shorter cooldown turns into extra casts.</p>{/if}
									<p class="text-amber-300/90">※ Assumes you use it again as soon as it's ready, as you did in these clears, and that the extra casts don't push out other skills. Fight timing isn't simulated, so this is the most it could add.</p>
									<p class="text-surface-400">From {shown.asPlayed!.covered} of {runs.length} clears that recorded cooldown use.</p>
								</div>
							{:else if shown.reason}<p class="mt-3 text-sm text-amber-300">{shown.reason}</p>
							{:else if shown.gainPct === null}<p class="mt-3 text-sm text-amber-300">DPS not estimated · {shown.covered}/{runs.length} clears covered.</p>{/if}
							{#each shown.notes as note}<p class="mt-2 text-xs text-amber-300/90">※ {note}</p>{/each}
							{#if replayOf(shown)}
								{@const replay = replayOf(shown)!}
								{@const sign = asPlayedGain(shown) !== null ? 'up to ≈' : shown.atLeast ? '≥' : '≈'}
								<div class="mt-4 space-y-1 border-t border-surface-800 pt-3"><h3 class="text-sm font-semibold">Replaying your clears</h3>
									<p class="text-sm text-surface-300">Your {formatDate(replay.latest.run.start)} {gateName(replay.latest.run.boss)} <span class="text-surface-400" title="LOA Logs encounter number">(#{replay.latest.run.id})</span> again, same rotation and buffs, with this upgrade: <strong class="text-green-400">{sign}{formatPct(replay.latest.gainPct)}%</strong></p>
									{#if replay.count > 1}<p class="text-xs text-surface-400">{replay.high - replay.low < 0.005 ? `The same in all ${replay.count} clears.` : `Across ${replay.count} clears: ${pctRange(replay.low, replay.high)}, typically ${formatPct(replay.median)}%.`}</p>{/if}
								</div>
							{/if}
							{#if shown.gem && !shown.gem.rough}<div class="mt-4 space-y-2 border-t border-surface-800 pt-3">{#each shown.gem.parts as part}<div class="flex items-center justify-between gap-3 text-sm"><span class="min-w-0 break-words">{book.skills[part.skill]?.[0] ?? part.name}</span><span class="shrink-0 text-surface-200">{(sample.skillShares[part.skill] ?? 0).toFixed(1)}% of damage</span></div>{/each}<p class="text-xs text-surface-400">Skill damage {formatPct(shown.gem.effectPct)}%{shown.gem.baseAttack ? ` · Base Atk. Power +${shown.gem.baseAttack.toFixed(2)}%` : ''}</p></div>{/if}
							<div class="mt-4 border-t border-surface-800 pt-3"><h3 class="mb-2 text-sm font-semibold">By raid</h3><div class="space-y-3">{#each perRaid as result}<div><div class="mb-1 flex flex-wrap justify-between gap-2 text-xs"><span>{result.raid.name} · {result.raid.difficulty}</span><span>{result.gain === null ? '—' : asPlayedGain(shown) !== null ? `up to ≈${formatPct(result.gain)}%` : shown.atLeast ? `≥${formatPct(result.gain)}%` : fmt(result.gain)}</span></div><div class="h-1.5 rounded-xs bg-surface-800"><div class="h-full rounded-xs bg-accent-500" style:width={`${Math.abs(result.gain ?? 0) / raidScale * 100}%`}></div></div></div>{/each}</div></div>
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
								{#if sameInAll(shown) !== null}<p class="flex flex-wrap justify-between gap-2"><span>By clear: same in all {shown.clears.length} clears</span><span>{fmt(sameInAll(shown))}</span></p>
								{:else}<details><summary>By clear · {shown.covered}/{runs.length} covered</summary><div class="mt-2 space-y-2">{#each shown.clears as clear}<p class="flex flex-wrap justify-between gap-2"><span>{formatDate(clear.run.start)} · {gateName(clear.run.boss)} · <span title="LOA Logs encounter number">#{clear.run.id}</span></span><span>{fmt(clear.gainPct)}</span></p>{/each}</div></details>{/if}
							</div></details>
						</aside>
					{/if}
				</div>
				{#if skills.length}
					<section class="dps-panel min-w-0" aria-label="Your skills in these clears" style:--class-color={classColor(loadout.classId) ?? 'var(--color-accent-500)'}>
						<div class="flex flex-wrap items-baseline justify-between gap-2 border-b border-surface-800 p-3"><h2 class="font-semibold">Your skills in these clears</h2><span class="text-xs text-surface-400">Same measures as LOA Logs, over {runs.length} {runs.length === 1 ? 'clear' : 'clears'}; ranges are lowest–highest in one clear.</span></div>
						<div class="dps-skill dps-skill-head text-xs text-surface-400"><span>Skill</span><span class="text-right" title="Share of your damage">D%</span><span class="text-right" title="Share of the fight the skill was on cooldown">CDR%</span><span class="dps-skill-extra text-right">Casts</span><span class="dps-skill-extra text-right" title="Casts per minute">CPM</span><span class="dps-skill-extra text-right">Crit</span><span>Gems · next level</span></div>
						{#each skillRows as row (row.id)}
							{@const info = book.skills[row.id]}{@const gems = gemsOf(row.id)}{@const cooldownGem = gems.find(g => g.kind !== 'damage')}
							<div class="dps-skill dps-skill-row" style:--share={`${row.share / topShare * 100}%`}>
								<span class="flex min-w-0 items-center gap-2">{#if info?.[1]}<img src={iconUrl(info[1])} alt="" class="size-7 shrink-0 rounded-xs" />{/if}<span class="min-w-0"><span class="block truncate text-sm text-surface-100">{info?.[0] ?? `Skill ${row.id}`}</span>{#if cooldownGem && row.cooldown !== null && row.cooldown < 60}<span class="block text-[11px] text-amber-300/90">Sat ready {(100 - row.cooldown).toFixed(0)}% of the fight: pressing it on cooldown, where the fight allows, would add more than a cooldown gem.</span>{/if}</span></span>
								<span class="text-right tabular-nums"><span class="block text-sm">{row.share.toFixed(1)}</span>{#if spanText(row.shareRange)}<span class="block text-[10px] text-surface-400">{spanText(row.shareRange)}</span>{/if}</span>
								<span class="text-right tabular-nums"><span class="block text-sm">{row.cooldown === null ? '—' : row.cooldown.toFixed(1)}</span>{#if spanText(row.cooldownRange, 0)}<span class="block text-[10px] text-surface-400">{spanText(row.cooldownRange, 0)}</span>{/if}</span>
								<span class="dps-skill-extra text-right text-sm tabular-nums">{row.casts}</span>
								<span class="dps-skill-extra text-right text-sm tabular-nums">{row.cpm.toFixed(1)}</span>
								<span class="dps-skill-extra text-right text-sm tabular-nums">{!row.crit ? '—' : `${row.crit.toFixed(1)}%`}</span>
								<span class="flex flex-wrap gap-1">{#each gems as g (g.index)}
									{@const c = gemCandidate(g.index)}{@const gain = c ? (c.gainPct ?? asPlayedGain(c)) : null}
									{#if c}<button class="dps-gem" onclick={() => openGem(c)} title={`${g.kind === 'damage' ? 'Damage' : 'Cooldown'} gem ${g.level} → ${g.level + 1}`}>{g.kind === 'damage' ? 'DMG' : 'CD'} {g.level}→{g.level + 1}{#if gain !== null}<span class="text-green-400">{c.gainPct === null ? ' up to ' : ' '}{fmt(gain)}</span>{/if}</button>
									{:else}<span class="dps-gem text-surface-400">{g.kind === 'damage' ? 'DMG' : 'CD'} {g.level}{g.level >= 10 ? ' max' : ''}</span>{/if}
								{/each}</span>
							</div>
						{/each}
						{#if skills.length > skillRows.length || allSkills}<button class="w-full border-t border-surface-800 p-3 text-left text-xs text-accent-300 hover:underline" onclick={() => allSkills = !allSkills}>{allSkills ? 'Show main skills' : `Show all ${skills.length} skills`}</button>{/if}
					</section>
				{/if}
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
	.dps-about { display: grid; gap: .9rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 16rem), 1fr)); }
	.dps-about h3 { margin-bottom: .3rem; font-size: .75rem; font-weight: 600; letter-spacing: .03em; text-transform: uppercase; color: var(--color-surface-400); }
	.dps-about ul { display: grid; gap: .3rem; padding-left: 1rem; list-style: disc; font-size: .8rem; line-height: 1.45; }
	.dps-worth { display: grid; gap: .4rem .9rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 13rem), 1fr)); }
	.dps-worth > div { display: flex; justify-content: space-between; gap: .5rem; border-bottom: 1px solid var(--color-surface-800); padding-bottom: .3rem; font-size: .85rem; }
	.dps-worth dt { color: var(--color-surface-300); }
	.dps-worth dd { font-variant-numeric: tabular-nums; white-space: nowrap; }
	.dps-skill { display: grid; grid-template-columns: minmax(0, 1fr) 4rem 4rem 3.5rem 3.5rem 4rem minmax(9rem, 13rem); gap: .6rem; align-items: center; padding: .45rem .8rem; }
	.dps-skill-head { padding-block: .5rem; }
	.dps-skill-row { border-top: 1px solid var(--color-surface-800); background: linear-gradient(90deg, color-mix(in oklab, var(--class-color) 30%, transparent) var(--share), transparent var(--share)); }
	.dps-gem { display: inline-flex; gap: .2rem; border: 1px solid var(--color-surface-700); border-radius: 2px; padding: 0 .35rem; font-size: .72rem; font-variant-numeric: tabular-nums; white-space: nowrap; }
	button.dps-gem:hover { border-color: var(--color-accent-400); }
	.dps-raids { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr)); gap: .6rem; }
	.dps-raid { position: relative; overflow: hidden; border: 1px solid var(--color-surface-700); border-radius: 2px; padding: .7rem; text-align: left; }
	.dps-raid:has(> button:focus-visible) { outline: 2px solid var(--color-accent-300); outline-offset: 1px; }
	.dps-compare { border-radius: 2px; padding: 0 .3rem; font-size: .75rem; color: white; background: rgb(0 0 0 / .45); }
	.dps-compare:hover { background: rgb(0 0 0 / .7); }
	.dps-badge { border-radius: 2px; padding: 0 .3rem; color: var(--color-accent-200); background: color-mix(in oklab, var(--color-accent-700) 30%, transparent); white-space: nowrap; }
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
		@media (max-width: 760px) { .dps-skill { grid-template-columns: minmax(0, 1fr) 3.5rem 3.5rem; } .dps-skill-extra { display: none; } .dps-skill > :last-child { grid-column: 1 / -1; } }
	@media (max-width: 600px) {
		.dps-raids { grid-template-columns: repeat(2, minmax(0, 1fr)); }
		.dps-field { flex: 1 1 100%; justify-content: space-between; }
		.dps-field select { width: min(75%, 18rem); }
		.dps-row { grid-template-columns: minmax(0, 1fr) 7rem; gap: .5rem; }
		.dps-row-head { display: none; }
		.dps-upgrade > span:first-child { grid-row: span 2; }
		.dps-gain, .dps-cost { grid-column: 2; }
	}
	@media (pointer: coarse) { .dps-workspace :is(button, select, a, input:not([type='checkbox'])) { min-height: 44px; } .dps-workspace :is(input, select) { font-size: 16px; } }
</style>
