<script lang="ts">
	import { ASTROGEM_ITEMS, ASTROGEM_KINDS } from '../game-data';
	import { coreLook, itemLook } from '../icons';
	import { simCorePoints, type SimAstrogem, type SimState } from '../simulate';
	import { ASTROGEM_OPTION_NAMES, ASTROGEM_OPTION_SHORT, CORE_BREAKPOINTS, CORE_WILLPOWER } from '../tables';
	import type { Loadout } from '../types';
	import type { CoreState } from '../upgrades';
	import ItemIcon from './ItemIcon.svelte';
	import SimCard from './SimCard.svelte';
	import { range, selectClass, type SectionDelta } from './ui';

	let {
		sim = $bindable(),
		base,
		cores,
		loadout,
		delta
	}: { sim: SimState; base: SimState; cores: CoreState[]; loadout: Loadout; delta: SectionDelta } = $props();

	const DEALER_OPTIONS = new Set([2001, 2002, 2003]);
	const rows = $derived(
		cores
			.filter((c) => !c.info.supportOnly)
			.map((c) => ({ core: c, simIndex: sim.arkGrid.findIndex((x) => x.id === c.id) }))
			.filter((r) => r.simIndex >= 0)
	);

	const kindOf = (g: SimAstrogem) => ASTROGEM_KINDS[ASTROGEM_ITEMS[g.itemId]];
	const willpowerOf = (g: SimAstrogem) => {
		const kind = kindOf(g);
		return kind ? kind.willpower - g.costReduc : null;
	};
	const optionsFor = (g: SimAstrogem) => kindOf(g)?.options ?? Object.keys(ASTROGEM_OPTION_NAMES).map(Number);
	const gemChanged = (ci: number, gi: number) =>
		JSON.stringify(sim.arkGrid[ci].gems[gi]) !== JSON.stringify(base.arkGrid[ci]?.gems[gi]);
	const reached = (points: number) => CORE_BREAKPOINTS.filter((bp) => points >= bp).at(-1);
</script>

<SimCard title="Ark Grid" {delta}>
	{#if rows.length === 0}
		<p class="text-sm text-surface-400">No ark grid cores equipped.</p>
	{:else}
		<div class="grid grid-cols-2 gap-2 max-xl:grid-cols-1">
			{#each rows as { core, simIndex } (core.id)}
				{@const look = coreLook(core.info)}
				{@const points = simCorePoints(loadout, sim, base, core.id)}
				{@const used = sim.arkGrid[simIndex].gems.reduce((s, g) => s + (willpowerOf(g) ?? 0), 0)}
				{@const cap = CORE_WILLPOWER[core.info.grade]}
				<div class="flex flex-col gap-1.5 rounded-xs bg-black/10 p-2">
					<div class="flex flex-row items-center gap-2">
						<ItemIcon src={look.icon} grade={look.grade} size="size-9" />
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="truncate text-sm font-semibold">{core.label}</span>
							<span class="text-xs text-surface-400">
								<span class={points !== core.points ? 'text-accent-300' : 'text-surface-200'}>{points}P</span>
								{#if reached(points)}· {reached(points)}P effect{/if}
								· Willpower <span class={used > cap ? 'text-red-400' : ''}>{used}/{cap}</span>
							</span>
						</div>
					</div>
					{#if used > cap}<span class="text-xs text-red-400">These astrogems need more willpower than this core has.</span>{/if}
					{#each sim.arkGrid[simIndex].gems as gem, gi (gi)}
						{@const gl = itemLook(gem.itemId)}
						{@const kind = kindOf(gem)}
						<div
							class="flex flex-row flex-wrap items-center gap-1.5 rounded-xs p-1 {gemChanged(simIndex, gi)
								? 'bg-accent-500/10 ring-1 ring-accent-500'
								: ''}"
						>
							<ItemIcon src={gl.icon} grade={gl.grade} size="size-7" title={gl.name} />
							<span class="w-20 truncate text-xs text-surface-300" title={kind?.name}>{kind?.name ?? 'Astrogem'}</span>
							<span class="text-xs text-surface-400" title="Willpower needed">{willpowerOf(gem) ?? '?'} WP</span>
							<select class={selectClass(false)} bind:value={gem.corePoints} aria-label="Core points">
								{#each range(1, 5) as p (p)}<option value={p}>{p}P</option>{/each}
							</select>
							{#each gem.opts as opt, oi (oi)}
								<span class="flex flex-row">
									<select
										class="{selectClass(false)} rounded-r-none {DEALER_OPTIONS.has(opt.id) ? '' : 'text-surface-400'}"
										bind:value={opt.id}
										aria-label={`Option ${oi + 1}`}
									>
										{#each optionsFor(gem) as id (id)}<option value={id} title={ASTROGEM_OPTION_NAMES[id]}>{ASTROGEM_OPTION_SHORT[id]}</option>{/each}
									</select>
									<select class="{selectClass(false)} -ml-px rounded-l-none" bind:value={opt.level} aria-label={`Option ${oi + 1} level`}>
										{#each range(1, 5) as lv (lv)}<option value={lv}>{lv}</option>{/each}
									</select>
								</span>
							{/each}
						</div>
					{/each}
				</div>
			{/each}
		</div>
		<p class="mt-2 text-xs text-surface-400">
			Core points and option totals add up from the astrogems. Grey options don't count for DPS Combat Power.
		</p>
	{/if}
</SimCard>
