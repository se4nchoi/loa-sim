<script lang="ts">
	import { getContext } from 'svelte';
	import { engravingIcon } from '../icons';
	import type { RoleTables } from '../roles';
	import type { SimState } from '../simulate';
	import { STONE_BONUS_ATK_PCT, STONE_LEVEL_NODES, bestStones, hasStoneBonus, type StonePick } from '../stones';
	import { ENGRAVING_BOOK_STEPS } from '../tables';
	import { engravingName } from '../upgrades';
	import Delta from './Delta.svelte';
	import Glyph from './Glyph.svelte';
	import ItemIcon from './ItemIcon.svelte';
	import MenuPicker from './MenuPicker.svelte';
	import SimCard from './SimCard.svelte';
	import { RELIC_COLOR, STONE_COLOR, btn, type MenuOption, type PreviewEdit, type SectionDelta } from './ui';

	let {
		sim = $bindable(),
		base,
		delta,
		preview
	}: { sim: SimState; base: SimState; delta: SectionDelta; preview: PreviewEdit } = $props();

	const ids = $derived(Object.keys(sim.engravings).map(Number));
	const stoned = $derived(ids.filter((id) => sim.engravings[id].stone > 0).length);
	// Relic engraving level X0–X4 = 0/5/10/15/20 books read.
	const BOOKS: MenuOption<number>[] = ENGRAVING_BOOK_STEPS.map((n, col) => ({
		value: col,
		label: `X${col}  (${n}/20 books)`,
		glyph: 'relic',
		color: col > 0 ? RELIC_COLOR : undefined,
		muted: col === 0
	}));
	const shown = (id: number) => sim.engravings[id].as ?? id;
	const role = getContext<() => RoleTables>('loa-sim:role');
	/** Engravings this slot can become: any this role scores that another slot isn't already using. */
	const swapOptions = (id: number): MenuOption<number>[] => {
		const taken = new Set(ids.filter((x) => x !== id).map(shown));
		return role()
			.engravingIds()
			.filter((e) => !taken.has(e))
			.map((e) => ({ value: e, label: engravingName(e), iconUrl: engravingIcon(e) }))
			.sort((a, b) => a.label.localeCompare(b.label));
	};
	// Characters run up to five engravings; empty rows take any engraving that scores and isn't used yet.
	const SLOTS = 5;
	const REMOVE = 0;
	const empty = $derived(Math.max(0, SLOTS - ids.length));
	/** An added row's picker can also clear the slot again. */
	const pickerOptions = (id: number) =>
		sim.engravings[id].added ? [{ value: REMOVE, label: 'Remove (empty slot)', muted: true }, ...swapOptions(id)] : swapOptions(id);
	const added = (books = ENGRAVING_BOOK_STEPS.length - 1) => ({ books, stone: 0, added: true });
	/** Swap an added row to another engraving (it's keyed by its own id), or clear it. */
	function moveAdded(s: SimState, from: number, to: number) {
		const e = s.engravings[from];
		delete s.engravings[from];
		if (to !== REMOVE) s.engravings[to] = { ...e };
	}

	// Which two of the engravings above a stone should carry, by Combat Power. Only scored while the section is open.
	let stonesOpen = $state(false);
	const cpNow = getContext<(() => number) | undefined>('loa-sim:cp');
	const withStones = (s: SimState, stones: Record<number, number>) => {
		for (const id of Object.keys(s.engravings).map(Number)) s.engravings[id].stone = stones[id] ?? 0;
	};
	const stonePicks = $derived(stonesOpen ? bestStones(ids, (stones) => preview((s) => withStones(s, stones))) : []);
	const isCurrent = (p: StonePick) => ids.every((id) => sim.engravings[id].stone === (p.stones[id] ?? 0));
	const stoneLabel = (stones: Record<number, number>) =>
		Object.entries(stones)
			.filter(([, lv]) => lv > 0)
			.sort(([, a], [, b]) => b - a)
			.map(([id, lv]) => `${engravingName(shown(Number(id)))} Lv. ${lv}`)
			.join(' + ') || 'none';
	const pickLabel = (p: StonePick) => stoneLabel(p.stones);

	const STONE: MenuOption<number>[] = [0, 1, 2, 3, 4].map((lv) => ({
		value: lv,
		label: lv === 0 ? 'No stone level' : `Lv. ${lv}`,
		glyph: 'stone',
		color: lv > 0 ? STONE_COLOR : undefined,
		muted: lv === 0
	}));
</script>

