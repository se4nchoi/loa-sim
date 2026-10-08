<script lang="ts">
	import { getContext } from 'svelte';
	import { astrogemWillpower } from '../arkgrid-optimize';
	import { formatPct } from '../format';
	import { ASTROGEM_ITEMS, ASTROGEM_KINDS } from '../game-data';
	import { coreLook, itemLook } from '../icons';
	import type { RoleTables } from '../roles';
	import { coreVariant, optionLevel, simCoreInfo, simCorePoints, type SimAstrogem, type SimState } from '../simulate';
	import { coreOptionName, supportCoreValue, swappedCoreId } from '../support';
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
	import { btn, type MenuOption, type PreviewEdit, type SectionDelta } from './ui';

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

	const role = getContext<() => RoleTables>('loa-sim:role');
	const support = $derived(role().support);
	/** Astrogem options that score for this role (dealer: Atk./Add./Boss; support: Ally Dmg / Brand / Ally Atk.). */
	const SCORING = $derived(new Set(role().astrogemOptions));
	const rows = $derived(
		cores
			.filter((c) => support || !c.info.supportOnly)
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
	// Supports: chaos options that score for supports (support table > 0 at 20P), named from the game data.
	const supportVariants = (core: CoreState) =>
		[0, 1, 2, 3, 4, 5].filter(
			(v) => v === coreVariant(core.id) || supportCoreValue(swappedCoreId(core.id, 'ancient', v), 20).value > 0
		);
	/** Short cell labels: the first word, or the last when options share their first word (Echoing Brand / Steel). */
	const shortNames = (names: string[]) => {
		const first = names.map((n) => n.split(' ')[0]);
		return names.map((n, i) => (first.filter((f) => f === first[i]).length > 1 ? n.split(' ').at(-1)! : first[i]));
	};
	// The column already says Order / Chaos.
	const typeName = (core: CoreState, info: CoreInfo, variant: number) => {
		const name = coreLabel(info).replace(/ (Order|Chaos) /, ' ');
		if (support) return `${name} · ${coreOptionName(swappedCoreId(core.id, info.grade, variant)) ?? ''}`;
		return info.attr === 'chaos' ? `${name} · ${CHAOS_OPTIONS[info.shape][variant] ?? ''}` : name;
	};
	const typeChoices = (core: CoreState): MenuOption<string>[] => {
		// Order cores keep their class option; only the grade changes.
		if (core.info.attr === 'order') return GRADES.map((g) => ({ value: `${g}:${coreVariant(core.id)}`, label: GRADE_NAME[g] }));
		const variants = support ? supportVariants(core) : CHAOS_OPTIONS[core.info.shape].map((_, v) => v);
		const names = variants.map((v) =>
			support ? (coreOptionName(swappedCoreId(core.id, core.info.grade, v)) ?? `Option ${v}`) : CHAOS_OPTIONS[core.info.shape][v]
		);
		const labels = shortNames(names);
		return GRADES.flatMap((g) => variants.map((v, i) => ({ value: `${g}:${v}`, label: labels[i], row: GRADE_NAME[g] })));
	};
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
	// An astrogem's two options are different types, so the other option's type isn't offered.
	const optionChoices = (g: SimAstrogem, oi: number): MenuOption<string>[] =>
		(kindOf(g)?.options ?? [2001, 2002, 2003])
			.filter((id) => !g.opts.some((o, j) => j !== oi && o.id === id))
			.flatMap((id) =>
				[1, 2, 3, 4, 5].map((lv) => ({ value: `${id}:${lv}`, label: String(lv), row: ASTROGEM_OPTION_NAMES[id], muted: !SCORING.has(id) }))
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

	/** Total level of every astrogem option across the grid; the ones that score for this role first. */
	const totals = $derived(
		[2001, 2002, 2003, 2011, 2012, 2013]
			.map((id) => ({ id, now: optionLevel(sim.arkGrid, id), before: optionLevel(base.arkGrid, id), scoring: SCORING.has(id) }))
			.sort((a, b) => Number(b.scoring) - Number(a.scoring))
	);

	// What one more core point / option level is worth from the current state. A probe astrogem carries only
	// the points or levels, so the preview isolates them.
	const probe = (core: SimState['arkGrid'][number], corePoints: number, opts: { id: number; level: number }[] = []) =>
		core.gems.push({ itemId: core.gems[0]?.itemId ?? 0, corePoints, costReduc: 0, opts });
	const GRADE_CAP: Record<CoreGrade, number> = { heroic: 10, legendary: 14, relic: 20, ancient: 20 };
	function pointValue(ci: number, points: number, grade: CoreGrade) {
		const next = CORE_BREAKPOINTS.find((bp) => bp > points && bp <= GRADE_CAP[grade]);
		return {
			one: points < 20 ? preview((s) => probe(s.arkGrid[ci], 1)) : null,
			next: next ? { at: next, pct: preview((s) => probe(s.arkGrid[ci], next - points)) } : null
		};
	}
	/** +1 level of an option, averaged over the next 5 (values round down per level, like Next Upgrades). */
	const levelValue = (id: number) => (rows.length ? preview((s) => probe(s.arkGrid[rows[0].ci], 0, [{ id, level: 5 }])) / 5 : 0);
	const small = (pct: number) => formatPct(pct, Math.abs(pct) < 0.1 && pct !== 0 ? 3 : 2);
</script>

<SimCard
	title="Ark Grid"
	{delta}
	info={`Core points and option totals add up from the astrogems. Click a core's name to try another grade or chaos option. Greyed options don't count for ${support ? 'support' : 'DPS'} Combat Power.`}
>
	{#snippet actions()}
		<button type="button" class={btn} onclick={() => (sim.arkGrid = structuredClone($state.snapshot(base.arkGrid)))}>Reset</button>
	{/snippet}
	{#if rows.length === 0}
		<p class="text-sm text-surface-400">No ark grid cores equipped.</p>
	{:else}
		<div class="mb-3 flex flex-row flex-wrap gap-1.5" aria-label="Astrogem option totals">
			{#each totals as t (t.id)}
				<span
					class="rounded-xs border px-2 py-1 text-xs {t.scoring ? 'border-surface-600 bg-surface-800 text-surface-100' : 'border-surface-800 text-surface-500'}"
					title={t.scoring ? `${ASTROGEM_OPTION_NAMES[t.id]}: total across all astrogems` : `${ASTROGEM_OPTION_NAMES[t.id]}: doesn't count for ${support ? 'support' : 'DPS'} Combat Power`}
				>
					{ASTROGEM_OPTION_SHORT[t.id]}
					<b class="tabular-nums {t.now !== t.before ? 'text-accent-300' : t.scoring ? 'text-surface-50' : ''}">
						Lv. {#if t.now !== t.before}{`${t.before} → `}{/if}{t.now}
					</b>
				</span>
				{#if t.scoring}
					<span
						class="-ml-1 rounded-xs border border-green-900 bg-green-950/40 px-2 py-1 text-xs text-green-400 tabular-nums"
						title={`${ASTROGEM_OPTION_NAMES[t.id]}: Combat Power from one more level (average of the next 5)`}
					>
						+1 Lv ≈ {small(levelValue(t.id))}%
					</span>
				{/if}
			{/each}
		</div>
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
							{@const pv = pointValue(ci, points, info.grade)}
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
												<span class="min-w-0 truncate text-left text-sm font-semibold" title={typeName(core, info, variantOf(ci))}>{typeName(core, info, variantOf(ci))}</span>
											{/snippet}
										</MenuPicker>
										<span class="flex flex-row flex-wrap items-center gap-x-1.5 text-xs text-surface-400">
											<b class={points !== core.points ? 'text-accent-300' : 'text-surface-100'}>{points}P</b>
											{#if reached(points)}<span>· {reached(points)}P effect</span>{/if}
											{#if pv.one !== null}
												<span class="tabular-nums" title="Combat Power from one more core point">
													· +1P <span class={pv.one > 0.0005 ? 'text-green-400' : ''}>{small(pv.one)}%</span>
												</span>
											{/if}
											{#if pv.next && pv.next.at !== points + 1}
												<span class="tabular-nums" title={`Combat Power at the next breakpoint (${pv.next.at}P)`}>
													· {pv.next.at}P <span class="text-green-400">{small(pv.next.pct)}%</span>
												</span>
											{/if}
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
														options={optionChoices(gem, oi)}
														label={`Option ${oi + 1}`}
														changed={before?.opts[oi]?.id !== opt.id || before?.opts[oi]?.level !== opt.level}
														onpick={(v) => (gem.opts[oi] = decode(v))}
														preview={(v) => preview((s) => (s.arkGrid[ci].gems[gi].opts[oi] = decode(v)))}
														align={oi === 1 ? 'right' : 'left'}
													>
														{#snippet trigger()}
															<span class="w-[5.25rem] truncate text-left text-xs @max-[20rem]:w-[4.5rem] {SCORING.has(opt.id) ? '' : 'text-surface-400'}" title={ASTROGEM_OPTION_NAMES[opt.id]}>
																{ASTROGEM_OPTION_SHORT[opt.id]} <b class="text-surface-50">{opt.level}</b>
															</span>
														{/snippet}
													</MenuPicker>
												{/each}
												{#if before && JSON.stringify(gem) !== JSON.stringify(before)}
													<button
														type="button"
														class="{btn} px-2"
														aria-label={`Reset ${kind?.name ?? 'astrogem'} ${gi + 1}`}
														onclick={() => (sim.arkGrid[ci].gems[gi] = structuredClone($state.snapshot(before)))}
													>
														Reset
													</button>
												{/if}
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
