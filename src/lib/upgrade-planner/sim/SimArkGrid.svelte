<script lang="ts">
	import { astrogemWillpower, optimizeArkGrid, withArrangement, type Arrangement } from '../arkgrid-optimize';
	import { formatPct } from '../format';
	import { ASTROGEM_ITEMS, ASTROGEM_KINDS } from '../game-data';
	import { coreLook, itemLook } from '../icons';
	import { simCorePoints, type SimAstrogem, type SimState } from '../simulate';
	import { ASTROGEM_OPTION_NAMES, ASTROGEM_OPTION_SHORT, CORE_BREAKPOINTS, CORE_WILLPOWER } from '../tables';
	import type { Loadout } from '../types';
	import type { CoreState } from '../upgrades';
	import ItemIcon from './ItemIcon.svelte';
	import MenuPicker from './MenuPicker.svelte';
	import SimCard from './SimCard.svelte';
	import { btn, btnAccent, type MenuOption, type PreviewEdit, type SectionDelta } from './ui';

	let {
		sim = $bindable(),
		base,
		cores,
		loadout,
		delta,
		preview
	}: {
		sim: SimState;
		base: SimState;
		cores: CoreState[];
		loadout: Loadout;
		delta: SectionDelta;
		preview: PreviewEdit;
	} = $props();

	const DEALER_OPTIONS = new Set([2001, 2002, 2003]);
	const rows = $derived(
		cores
			.filter((c) => !c.info.supportOnly)
			.map((c) => ({ core: c, ci: sim.arkGrid.findIndex((x) => x.id === c.id) }))
			.filter((r) => r.ci >= 0)
	);
	const columns = $derived([
		{ title: 'Order', rows: rows.filter((r) => r.core.info.attr === 'order') },
		{ title: 'Chaos', rows: rows.filter((r) => r.core.info.attr === 'chaos') }
	]);

	const kindOf = (g: SimAstrogem) => ASTROGEM_KINDS[ASTROGEM_ITEMS[g.itemId]];
	const reached = (points: number) => CORE_BREAKPOINTS.filter((bp) => points >= bp).at(-1);

	// Option picker: one row per option type, levels 1–5 as cells. Value encodes "id:level".
	const optionChoices = (g: SimAstrogem): MenuOption<string>[] =>
		(kindOf(g)?.options ?? [2001, 2002, 2003]).flatMap((id) =>
			[1, 2, 3, 4, 5].map((lv) => ({ value: `${id}:${lv}`, label: String(lv), row: ASTROGEM_OPTION_NAMES[id], muted: !DEALER_OPTIONS.has(id) }))
		);
	const POINTS: MenuOption<number>[] = [1, 2, 3, 4, 5].map((p) => ({ value: p, label: `${p}P` }));
	const decode = (v: string) => {
		const [id, level] = v.split(':').map(Number);
		return { id, level };
	};

	/** What each astrogem's options add right now; the lowest one is flagged as the first to replace. */
	const weakest = $derived.by(() => {
		let worst: { ci: number; gi: number; pct: number } | null = null;
		for (const { ci } of rows)
			sim.arkGrid[ci].gems.forEach((_, gi) => {
				const pct = -preview((s) => (s.arkGrid[ci].gems[gi].opts = []));
				if (!worst || pct < worst.pct) worst = { ci, gi, pct };
			});
		return worst as { ci: number; gi: number; pct: number } | null;
	});

	// Optimizer
	let suggestion = $state<{ arrangement: Arrangement; gainPct: number; moved: number } | null>(null);
	function optimize() {
		const current = $state.snapshot(sim) as SimState;
		const arrangement = optimizeArkGrid(loadout, current, base);
		const gainPct = preview((s) => Object.assign(s, withArrangement(s, arrangement)));
		const moved = current.arkGrid.reduce(
			(n, c) => n + c.gems.filter((g) => !(arrangement.cores[c.id] ?? []).some((x) => JSON.stringify(x) === JSON.stringify(g))).length,
			0
		);
		suggestion = { arrangement, gainPct, moved };
	}
	function apply() {
		if (!suggestion) return;
		sim.arkGrid = withArrangement($state.snapshot(sim) as SimState, suggestion.arrangement).arkGrid;
		suggestion = null;
	}
</script>

