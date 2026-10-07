<script lang="ts">
	import { engravingIcon } from '../icons';
	import type { SimState } from '../simulate';
	import { ENGRAVING_BOOK_STEPS, ENGRAVING_NAMES } from '../tables';
	import Glyph from './Glyph.svelte';
	import ItemIcon from './ItemIcon.svelte';
	import MenuPicker from './MenuPicker.svelte';
	import SimCard from './SimCard.svelte';
	import { RELIC_COLOR, STONE_COLOR, type MenuOption, type PreviewEdit, type SectionDelta } from './ui';

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
	const STONE: MenuOption<number>[] = [0, 1, 2, 3, 4].map((lv) => ({
		value: lv,
		label: lv === 0 ? 'No stone level' : `Lv. ${lv}`,
		glyph: 'stone',
		color: lv > 0 ? STONE_COLOR : undefined,
		muted: lv === 0
	}));
</script>

<SimCard title="Engravings" {delta}>
	{#if ids.length === 0}
		<p class="text-sm text-surface-400">No supported engravings found.</p>
	{:else}
		<div class="flex flex-col divide-y divide-neutral-950">
			{#each ids as id (id)}
				{@const e = sim.engravings[id]}
				{@const b = base.engravings[id]}
				<div class="flex flex-row flex-wrap items-center gap-x-2.5 gap-y-1.5 py-1.5 first:pt-0 last:pb-0">
					<ItemIcon src={engravingIcon(id)} grade={5} size="size-8" />
					<span class="min-w-24 flex-1 text-sm font-semibold">{ENGRAVING_NAMES[id] ?? id}</span>
					<MenuPicker
						value={e.books}
						options={BOOKS}
						label={`${ENGRAVING_NAMES[id]} relic engraving level`}
						changed={e.books !== b.books}
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
						label={`${ENGRAVING_NAMES[id]} ability stone level`}
						changed={e.stone !== b.stone}
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
		</div>
		{#if stoned > 2}
			<p class="mt-2 text-xs text-amber-300">An ability stone carries at most two engravings ({stoned} set).</p>
		{/if}
	{/if}
</SimCard>
