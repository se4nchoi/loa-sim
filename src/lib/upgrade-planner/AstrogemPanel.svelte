<script lang="ts">
	import { formatCp, formatPct } from './format';
	import { ASTROGEM_OPTION_NAMES, AstrogemOption, CORE_BREAKPOINTS } from './tables';
	import type { Loadout } from './types';
	import { astrogemOptionGain, astrogemTotals, coreStates, coreValueAt, evaluateAstrogemSwap, weaponPowerOf } from './upgrades';

	let { loadout, cp }: { loadout: Loadout; cp: number } = $props();

	const cores = $derived(coreStates(loadout).filter((c) => !c.info.supportOnly));
	const totals = $derived(astrogemTotals(loadout));
	const wp = $derived(weaponPowerOf(loadout));
	const dealerOptions = [AstrogemOption.BossDamage, AstrogemOption.AdditionalDamage, AstrogemOption.Attack];
	const perLevel = $derived(dealerOptions.map((id) => ({ id, pct: astrogemOptionGain(totals, id, 5) / 5 })));

	/**
	 * What an equipped astrogem's options add (CP lost if they were gone). Core points are left out:
	 * removing any gem usually drops its core below a breakpoint, which would make every gem look alike.
	 */
	const contribution = (coreIndex: number, gemIdx: number) =>
		-(evaluateAstrogemSwap(loadout, coreIndex, gemIdx, { corePoints: 0, opts: [] })?.optionGainPct ?? 0);
	const weakest = $derived.by(() => {
		let best: { core: number; gem: number; pct: number } | null = null;
		for (const c of cores)
			for (const g of c.gems) {
				const pct = contribution(c.index, g.idx);
				if (!best || pct < best.pct) best = { core: c.index, gem: g.idx, pct };
			}
		return best;
	});
	const nextBreakpoint = (points: number) => CORE_BREAKPOINTS.find((bp) => bp > points);

	// Evaluator form
	let coreIndex = $state(-1);
	let replaceIdx = $state<string>('');
	let points = $state(5);
	let optA = $state<number>(AstrogemOption.BossDamage);
	let lvlA = $state(5);
	let optB = $state<number>(AstrogemOption.AdditionalDamage);
	let lvlB = $state(5);

	$effect.pre(() => {
		if (coreIndex === -1 && cores.length) coreIndex = cores[0].index;
	});
	const selectedCore = $derived(cores.find((c) => c.index === coreIndex));
	const result = $derived(
		selectedCore
			? evaluateAstrogemSwap(loadout, coreIndex, replaceIdx === '' ? null : Number(replaceIdx), {
					corePoints: points,
					opts: [
						{ id: optA, level: lvlA },
						{ id: optB, level: lvlB }
					]
				})
			: null
	);

	const gemLabel = (g: { corePoints: number; opts: { id: number; level: number }[] }) =>
		`${g.corePoints}P · ${g.opts.map((o) => `${ASTROGEM_OPTION_NAMES[o.id] ?? o.id} Lv. ${o.level}`).join(' · ')}`;
	const selectClass =
		'rounded-xs border border-surface-700 bg-surface-950 px-2 py-0.5 text-sm text-surface-100 focus:border-accent-500 focus:outline-none';
</script>

<span class="text-lg font-semibold">Astrogems</span>
<span class="text-sm text-surface-300">
	Astrogem options add up across every equipped astrogem; core points only count inside their own core.
</span>

