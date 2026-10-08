<!--
	Combat Power simulator: edit honing, accessories, gems, engravings, ark grid, bracelet and karma, and see
	the character's CP update live. Usage on the character page:
		<Simulator loadout={loadout}>{#snippet sidebar()}…extra sidebar cards…{/snippet}</Simulator>
	The sidebar holds the Combat Power card and Next Upgrades (whose Apply buttons edit the simulation).
-->
<script lang="ts">
	import { setContext, untrack, type Snippet } from 'svelte';
	import { className as classNameOf } from './class-names';
	import { applyUpgrade } from './apply-upgrade';
	import { roleOf } from './roles';
	import UpgradePlanner from './UpgradePlanner.svelte';
	import { supportCombatPower } from './support';
	import { cpBrackets, cpStanding, ownRange, type CpDistribution, type CpRole, type IlvlRange } from './cp-distribution';
	import SimAccessories from './sim/SimAccessories.svelte';
	import SimArkGrid from './sim/SimArkGrid.svelte';
	import SimBracelet from './sim/SimBracelet.svelte';
	import SimEngravings from './sim/SimEngravings.svelte';
	import SimGear from './sim/SimGear.svelte';
	import SimGems from './sim/SimGems.svelte';
	import SimKarma from './sim/SimKarma.svelte';
	import SimSkins from './sim/SimSkins.svelte';
	import MobileSummaryBar from './sim/MobileSummaryBar.svelte';
	import SimSummary from './sim/SimSummary.svelte';
	import { SECTIONS, type PreviewEdit, type SectionDelta, type SimSection } from './sim/ui';
	import { gemParts, initSimState, itemLevel, mainStatIndex, simulate, type SimState } from './simulate';
	import type { Loadout } from './types';
	import { coreStates, type Upgrade } from './upgrades';

	let {
		loadout,
		sidebar,
		characterName,
		cpDistribution = null
	}: { loadout: Loadout; sidebar?: Snippet; characterName?: string; cpDistribution?: CpDistribution | null } = $props();

	const base = $derived(initSimState(loadout));
	let sim = $state(untrack(() => initSimState(loadout)));
	// Start over when a different character's loadout comes in.
	$effect.pre(() => {
		sim = initSimState(loadout);
	});

	const snapshot = () => $state.snapshot(sim) as SimState;
	const baseline = $derived(simulate(loadout, base, base));
	const result = $derived(simulate(loadout, snapshot(), base));
	// Supports: how each half of the score (Buff Power, Shield & Heal Power) moves.
	const split = $derived.by(() => {
		if (!loadout.battlePoint.isSupport) return null;
		const [a, b] = [supportCombatPower(baseline.parts), supportCombatPower(result.parts)];
		return {
			buff: { value: b.buff, pct: (b.buff / a.buff - 1) * 100 },
			shieldHeal: { value: b.shieldHeal, pct: (b.shieldHeal / a.shieldHeal - 1) * 100 }
		};
	});
	const current = $derived(loadout.combatPower?.score ?? baseline.cp);
	// Keep the headline number identical to the in-game score; edits apply as a ratio on top.
	const simulated = $derived(current * (result.cp / baseline.cp));

	/** Each section's effect on its own: only that section's edits applied to the starting state. */
	const sections = $derived.by(() => {
		const s = snapshot();
		const out = {} as Record<SimSection, SectionDelta>;
		for (const [name, keys] of Object.entries(SECTIONS) as [SimSection, readonly (keyof SimState)[]][]) {
			const only = { ...base, ...Object.fromEntries(keys.map((k) => [k, s[k]])) } as SimState;
			const pct = (simulate(loadout, only, base).cp / baseline.cp - 1) * 100;
			out[name] = { pct, cp: (current * pct) / 100 };
		}
		return out;
	});

	/** CP change (percent of the current simulation) if `mutate` were applied on top of it. */
	const preview: PreviewEdit = (mutate) => {
		const s = structuredClone(snapshot());
		mutate(s);
		return (simulate(loadout, s, base).cp / result.cp - 1) * 100;
	};

	// Pickers show a preview's raw CP next to its percent.
	setContext('loa-sim:cp', () => simulated);
	// Dealer or support battle point tables, for the cards (which lines / options / effects score).
	setContext('loa-sim:role', () => roleOf(loadout));

	// Standing among the class: the character's own 10-level bracket until the player picks another range.
	const own = $derived(ownRange(loadout.itemLevel));
	let range = $state<IlvlRange>(null);
	$effect.pre(() => {
		range = own;
	});
	// Dealers and supports are ranked separately; the score's id says which one this is.
	const role = $derived<CpRole>(loadout.combatPower?.id === 2 || (!loadout.combatPower && loadout.battlePoint.isSupport) ? 2 : 1);
	const brackets = $derived(cpDistribution ? cpBrackets(cpDistribution, role) : []);
	const standing = $derived(cpDistribution ? cpStanding(cpDistribution, range, role) : null);
	const className = $derived(classNameOf(loadout.classId));

	const gems = $derived(gemParts(loadout));
	const cores = $derived(coreStates(loadout));
	const itemIds = $derived(Object.fromEntries((loadout.items ?? []).map((i) => [i.slot, i.id])));
	const mainStatName = $derived(({ 3: 'Strength', 4: 'Dexterity', 5: 'Intelligence' } as Record<number, string>)[mainStatIndex(loadout)]);

	/** Next Upgrades → Apply: make the suggested edit in the simulator. */
	function applySuggestion(u: Upgrade) {
		const s = snapshot();
		if (!applyUpgrade(loadout, s, base, u)) return false;
		sim = s;
		return true;
	}

	function reset() {
		sim = initSimState(loadout);
	}

	// Undo / redo: snapshots of the edit state. Changes within HISTORY_MERGE_MS (a slider drag, quick clicks)
	// merge into one step.
	const HISTORY_MERGE_MS = 400;
	let past = $state<string[]>([]);
	let future = $state<string[]>([]);
	let last = untrack(() => JSON.stringify($state.snapshot(sim)));
	let lastAt = 0;
	let restoring = false;
	$effect(() => {
		const now = JSON.stringify($state.snapshot(sim));
		untrack(() => {
			if (now === last) return;
			if (restoring) restoring = false;
			else {
				if (Date.now() - lastAt > HISTORY_MERGE_MS) past = [...past.slice(-99), last];
				future = [];
				lastAt = Date.now();
			}
			last = now;
		});
	});
	$effect.pre(() => {
		void loadout;
		untrack(() => {
			past = [];
			future = [];
			last = JSON.stringify($state.snapshot(sim));
		});
	});
	function restore(json: string) {
		restoring = true;
		sim = JSON.parse(json);
	}
	function undo() {
		const prev = past.at(-1);
		if (prev === undefined) return;
		past = past.slice(0, -1);
		future = [...future, last];
		restore(prev);
	}
	function redo() {
		const next = future.at(-1);
		if (next === undefined) return;
		future = future.slice(0, -1);
		past = [...past, last];
		restore(next);
	}
	function onkeydown(e: KeyboardEvent) {
		if (!(e.ctrlKey || e.metaKey) || (e.target as HTMLElement)?.tagName === 'INPUT') return;
		if (e.key.toLowerCase() === 'z' && !e.shiftKey) (e.preventDefault(), undo());
		else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) (e.preventDefault(), redo());
	}