<SimCard title="Ark Grid" {delta} info="Core points and option totals add up from the astrogems. Greyed options don't count for DPS Combat Power.">
	{#snippet actions()}
		<button type="button" class={btn} onclick={optimize} title="Find the best placement of your equipped astrogems for Combat Power">
			Optimize arrangement
		</button>
		<button type="button" class={btn} onclick={() => ((sim.arkGrid = structuredClone($state.snapshot(base.arkGrid))), (suggestion = null))}>Reset</button>
	{/snippet}
	{#if rows.length === 0}
		<p class="text-sm text-surface-400">No ark grid cores equipped.</p>
	{:else}
		{#if suggestion}
			<div class="mb-3 flex flex-row flex-wrap items-center gap-2 rounded-xs border border-accent-700 bg-accent-700/15 px-3 py-2 text-sm">
				{#if suggestion.gainPct > 0.0005}
					<span>
						Best arrangement: <b class="text-green-400">{formatPct(suggestion.gainPct)}%</b> CP, moving {suggestion.moved} astrogem{suggestion.moved === 1 ? '' : 's'}.
					</span>
					{#if suggestion.arrangement.leftOut.length}
						<span class="text-amber-300">{suggestion.arrangement.leftOut.length} don't fit (willpower) and are left out.</span>
					{/if}
					<button type="button" class="{btnAccent} ml-auto" onclick={apply}>Apply</button>
				{:else}
					<span class="text-surface-200">Already the best arrangement for Combat Power.</span>
				{/if}
				<button type="button" class="{btn} {suggestion.gainPct > 0.0005 ? '' : 'ml-auto'}" onclick={() => (suggestion = null)}>Dismiss</button>
			</div>
		{/if}
		<div class="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
			{#each columns as col (col.title)}
				<div class="flex flex-col gap-2">
					<span class="text-xs font-semibold tracking-wide uppercase max-sm:text-center {col.title === 'Order' ? 'text-amber-300' : 'text-sky-300'}">{col.title}</span>
					{#each col.rows as { core, ci } (core.id)}
						{@const look = coreLook(core.info)}
						{@const points = simCorePoints(loadout, sim, base, core.id)}
						{@const used = sim.arkGrid[ci].gems.reduce((s, g) => s + astrogemWillpower(g), 0)}
						{@const cap = CORE_WILLPOWER[core.info.grade]}
						<div class="flex flex-col gap-1 rounded-xs bg-black/15 p-2.5">
							<div class="flex flex-row items-center gap-2 pb-1 max-sm:justify-center">
								<ItemIcon src={look.icon} grade={look.grade} size="size-9" />
								<div class="flex min-w-0 flex-1 flex-col max-sm:flex-none">
									<span class="truncate text-sm font-semibold">{core.label}</span>
									<span class="text-xs text-surface-400">
										<b class={points !== core.points ? 'text-accent-300' : 'text-surface-100'}>{points}P</b>
										{#if reached(points)}· {reached(points)}P effect{/if}
									</span>
								</div>
								<span class="rounded-xs px-1.5 py-0.5 text-xs tabular-nums {used > cap ? 'bg-red-500/20 text-red-300' : 'bg-surface-800 text-surface-300'}" title="Willpower used / available">
									WP {used}/{cap}
								</span>
							</div>
							{#each sim.arkGrid[ci].gems as gem, gi (gi)}
								{@const gl = itemLook(gem.itemId)}
								{@const before = base.arkGrid[ci]?.gems[gi]}
								{@const isWeakest = weakest?.ci === ci && weakest?.gi === gi}
								<div
									class="flex flex-row flex-wrap items-center gap-1.5 rounded-xs p-0.5 max-sm:justify-center {isWeakest ? 'bg-amber-500/10 ring-1 ring-amber-400/70' : ''}"
									title={isWeakest ? `Weakest astrogem: its options add ${formatPct(weakest!.pct)}% CP` : undefined}
								>
									<ItemIcon src={gl.icon} grade={gl.grade} size="size-7" title={`${kindOf(gem)?.name ?? 'Astrogem'} · ${astrogemWillpower(gem)} willpower`} />
									<span class="w-8 rounded-xs bg-surface-800 py-0.5 text-center text-[11px] tabular-nums text-surface-300" title="Willpower">{astrogemWillpower(gem)} WP</span>
									<MenuPicker
										value={gem.corePoints}
										options={POINTS}
										columns={5}
										label="Core points"
										changed={before?.corePoints !== gem.corePoints}
										onpick={(v) => (gem.corePoints = v)}
										preview={(v) => preview((s) => (s.arkGrid[ci].gems[gi].corePoints = v))}
									>
										{#snippet trigger()}<span class="w-6 font-semibold tabular-nums">{gem.corePoints}P</span>{/snippet}
									</MenuPicker>
									{#each gem.opts as opt, oi (oi)}
										<MenuPicker
											value={`${opt.id}:${opt.level}`}
											options={optionChoices(gem)}
											label={`Option ${oi + 1}`}
											changed={before?.opts[oi]?.id !== opt.id || before?.opts[oi]?.level !== opt.level}
											onpick={(v) => (gem.opts[oi] = decode(v))}
											preview={(v) => preview((s) => (s.arkGrid[ci].gems[gi].opts[oi] = decode(v)))}
											align={oi === 1 ? 'right' : 'left'}
										>
											{#snippet trigger()}
												<span class="w-[5.25rem] truncate text-left text-xs {DEALER_OPTIONS.has(opt.id) ? '' : 'text-surface-400'}" title={ASTROGEM_OPTION_NAMES[opt.id]}>
													{ASTROGEM_OPTION_SHORT[opt.id]} <b class="text-surface-50">{opt.level}</b>
												</span>
											{/snippet}
										</MenuPicker>
									{/each}
									{#if isWeakest}<span class="text-[11px] font-semibold text-amber-300">weakest</span>{/if}
								</div>
							{/each}
							{#if used > cap}<span class="text-xs text-red-400">These astrogems need more willpower than this core has.</span>{/if}
						</div>
					{/each}
				</div>
			{/each}
		</div>
	{/if}
</SimCard>