<span class="mt-3 text-sm font-semibold">One option level is worth</span>
<div class="grid grid-cols-[1fr_max-content]">
	{#each perLevel as o (o.id)}
		<div class="col-span-full grid grid-cols-subgrid transition duration-75 hover:bg-black/20">
			<div class="mr-2 text-sm text-surface-300">{ASTROGEM_OPTION_NAMES[o.id]} (total Lv. {totals.levels[o.id]})</div>
			<div class="text-right text-sm text-green-400">{formatPct(o.pct, 3)}%</div>
		</div>
	{/each}
	<div class="col-span-full grid grid-cols-subgrid transition duration-75 hover:bg-black/20">
		<div class="mr-2 text-sm text-surface-300">Ally / Brand options</div>
		<div class="text-right text-sm text-surface-500">+0.000%</div>
	</div>
</div>

<span class="mt-3 text-sm font-semibold">Cores</span>
<span class="text-xs text-surface-400">Each astrogem shows what its two options add. Core points are shown separately.</span>
{#each cores as c (c.id)}
	{@const next = nextBreakpoint(c.points)}
	<div class="mt-1 rounded-xs bg-black/10 p-2">
		<div class="flex flex-row items-baseline justify-between gap-2">
			<span class="text-sm text-surface-100">{c.label} · <span class="text-surface-300">{c.points}P</span></span>
			<span class="text-sm text-green-400">+{(c.value / 100).toFixed(2)}%</span>
		</div>
		{#if next && next <= 20 && c.info.grade !== 'heroic' && !(c.info.grade === 'legendary' && next > 14)}
			<div class="text-xs text-surface-400">
				{next}P would add {formatPct((((1e4 + coreValueAt(c, next, wp)) / (1e4 + c.value)) - 1) * 100)}% (needs {next - c.points} more point{next - c.points > 1 ? 's' : ''})
			</div>
		{/if}
		<div class="mt-1 grid grid-cols-[1fr_max-content]">
			{#each c.gems.toSorted((a, b) => a.idx - b.idx) as g (g.idx)}
				{@const isWeakest = weakest?.core === c.index && weakest?.gem === g.idx}
				<div class="col-span-full grid grid-cols-subgrid transition duration-75 hover:bg-black/20" title="Value of this astrogem's options">
					<div class="mr-2 text-xs {isWeakest ? 'text-amber-300' : 'text-surface-300'}">
						{gemLabel(g)}{#if isWeakest}<span class="ml-1">(weakest options)</span>{/if}
					</div>
					<div class="text-right text-xs text-surface-200">{formatPct(contribution(c.index, g.idx))}%</div>
				</div>
			{/each}
		</div>
	</div>
{/each}

<span class="mt-4 text-sm font-semibold">Evaluate an astrogem</span>
<span class="text-xs text-surface-400">
	Enter a gem you own or are cutting towards. Willpower isn't checked, so make sure the core can still hold it.
</span>
<div class="mt-1 grid grid-cols-[max-content_1fr] items-center gap-x-3 gap-y-1.5">
	<label class="text-sm text-surface-300" for="ag-core">Core</label>
	<select id="ag-core" class={selectClass} bind:value={coreIndex} onchange={() => (replaceIdx = '')}>
		{#each cores as c (c.id)}<option value={c.index}>{c.label} ({c.points}P)</option>{/each}
	</select>
	<label class="text-sm text-surface-300" for="ag-replace">Replaces</label>
	<select id="ag-replace" class={selectClass} bind:value={replaceIdx}>
		{#if (selectedCore?.gems.length ?? 0) < 4}<option value="">Empty socket</option>{/if}
		{#each selectedCore?.gems.toSorted((a, b) => a.idx - b.idx) ?? [] as g (g.idx)}
			<option value={String(g.idx)}>{gemLabel(g)}</option>
		{/each}
	</select>
	<label class="text-sm text-surface-300" for="ag-points">Core points</label>
	<select id="ag-points" class={selectClass} bind:value={points}>
		{#each [1, 2, 3, 4, 5] as p (p)}<option value={p}>{p}</option>{/each}
	</select>
	{#each [{ label: 'Option 1', id: 'a' }, { label: 'Option 2', id: 'b' }] as row (row.id)}
		<span class="text-sm text-surface-300">{row.label}</span>
		<div class="flex flex-row gap-2">
			{#if row.id === 'a'}
				<select class="{selectClass} flex-1" bind:value={optA} aria-label="Option 1 type">
					{#each Object.entries(ASTROGEM_OPTION_NAMES) as [id, name] (id)}<option value={Number(id)}>{name}</option>{/each}
				</select>
				<select class={selectClass} bind:value={lvlA} aria-label="Option 1 level">
					{#each [1, 2, 3, 4, 5] as v (v)}<option value={v}>Lv. {v}</option>{/each}
				</select>
			{:else}
				<select class="{selectClass} flex-1" bind:value={optB} aria-label="Option 2 type">
					{#each Object.entries(ASTROGEM_OPTION_NAMES) as [id, name] (id)}<option value={Number(id)}>{name}</option>{/each}
				</select>
				<select class={selectClass} bind:value={lvlB} aria-label="Option 2 level">
					{#each [1, 2, 3, 4, 5] as v (v)}<option value={v}>Lv. {v}</option>{/each}
				</select>
			{/if}
		</div>
	{/each}
</div>
{#if result}
	<div class="mt-2 grid grid-cols-[1fr_max-content] rounded-xs bg-black/10 p-2">
		<div class="text-sm text-surface-300">Core points</div>
		<div class="text-right text-sm text-surface-100">{result.pointsBefore}P → {result.pointsAfter}P</div>
		<div class="text-sm text-surface-300">From core breakpoint</div>
		<div class="text-right text-sm">{formatPct(result.coreGainPct)}%</div>
		<div class="text-sm text-surface-300">From options</div>
		<div class="text-right text-sm">{formatPct(result.optionGainPct)}%</div>
		<div class="text-sm font-semibold">Combat Power</div>
		<div class="text-right text-sm font-semibold {result.gainPct >= 0 ? 'text-green-400' : 'text-red-400'}">
			{formatPct(result.gainPct)}% → {formatCp(cp * (1 + result.gainPct / 100))}
		</div>
	</div>
{/if}
<span class="mt-3 text-xs text-surface-400">
	Core and astrogem coefficients from the MIT-licensed
	<a class="underline" href="https://github.com/airplaner/lostark-arkgrid-gem-locator-v2" target="_blank" rel="noopener">Ark Grid Gem Locator</a>,
	which can also find the best arrangement of all the astrogems you own.
</span>
