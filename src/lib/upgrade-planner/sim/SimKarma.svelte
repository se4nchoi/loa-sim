<script lang="ts">
	import type { SimState } from '../simulate';
	import {
		KARMA_ENLIGHTENMENT_WEAPON_PCT_PER_LEVEL,
		KARMA_EVOLUTION_HP_PER_LEVEL,
		KARMA_EVOLUTION_PER_RANK,
		KARMA_LEAP_PER_LEVEL,
		KARMA_MAX_LEVEL,
		karmaRank
	} from '../tables';
	import SimCard from './SimCard.svelte';
	import Stepper from './Stepper.svelte';
	import { btn, type SectionDelta } from './ui';

	let { sim = $bindable(), base, delta }: { sim: SimState; base: SimState; delta: SectionDelta } = $props();

	type Tree = 'evolution' | 'enlightenment' | 'leap';
	// Tree colors follow the in-game ark passive tabs.
	const TREES: { key: Tree; name: string; color: string }[] = [
		{ key: 'evolution', name: 'Evolution', color: '#f1d594' },
		{ key: 'enlightenment', name: 'Enlightenment', color: '#8fc9ff' },
		{ key: 'leap', name: 'Leap', color: '#9be59b' }
	];
	const effects = (tree: Tree, level: number): { label: string; sub?: string }[] => {
		const rank = karmaRank(level);
		if (tree === 'evolution')
			return [
				{ label: `+${((rank * KARMA_EVOLUTION_PER_RANK) / 100).toFixed(2)}% CP` },
				{ label: `+${(level * KARMA_EVOLUTION_HP_PER_LEVEL).toLocaleString()} Max HP` }
			];
		if (tree === 'enlightenment')
			return [
				{ label: `+${(level * KARMA_ENLIGHTENMENT_WEAPON_PCT_PER_LEVEL).toFixed(1)}% Weapon Power` },
				{ label: `+${rank} enlightenment point${rank === 1 ? '' : 's'}` }
			];
		return [
			{ label: `+${((level * KARMA_LEAP_PER_LEVEL) / 100).toFixed(2)}% CP` },
			{ label: `+${rank * 2} leap points` }
		];
	};
	const trees = $derived(TREES.filter((t) => sim.karma[t.key] !== null));
</script>

{#if trees.length}
	<SimCard title="Karma" {delta}>
		{#snippet actions()}
			<button type="button" class={btn} onclick={() => trees.forEach((t) => (sim.karma[t.key] = KARMA_MAX_LEVEL))}>All max</button>
		{/snippet}
		<div class="grid grid-cols-3 gap-2 max-md:grid-cols-1">
			{#each trees as t (t.key)}
				{@const level = sim.karma[t.key]!}
				{@const rank = karmaRank(level)}
				{@const changed = level !== base.karma[t.key]}
				<div
					class="flex flex-col gap-2 rounded-xs border-t-2 bg-black/15 p-2.5 {changed ? 'ring-1 ring-accent-500' : ''}"
					style:border-top-color={t.color}
				>
					<div class="flex flex-row items-center gap-2">
						<!-- Rank badge in the tree's color (the game's rank icons aren't on the public CDN). -->
						<span
							class="flex size-9 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold"
							style:border-color={t.color}
							style:color={t.color}
							style:background-color="color-mix(in oklab, {t.color} 14%, transparent)"
							title={`Rank ${rank}`}>{rank}</span
						>
						<div class="flex min-w-0 flex-1 flex-col">
							<span class="text-sm font-semibold" style:color={t.color}>{t.name}</span>
							<span class="text-xs text-surface-400">Rank {rank} · Lv. {level}</span>
						</div>
					</div>
					<div class="flex flex-row items-center gap-1.5">
						<Stepper bind:value={sim.karma[t.key]!} min={0} max={KARMA_MAX_LEVEL} prefix="Lv. " {changed} label={`${t.name} karma level`} width="w-6" />
						<button type="button" class={btn} onclick={() => (sim.karma[t.key] = KARMA_MAX_LEVEL)}>Max</button>
					</div>
					<ul class="flex flex-col gap-0.5 text-xs">
						{#each effects(t.key, level) as e (e.label)}
							<li class="flex flex-row justify-between gap-2">
								<span class="text-surface-100">{e.label}</span>
								{#if e.sub}<span class="text-surface-500">{e.sub}</span>{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/each}
		</div>
	</SimCard>
{/if}
