<script lang="ts">
	import { ASTROGEM_ITEMS, ASTROGEM_KINDS } from '../game-data';
	import { coreLook, itemLook } from '../icons';
	import { simCorePoints, type SimAstrogem, type SimState } from '../simulate';
	import { ASTROGEM_OPTION_NAMES, ASTROGEM_OPTION_SHORT, CORE_BREAKPOINTS, CORE_WILLPOWER } from '../tables';
	import type { Loadout } from '../types';
	import type { CoreState } from '../upgrades';
	import ItemIcon from './ItemIcon.svelte';
	import MenuPicker from './MenuPicker.svelte';
	import SimCard from './SimCard.svelte';
	import { type MenuOption, type PreviewEdit, type SectionDelta } from './ui';

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
	const willpowerOf = (g: SimAstrogem) => {
		const kind = kindOf(g);
		return kind ? kind.willpower - g.costReduc : 0;
	};
	const reached = (points: number) => CORE_BREAKPOINTS.filter((bp) => points >= bp).at(-1);

	// One option picker = type × level grid, so a single click sets both. Value encodes "id:level".
	const optionChoices = (g: SimAstrogem): MenuOption<string>[] =>
		(kindOf(g)?.options ?? [2001, 2002, 2003]).flatMap((id) =>
			[1, 2, 3, 4, 5].map((lv) => ({
				value: `${id}:${lv}`,
				label: `${ASTROGEM_OPTION_SHORT[id]} ${lv}`,
				muted: !DEALER_OPTIONS.has(id)
			}))
		);
	const POINTS: MenuOption<number>[] = [1, 2, 3, 4, 5].map((p) => ({ value: p, label: `${p}P` }));
	const decode = (v: string) => {
		const [id, level] = v.split(':').map(Number);
		return { id, level };
	};
</script>

<SimCard title="Ark Grid" {delta}>
	{#if rows.length === 0}
		<p class="text-sm text-surface-400">No ark grid cores equipped.</p>
	{:else}
		<div class="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
			{#each columns as col (col.title)}
				<div class="flex flex-col gap-2">
					<span class="text-xs font-semibold tracking-wide uppercase max-sm:text-center {col.title === 'Order' ? 'text-amber-300' : 'text-sky-300'}">{col.title}</span>
					{#each col.rows as { core, ci } (core.id)}
						{@const look = coreLook(core.info)}
						{@const points = simCorePoints(loadout, sim, base, core.id)}
						{@const used = sim.arkGrid[ci].gems.reduce((s, g) => s + willpowerOf(g), 0)}
						{@const cap = CORE_WILLPOWER[core.info.grade]}
						<div class="flex flex-col gap-1 rounded-xs bg-black/15 p-2">
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
								<div class="flex flex-row flex-wrap items-center gap-1.5 max-sm:justify-center">
									<ItemIcon src={gl.icon} grade={gl.grade} size="size-7" title={`${gl.name} · ${willpowerOf(gem)} willpower`} />
									<span class="w-16 truncate text-[11px] text-surface-400" title={kindOf(gem)?.name}>{kindOf(gem)?.name ?? 'Astrogem'} · {willpowerOf(gem)}</span>
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
											columns={5}
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
								</div>
							{/each}
							{#if used > cap}<span class="text-xs text-red-400">These astrogems need more willpower than this core has.</span>{/if}
						</div>
					{/each}
				</div>
			{/each}
		</div>
		<p class="mt-2 text-xs text-surface-400">
			Core points and option totals add up from the astrogems. Grey options don't count for DPS Combat Power. The number
			after an astrogem's kind is its willpower.
		</p>
	{/if}
</SimCard>
