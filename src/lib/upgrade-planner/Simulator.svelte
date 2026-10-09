<!--
	Combat Power simulator: edit honing, accessories, gems, engravings, ark grid, bracelet and karma, and see
	the character's CP update live. Usage on the character page:
		<Simulator loadout={loadout}>{#snippet sidebar()}…extra sidebar cards…{/snippet}</Simulator>
	The sidebar holds the Combat Power card and Next Upgrades (whose Apply buttons edit the simulation).
-->
<script lang="ts">
	import { setContext, untrack, type Snippet, tick } from 'svelte';
	import { className as classNameOf } from './class-names';
	import { applyUpgrade } from './apply-upgrade';
	import { roleOf } from './roles';
	import UpgradePlanner from './UpgradePlanner.svelte';
	import { folded, toggleFold } from './sim/folded.svelte';
	import FoldChip from './sim/FoldChip.svelte';
	import BottomDrawer from './sim/BottomDrawer.svelte';
	import HScroll from './sim/HScroll.svelte';
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
		characterKey,
		cpDistribution = null
	}: {
		loadout: Loadout;
		sidebar?: Snippet;
		characterName?: string;
		/** "na/soulshan": keys what is kept per character (bound honing mats). */
		characterKey?: string;
		cpDistribution?: CpDistribution | null;
	} = $props();

	const base = $derived(initSimState(loadout));
	const SECTION_TITLES = ['Equipment', 'Accessories', 'Bracelet', 'Gems', 'Engravings', 'Karma', 'Skins', 'Ark Grid'];
	const sectionId = (title: string) => `sim-${title.toLowerCase().replaceAll(' ', '-')}`;
	/** The section under the sticky area (site header + phone CP bar): its chip lights up. */
	let activeSection = $state<string | null>(null);
	$effect(() => {
		const bar = document.querySelector<HTMLElement>('[data-cp-bar]');
		const root = document.documentElement;
		// Where sticky things end: card headers stick there, and the scroll spy reads sections against it.
		const stickyTop = () => 48 + (bar?.offsetHeight ?? 0);
		const sync = () => root.style.setProperty('--sim-sticky-top', `${stickyTop()}px`);
		const spy = () => {
			const line = stickyTop() + 12;
			let current: string | null = null;
			for (const title of SECTION_TITLES) {
				const el = document.getElementById(sectionId(title));
				if (el && el.getBoundingClientRect().top <= line) current = sectionId(title);
			}
			if (current !== activeSection) activeSection = current;
		};
		sync();
		spy();
		const resized = new ResizeObserver(() => (sync(), spy()));
		if (bar) resized.observe(bar);
		const changed = bar ? new MutationObserver(() => (sync(), spy())) : null;
		changed?.observe(bar!, { childList: true, subtree: true });
		window.addEventListener('scroll', spy, { passive: true });
		window.addEventListener('resize', spy);
		return () => {
			resized.disconnect();
			changed?.disconnect();
			window.removeEventListener('scroll', spy);
			window.removeEventListener('resize', spy);
			root.style.removeProperty('--sim-sticky-top');
		};
	});
	// Keep the active chip in view inside its sideways row (both rows: phone bar and desktop sidebar).
	$effect(() => {
		if (!activeSection) return;
		for (const chip of document.querySelectorAll<HTMLElement>(`[data-section="${activeSection}"]`)) {
			const row = chip.parentElement;
			if (!row) continue;
			const left = chip.offsetLeft - row.offsetLeft;
			if (left < row.scrollLeft || left + chip.offsetWidth > row.scrollLeft + row.clientWidth)
				row.scrollTo({ left: Math.max(0, left - 16), behavior: 'smooth' });
		}
	});
	/** Phones: the Next Upgrades drawer (see BottomDrawer). */
	let drawerOpen = $state(false);
	/** Dock the CP bar at the top first (scroll it up if it's still mid-page), so it shows above the drawer. */
	function openDrawer() {
		const bar = document.querySelector<HTMLElement>('[data-cp-bar]');
		if (bar) {
			const dockAt = parseFloat(getComputedStyle(bar).top) || 0;
			const gap = bar.getBoundingClientRect().top - dockAt;
			if (gap > 1) window.scrollBy({ top: gap, behavior: 'instant' });
		}
		drawerOpen = true;
	}
	/** Where the docked CP bar ends, so the drawer's top meets it; follows the bar as it grows (Show) or shrinks. */
	let drawerTop = $state(0);
	$effect(() => {
		if (!drawerOpen) return;
		const bar = document.querySelector<HTMLElement>('[data-cp-bar]');
		if (!bar) return;
		const measure = () => (drawerTop = bar.getBoundingClientRect().bottom);
		measure();
		// Size changes (fonts, rotation) and content changes (Show / Hide) both move the bar's bottom edge.
		const resized = new ResizeObserver(measure);
		resized.observe(bar);
		const changed = new MutationObserver(measure);
		changed.observe(bar, { childList: true, subtree: true });
		return () => (resized.disconnect(), changed.disconnect());
	});
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

