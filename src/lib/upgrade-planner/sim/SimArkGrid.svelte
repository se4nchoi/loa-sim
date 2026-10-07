<script lang="ts">
	import { astrogemWillpower, optimizeArkGrid, withArrangement, type Arrangement } from '../arkgrid-optimize';
	import { formatPct } from '../format';
	import { ASTROGEM_ITEMS, ASTROGEM_KINDS } from '../game-data';
	import { coreLook, itemLook } from '../icons';
	import { coreVariant, simCoreInfo, simCorePoints, type SimAstrogem, type SimState } from '../simulate';
	import {
		ASTROGEM_OPTION_NAMES,
		ASTROGEM_OPTION_SHORT,
		CORE_BREAKPOINTS,
		CORE_WILLPOWER,
		type CoreGrade,
		type CoreInfo
	} from '../tables';
	import type { Loadout } from '../types';
	import { coreLabel, type CoreState } from '../upgrades';
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
		{ title: 'Order', rows: byShape(rows.filter((r) => r.core.info.attr === 'order')) },
		{ title: 'Chaos', rows: byShape(rows.filter((r) => r.core.info.attr === 'chaos')) }
	]);

	function byShape<T extends { core: CoreState }>(list: T[]) {
		return list.toSorted((a, b) => SHAPE_ORDER.indexOf(a.core.info.shape) - SHAPE_ORDER.indexOf(b.core.info.shape));
	}

	const kindOf = (g: SimAstrogem) => ASTROGEM_KINDS[ASTROGEM_ITEMS[g.itemId]];
	const reached = (points: number) => CORE_BREAKPOINTS.filter((bp) => points >= bp).at(-1);

	// Core type picker: another grade, and for chaos cores another option (Swift → Flashy, Absorbing → Crushing,
	// Weapon → Attack). Sun and moon have three dealer options (the second and third share a curve), star two.
	const GRADES: CoreGrade[] = ['ancient', 'relic', 'legendary', 'heroic'];
	const GRADE_NAME: Record<CoreGrade, string> = { ancient: 'Ancient', relic: 'Relic', legendary: 'Legendary', heroic: 'Heroic' };
	/** Chaos options per shape, by the id's variant digit. */
	const CHAOS_OPTIONS: Record<CoreInfo['shape'], string[]> = {
		sun: ['Flashy Attack', 'Stable Attack', 'Swift Attack'],
		moon: ['Smoldering Strike', 'Absorbing Strike', 'Crushing Strike'],
		star: ['Attack', 'Weapon']
	};
	const SHAPE_ORDER: CoreInfo['shape'][] = ['sun', 'moon', 'star'];
	const variantOf = (ci: number) => sim.arkGrid[ci].variant ?? coreVariant(sim.arkGrid[ci].id);
	// The column already says Order / Chaos.
	const typeName = (info: CoreInfo, variant: number) => {
		const name = coreLabel(info).replace(/ (Order|Chaos) /, ' ');
		return info.attr === 'chaos' ? `${name} · ${CHAOS_OPTIONS[info.shape][variant] ?? ''}` : name;
	};
	const typeChoices = (core: CoreState): MenuOption<string>[] =>
		core.info.attr === 'chaos'
			? GRADES.flatMap((g) =>
					CHAOS_OPTIONS[core.info.shape].map((name, v) => ({ value: `${g}:${v}`, label: name.split(' ')[0], row: GRADE_NAME[g] }))
				)
			: GRADES.map((g) => ({ value: `${g}:0`, label: GRADE_NAME[g] }));
	const decodeType = (v: string) => {
		const [grade, variant] = v.split(':');
		return { grade: grade as CoreGrade, variant: Number(variant) };
	};
	function setType(ci: number, v: string) {
		const { grade, variant } = decodeType(v);
		const core = sim.arkGrid[ci];
		const orig = cores.find((c) => c.id === core.id)!.info;
		core.grade = grade === orig.grade ? undefined : grade;
		core.variant = variant === coreVariant(core.id) ? undefined : variant;
	}

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

<SimCard
	title="Ark Grid"
	{delta}
	info="Core points and option totals add up from the astrogems. Click a core's name to try another grade or chaos option. Greyed options don't count for DPS Combat Power."