<SimCard title="Engravings" {delta}>
	{#snippet actions()}
		<button type="button" class={btn} onclick={() => ids.forEach((id) => (sim.engravings[id].books = ENGRAVING_BOOK_STEPS.length - 1))}>All max</button>
		<button type="button" class={btn} onclick={() => (sim.engravings = structuredClone($state.snapshot(base.engravings)))}>Reset</button>
	{/snippet}
	{#if ids.length === 0 && role().engravingIds().length === 0}
		<p class="text-sm text-surface-400">No supported engravings found.</p>
	{:else}
		<!-- Narrow cards (container query) show engraving icons only. -->
		<div class="@container flex flex-col divide-y divide-neutral-950">
			{#each ids as id (id)}
				{@const e = sim.engravings[id]}
				{@const b = base.engravings[id] as SimState['engravings'][number] | undefined}
				<div class="flex flex-row items-center gap-x-2 py-1.5 first:pt-0 last:pb-0">
					<div class="min-w-0 flex-1">
						<MenuPicker
							value={shown(id)}
							options={pickerOptions(id)}
							label={`Swap ${engravingName(id)}`}
							changed={!b || shown(id) !== id}
							onpick={(v) => {
								if (e.added) moveAdded(sim, id, v);
								else e.as = v === id ? undefined : v;
							}}
							preview={(v) =>
								preview((s) => {
									if (s.engravings[id].added) moveAdded(s, id, v);
									else s.engravings[id].as = v === id ? undefined : v;
								})}
							full
						>
							{#snippet trigger()}
								<span class="-ml-1 shrink-0"><ItemIcon src={engravingIcon(shown(id))} grade={5} size="size-6" title={engravingName(shown(id))} /></span>
								<span class="min-w-0 truncate text-sm font-semibold @max-[17rem]:hidden" title={engravingName(shown(id))}>{engravingName(shown(id))}</span>
							{/snippet}
						</MenuPicker>
					</div>
					<MenuPicker
						value={e.books}
						options={BOOKS}
						label={`${engravingName(id)} relic engraving level`}
						changed={e.books !== b?.books}
						onpick={(v) => (e.books = v)}
						preview={(v) => preview((s) => (s.engravings[id].books = v))}
						align="right"
					>
						{#snippet trigger()}
							<Glyph kind="relic" dim={e.books === 0} />
							<span class="font-bold tabular-nums" style:color={e.books > 0 ? RELIC_COLOR : undefined}>X{e.books}</span>
						{/snippet}
					</MenuPicker>
					<MenuPicker
						value={e.stone}
						options={STONE}
						label={`${engravingName(id)} ability stone level`}
						changed={e.stone !== b?.stone}
						onpick={(v) => (e.stone = v)}
						preview={(v) => preview((s) => (s.engravings[id].stone = v))}
						align="right"
					>
						{#snippet trigger()}
							<Glyph kind="stone" dim={e.stone === 0} />
							<span class="w-9 font-bold tabular-nums" style:color={e.stone > 0 ? STONE_COLOR : undefined}>{e.stone ? `Lv. ${e.stone}` : '—'}</span>
						{/snippet}
					</MenuPicker>
				</div>
			{/each}
			{#each { length: empty } as _, k (k)}
				<div class="py-1.5 first:pt-0 last:pb-0">
					<MenuPicker
						value={REMOVE}
						options={swapOptions(-1)}
						label="Add an engraving"
						onpick={(v) => (sim.engravings[v] = added())}
						preview={(v) => preview((s) => (s.engravings[v] = added()))}
						full
					>
						{#snippet trigger()}<span class="text-sm text-surface-400">+ Add engraving</span>{/snippet}
					</MenuPicker>
				</div>
			{/each}
		</div>
		{#if stoned > 2}
			<p class="mt-2 text-xs text-amber-300">An ability stone carries at most two engravings ({stoned} set).</p>
		{/if}
		{#if ids.length > 1}
			<details class="mt-2 rounded-xs border border-surface-700 bg-black/15 px-3 py-2 text-xs text-surface-300" bind:open={stonesOpen}>
				<summary class="cursor-pointer font-semibold text-surface-100 select-none">Suggested Stone Kit Engravings</summary>
				<p class="mt-1.5 text-amber-300">
					Combat Power only, not a DPS estimate. CP values some engravings differently from their real damage (crit or
					back attack based ones, or builds that drop an engraving), and Smilegate can change the CP ratios.
				</p>
				<p class="mt-1.5">Current stone: <span class="text-surface-100">{stoneLabel(Object.fromEntries(ids.map((id) => [id, sim.engravings[id].stone])))}</span></p>
				<ul class="mt-2 flex flex-col divide-y divide-neutral-950">
					{#each stonePicks as p (p.pattern.join('/'))}
						<li class="flex flex-row items-center gap-x-2 py-1.5 first:pt-0 last:pb-0">
							<span class="flex w-16 shrink-0 flex-col leading-tight">
								<span class="font-bold tabular-nums" style:color={STONE_COLOR}>Lv. {p.pattern[0]} / {p.pattern[1]}</span>
								<span class="text-[0.85em] text-surface-400 tabular-nums">
									{STONE_LEVEL_NODES[p.pattern[0]]}/{STONE_LEVEL_NODES[p.pattern[1]]}{hasStoneBonus(p.pattern) ? ` · +${STONE_BONUS_ATK_PCT}% Atk` : ''}
								</span>
							</span>
							<span class="min-w-0 flex-1 truncate text-surface-100" title={pickLabel(p)}>{pickLabel(p)}</span>
							<Delta pct={p.pct} cp={((cpNow?.() ?? 0) * p.pct) / 100} />
							{#if isCurrent(p)}
								<span class="w-12 text-right text-surface-400">Current</span>
							{:else}
								<button type="button" class="{btn} w-12" onclick={() => withStones(sim, p.stones)}>Apply</button>
							{/if}
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	{/if}
</SimCard>
