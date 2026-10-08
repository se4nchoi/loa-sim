<script lang="ts">
	import { getContext } from 'svelte';
	import { engravingIcon, iconUrl } from '../icons';
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
	/** Scored and utility engravings for this role, excluding duplicates. */
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

	// Which two of the engravings above a stone should carry, by Combat Power.
	const cpNow = getContext<(() => number) | undefined>('loa-sim:cp');
	const withStones = (s: SimState, stones: Record<number, number>) => {
		for (const id of Object.keys(s.engravings).map(Number)) s.engravings[id].stone = stones[id] ?? 0;
	};
	const stonePicks = $derived(bestStones(ids, (stones) => preview((s) => withStones(s, stones))));
	const stoneEngravings = (stones: Record<number, number>) => Object.entries(stones)
		.filter(([, level]) => level > 0)
		.sort(([, a], [, b]) => b - a)
		.map(([id]) => shown(Number(id)));
	const isCurrent = (p: StonePick) => ids.every((id) => sim.engravings[id].stone === (p.stones[id] ?? 0));
	const stoneLabel = (stones: Record<number, number>) =>
		Object.entries(stones)
			.filter(([, lv]) => lv > 0)
			.sort(([, a], [, b]) => b - a)
			.map(([id, lv]) => `${engravingName(shown(Number(id)))} Lv. ${lv}`)
			.join(' + ') || 'none';

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
			<details class="group mt-2 min-w-0 rounded-xs border border-surface-700 bg-black/15 p-3 text-xs text-surface-300 open:h-[29rem]" aria-label="Stone kit suggestions">
				<summary class="flex h-7 cursor-pointer list-none items-center gap-2 font-semibold text-surface-100 [&::-webkit-details-marker]:hidden">
					<ItemIcon src={iconUrl('Use_13_225')} grade={6} size="size-7" title="Soaring Stone Engraving Setting Kit" />
					<span>Suggested Stone Kit Engravings</span>
					<span class="ml-auto text-surface-400 transition-transform group-open:rotate-90" aria-hidden="true">▸</span>
				</summary>
				<div class="mt-2 flex h-[25rem] min-w-0 flex-col gap-2">
				<div class="grid h-28 shrink-0 grid-rows-3 gap-1 rounded-xs border border-sky-500/60 bg-sky-950/30 p-2" aria-label="Best stone kit engravings">
					{#each stoneEngravings(stonePicks[0]?.stones ?? {}) as id (id)}
						<div class="flex min-w-0 items-center gap-2 font-semibold text-surface-100">
							<ItemIcon src={engravingIcon(id)} size="size-6" />
							<span class="min-w-0 truncate" title={engravingName(id)}>{engravingName(id)}</span>
						</div>
					{/each}
					<div class="flex items-center gap-2 border-t border-sky-700/60 pt-1 text-red-300">
						<ItemIcon src={engravingIcon(1801)} size="size-6" />
						<span>Defense Reduction <span class="text-surface-400">· penalty</span></span>
					</div>
				</div>
				<p class="shrink-0 text-amber-300">Suggestions maximize Combat Power (CP) only, not DPS.</p>
				<div class="shrink-0 border-t border-surface-700 pt-2">
					<p class="font-semibold text-surface-100">Stone combinations <span class="font-normal text-surface-400">· ranked by CP</span></p>
					<p class="mt-1 truncate" title={stoneLabel(Object.fromEntries(ids.map((id) => [id, sim.engravings[id].stone])))}>Current: <span class="text-surface-100">{stoneLabel(Object.fromEntries(ids.map((id) => [id, sim.engravings[id].stone])))}</span></p>
				</div>
				<ul class="flex min-h-0 min-w-0 flex-1 flex-col divide-y divide-surface-700 overflow-y-auto pr-2 [scrollbar-gutter:stable]" aria-label="Recommended stone combinations">
					{#each stonePicks as p (p.pattern.join('/'))}
						<li class="grid min-w-0 shrink-0 grid-cols-[4.5rem_minmax(0,1fr)_auto_auto] items-center gap-2 py-2">
							<span class="flex min-w-0 flex-col gap-1 leading-tight">
								<span class="font-bold tabular-nums" style:color={STONE_COLOR}>Lv. {p.pattern[0]} / {p.pattern[1]}</span>
								<span class="whitespace-nowrap text-[0.85em] text-surface-400 tabular-nums" title={hasStoneBonus(p.pattern) ? `+${STONE_BONUS_ATK_PCT}% basic Atk. Power` : 'Stone nodes'}>
									{STONE_LEVEL_NODES[p.pattern[0]]}/{STONE_LEVEL_NODES[p.pattern[1]]}{hasStoneBonus(p.pattern) ? ` · +${STONE_BONUS_ATK_PCT}%` : ''}
								</span>
							</span>
							<span class="min-w-0 truncate text-surface-100" title={stoneLabel(p.stones)}>{stoneLabel(p.stones)}</span>
							<Delta pct={p.pct} cp={((cpNow?.() ?? 0) * p.pct) / 100} />
							{#if isCurrent(p)}
								<span class="w-12 text-right text-surface-400">Current</span>
							{:else}
								<button type="button" class="{btn} w-12" onclick={() => withStones(sim, p.stones)}>Apply</button>
							{/if}
						</li>
					{/each}
				</ul>
				</div>
			</details>
		{/if}
	{/if}
</SimCard>