>
	{#snippet actions()}
		<button type="button" class={btn} onclick={optimize} title="Moves your equipped astrogems between cores for the most Combat Power. bible doesn't show unequipped astrogems, so only the equipped ones are considered.">
			Optimize placement
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
					<span class="text-surface-200">
						Your equipped astrogems are already in their best cores. Only equipped astrogems are considered, so this mostly helps
						after you edit core points or swap a core.
					</span>
				{/if}
				<button type="button" class="{btn} {suggestion.gainPct > 0.0005 ? '' : 'ml-auto'}" onclick={() => (suggestion = null)}>Dismiss</button>
			</div>
		{/if}
		<!-- Two columns only when the card itself is wide enough (a container query), so rows never crunch. -->
		<div class="@container">
			<div class="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
				{#each columns as col (col.title)}
					<div class="flex flex-col gap-2">
						<span class="text-xs font-semibold tracking-wide uppercase {col.title === 'Order' ? 'text-amber-300' : 'text-sky-300'}">{col.title}</span>
						{#each col.rows as { core, ci } (core.id)}
							{@const info = simCoreInfo(core.info, sim.arkGrid[ci])}
							{@const look = coreLook(info)}
							{@const points = simCorePoints(loadout, sim, base, core.id)}
							{@const used = sim.arkGrid[ci].gems.reduce((s, g) => s + astrogemWillpower(g), 0)}
							{@const cap = CORE_WILLPOWER[info.grade]}
							<div class="@container flex flex-col gap-1.5 rounded-xs bg-black/15 p-2.5">
								<div class="flex flex-row items-center gap-2 pb-1">
									<ItemIcon src={look.icon} grade={look.grade} size="size-9" />
									<div class="flex min-w-0 flex-1 flex-col items-start gap-0.5">
										<MenuPicker
											value={`${info.grade}:${variantOf(ci)}`}
											options={typeChoices(core)}
											label="Core type"
											changed={info.grade !== core.info.grade || variantOf(ci) !== coreVariant(core.id)}
											onpick={(v) => setType(ci, v)}
											preview={(v) => preview((s) => Object.assign(s.arkGrid[ci], decodeType(v)))}
										>
											{#snippet trigger()}
												<span class="min-w-0 truncate text-left text-sm font-semibold" title={typeName(info, variantOf(ci))}>{typeName(info, variantOf(ci))}</span>
											{/snippet}
										</MenuPicker>
										<span class="flex flex-row flex-wrap items-center gap-x-1.5 text-xs text-surface-400">
											<b class={points !== core.points ? 'text-accent-300' : 'text-surface-100'}>{points}P</b>
											{#if reached(points)}<span>· {reached(points)}P effect</span>{/if}
											<span
												class="rounded-xs px-1.5 tabular-nums {used > cap ? 'bg-red-500/20 text-red-300' : 'bg-surface-800 text-surface-300'}"
												title="Willpower used / available"
											>
												WP {used}/{cap}
											</span>
										</span>
									</div>
								</div>
								{#each sim.arkGrid[ci].gems as gem, gi (gi)}
									{@const gl = itemLook(gem.itemId)}
									{@const kind = kindOf(gem)}
									{@const before = base.arkGrid[ci]?.gems[gi]}
									{@const isWeakest = weakest?.ci === ci && weakest?.gi === gi}
									<div
										class="flex w-fit max-w-full flex-row items-center gap-2 rounded-xs p-1 {isWeakest ? 'bg-amber-500/10 ring-1 ring-amber-400/70' : ''}"
										title={isWeakest ? `Weakest astrogem: its options add ${formatPct(weakest!.pct)}% CP` : undefined}
									>
										<!-- Narrow cores (small phones) drop the icon; the kind name stays. -->
										<div class="@max-[20rem]:hidden">
											<ItemIcon src={gl.icon} grade={gl.grade} size="size-9" title={`${kind?.name ?? 'Astrogem'} · ${astrogemWillpower(gem)} willpower`} />
										</div>
										<div class="flex min-w-0 flex-col gap-1">
											<span class="flex flex-row items-baseline gap-1.5 text-xs">
												<span class="font-semibold {info.attr === 'order' ? 'text-amber-200' : 'text-sky-200'}">{kind?.name ?? 'Astrogem'}</span>
												<span class="text-surface-400 tabular-nums" title="Willpower">{astrogemWillpower(gem)} WP</span>
												{#if isWeakest}<span class="font-semibold text-amber-300">· weakest</span>{/if}
											</span>
											<div class="flex flex-row flex-wrap items-center gap-1">
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
															<span class="w-[5.25rem] truncate text-left text-xs @max-[20rem]:w-[4.5rem] {DEALER_OPTIONS.has(opt.id) ? '' : 'text-surface-400'}" title={ASTROGEM_OPTION_NAMES[opt.id]}>
																{ASTROGEM_OPTION_SHORT[opt.id]} <b class="text-surface-50">{opt.level}</b>
															</span>
														{/snippet}
													</MenuPicker>
												{/each}
											</div>
										</div>
									</div>
								{/each}
								{#if used > cap}<span class="text-xs text-red-400">These astrogems need more willpower than this core has.</span>{/if}
							</div>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	{/if}
</SimCard>