</script>

<svelte:window {onkeydown} />

{#snippet summary()}
	<SimSummary
		{current}
		{simulated}
		ilvlBefore={itemLevel(base)}
		ilvlAfter={itemLevel(sim)}
		{split}
		{sections}
		{standing}
		{brackets}
		ownRange={own}
		bind:range
		{className}
		onreset={reset}
		onundo={undo}
		onredo={redo}
		canUndo={past.length > 0}
		canRedo={future.length > 0}
	/>
{/snippet}

<!-- Phones/tablets: pinned under the header while scrolling, expandable. -->
<MobileSummaryBar {current} {simulated}>{@render summary()}</MobileSummaryBar>
<div class="grid grid-cols-[1fr_320px] items-start gap-2 max-lg:grid-cols-1">
	<!-- Two columns on wide screens; a single column only when the screen is narrow. -->
	<div class="flex min-w-0 flex-col gap-2">
		<div class="grid grid-cols-2 items-start gap-2 max-xl:grid-cols-1">
			<div class="flex min-w-0 flex-col gap-2">
				<section id="sim-equipment" aria-label="Equipment" class="scroll-mt-28"><SimGear bind:sim {base} {itemIds} classId={loadout.classId} delta={sections.gear} /></section>
				<section id="sim-accessories" aria-label="Accessories" class="scroll-mt-28"><SimAccessories bind:sim {base} {itemIds} {mainStatName} {preview} delta={sections.accessories} /></section>
				<section id="sim-bracelet" aria-label="Bracelet" class="scroll-mt-28"><SimBracelet bind:sim {base} {loadout} itemId={itemIds.bracelet} {mainStatName} {preview} delta={sections.bracelet} /></section>
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<section id="sim-gems" aria-label="Gems" class="scroll-mt-28"><SimGems bind:sim {base} {gems} {characterName} delta={sections.gems} /></section>
				<section id="sim-engravings" aria-label="Engravings" class="scroll-mt-28"><SimEngravings bind:sim {base} {preview} delta={sections.engravings} /></section>
				<section id="sim-karma" aria-label="Karma" class="scroll-mt-28"><SimKarma bind:sim {base} delta={sections.karma} /></section>
				<section id="sim-skins" aria-label="Skins" class="scroll-mt-28"><SimSkins bind:sim {base} {itemIds} {mainStatName} delta={sections.skins} /></section>
			</div>
		</div>
		<section id="sim-ark-grid" aria-label="Ark Grid" class="scroll-mt-28"><SimArkGrid bind:sim {base} {cores} {loadout} {preview} delta={sections.arkGrid} /></section>
	</div>
	<div class="flex flex-col gap-2 lg:sticky lg:top-16">
		<div class="max-lg:hidden">{@render summary()}</div>
		<nav aria-label="Simulator cards" class="card p-3">
			<div class="grid grid-cols-2 gap-2">
				{#each ['Equipment', 'Accessories', 'Bracelet', 'Gems', 'Engravings', 'Karma', 'Skins', 'Ark Grid'] as title}
					<a href={`#sim-${title.toLowerCase().replaceAll(' ', '-')}`} class="rounded-xs border border-surface-700 bg-surface-800 px-2 py-2 text-center text-xs font-semibold text-surface-200 hover:bg-surface-700 hover:text-surface-50">{title}</a>
				{/each}
			</div>
		</nav>
		<UpgradePlanner {loadout} simState={sim} simBase={base} currentCp={simulated} onapply={applySuggestion} />
		{@render sidebar?.()}
	</div>
</div>