{#snippet jumpChips(pad: string)}
	<!-- One row, scrolled sideways (no scrollbar; the mouse wheel scrolls it too), like the character chips. The padding
	     sits outside the scroller, so chips are clipped short of the edges instead of running into them. -->
	<div class={pad}>
	<HScroll class="gap-1.5">
		{#each SECTION_TITLES as title}
			<a
				href={`#${sectionId(title)}`}
				onclick={async (e) => {
					// Smooth scroll in place: no instant jump (it read as a flash) and no history entry per tap.
					const target = document.getElementById(sectionId(title));
					if (!target) return;
					e.preventDefault();
					if (drawerOpen) {
						drawerOpen = false; // a section tap from the drawer closes it, then goes there
						await tick();
					}
					target.scrollIntoView({ behavior: 'smooth', block: 'start' });
				}}
				data-section={sectionId(title)}
				aria-current={activeSection === sectionId(title) ? 'location' : undefined}
				class="shrink-0 rounded-xs border px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap transition-colors {activeSection === sectionId(title)
					? 'border-accent-500 bg-accent-700/40 text-surface-50'
					: 'border-surface-700 bg-surface-800 text-surface-200 hover:bg-surface-700 hover:text-surface-50'}">{title}</a
			>
		{/each}
	</HScroll>
	</div>
{/snippet}

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
<MobileSummaryBar {current} {simulated} nav={jumpChips}>{@render summary()}</MobileSummaryBar>
<div class="grid grid-cols-[1fr_320px] items-start gap-2 max-lg:grid-cols-1">
	<!-- Two columns on wide screens; a single column only when the screen is narrow. -->
	<div class="flex min-w-0 flex-col gap-2">
		<div class="grid grid-cols-2 items-start gap-2 max-xl:grid-cols-1">
			<div class="flex min-w-0 flex-col gap-2">
				<section id="sim-equipment" aria-label="Equipment" class="scroll-mt-28 max-lg:scroll-mt-32"><SimGear bind:sim {base} {itemIds} classId={loadout.classId} delta={sections.gear} /></section>
				<section id="sim-accessories" aria-label="Accessories" class="scroll-mt-28 max-lg:scroll-mt-32"><SimAccessories bind:sim {base} {itemIds} {mainStatName} {preview} delta={sections.accessories} /></section>
				<section id="sim-bracelet" aria-label="Bracelet" class="scroll-mt-28 max-lg:scroll-mt-32"><SimBracelet bind:sim {base} {loadout} itemId={itemIds.bracelet} {mainStatName} {preview} delta={sections.bracelet} /></section>
			</div>
			<div class="flex min-w-0 flex-col gap-2">
				<section id="sim-gems" aria-label="Gems" class="scroll-mt-28 max-lg:scroll-mt-32"><SimGems bind:sim {base} {gems} {characterName} delta={sections.gems} /></section>
				<section id="sim-engravings" aria-label="Engravings" class="scroll-mt-28 max-lg:scroll-mt-32"><SimEngravings bind:sim {base} {preview} delta={sections.engravings} /></section>
				<section id="sim-karma" aria-label="Karma" class="scroll-mt-28 max-lg:scroll-mt-32"><SimKarma bind:sim {base} delta={sections.karma} /></section>
				<section id="sim-skins" aria-label="Skins" class="scroll-mt-28 max-lg:scroll-mt-32"><SimSkins bind:sim {base} {itemIds} {mainStatName} delta={sections.skins} /></section>
			</div>
		</div>
		<section id="sim-ark-grid" aria-label="Ark Grid" class="scroll-mt-28 max-lg:scroll-mt-32"><SimArkGrid bind:sim {base} {cores} {loadout} {preview} delta={sections.arkGrid} /></section>
	</div>
	<!-- Sticky sidebar, as tall as the window: the CP card and section links stay whole, Next Upgrades takes the rest
	     and scrolls its own list. -->
	<div class="flex flex-col gap-2 lg:sticky lg:top-16 lg:max-h-[calc(100vh-5rem)] lg:self-start lg:overflow-y-auto">
		<div class="shrink-0 max-lg:hidden">{@render summary()}</div>
		<!-- Same card shape as Next Upgrades: a fixed header strip, the links fold away beneath it. -->
		<nav aria-label="Simulator cards" class="flex shrink-0 flex-col max-lg:hidden divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
			<button
				type="button"
				class="group flex flex-row items-center gap-2 p-2 text-left text-xs text-surface-400 hover:text-surface-100"
				aria-expanded={!folded.nav}
				onclick={() => toggleFold('nav')}
			>
				Jump to<span class="ml-auto"><FoldChip open={!folded.nav} /></span>
			</button>
			<div hidden={folded.nav}>{@render jumpChips("p-2")}</div>
		</nav>
		<UpgradePlanner class="max-lg:hidden lg:min-h-56 lg:flex-1" {loadout} {characterKey} {characterName} simState={sim} simBase={base} currentCp={simulated} onapply={applySuggestion} />
		{@render sidebar?.()}
	</div>
</div>

<!-- Phones: Next Upgrades lives in a bottom drawer, opened from a pinned button (the page would otherwise put it
     below every card). The CP bar on top stays visible above the drawer's backdrop. -->
<div class="h-16 lg:hidden" aria-hidden="true"></div>
{#if !drawerOpen}
	<button
		type="button"
		class="fixed inset-x-3 bottom-3 z-30 flex h-12 flex-row items-center justify-between rounded-xs border border-accent-500/50 bg-surface-900/95 px-4 text-sm font-bold text-surface-50 shadow-lg shadow-black/60 backdrop-blur lg:hidden"
		aria-haspopup="dialog"
		onclick={openDrawer}
	>
		Next Upgrades
		<svg viewBox="0 0 16 16" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 10l4-4 4 4" /></svg>
	</button>
{/if}
<BottomDrawer bind:open={drawerOpen} label="Next Upgrades" top={drawerTop}>
	<UpgradePlanner scroll class="min-h-0 flex-1 rounded-none shadow-none" limit={1000} {loadout} {characterKey} {characterName} simState={sim} simBase={base} currentCp={simulated} onapply={applySuggestion} />
</BottomDrawer>
