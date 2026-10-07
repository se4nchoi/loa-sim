<script lang="ts">
	import { gemDpsGainPct } from '../dps';
	import { formatPct } from '../format';
	import { GEM_EFFECTS, GEM_SKILLS } from '../game-data';
	import { iconUrl, itemLook } from '../icons';
	import type { GemKind, GemPart, SimState } from '../simulate';
	import ItemIcon from './ItemIcon.svelte';
	import MenuPicker from './MenuPicker.svelte';
	import Segmented from './Segmented.svelte';
	import SimCard from './SimCard.svelte';
	import Stepper from './Stepper.svelte';
	import { btn, btnAccent, type MenuOption, type SectionDelta } from './ui';

	let {
		sim = $bindable(),
		base,
		gems,
		delta
	}: { sim: SimState; base: SimState; gems: GemPart[]; delta: SectionDelta } = $props();

	const editable = $derived(gems.map((g, i) => ({ g, i })).filter(({ g }) => g.table));
	const KIND_OPTIONS: { value: GemKind; label: string; title: string }[] = [
		{ value: 'damage', label: 'Dmg', title: 'Damage gem: raises the skill’s damage' },
		{ value: 'cooldown', label: 'CD', title: 'Cooldown gem: shortens the skill’s cooldown' }
	];

	/** Gem item id for a tier/kind/level: 650[3|2][1 dmg|2 cd][level 2 digits][bound digit]. */
	const gemId = (id: number, kind: GemKind, level: number) =>
		Math.floor(id / 10000) * 10000 + (kind === 'damage' ? 1 : 2) * 1000 + level * 10 + (id % 10);

	// The character's class is whatever class its gem skills belong to.
	const classKey = $derived(sim.gems.map((g) => (g.skill ? GEM_SKILLS[g.skill]?.[2] : undefined)).find(Boolean));
	const SKILL_OPTIONS = $derived<MenuOption<number>[]>(
		Object.entries(GEM_SKILLS)
			.filter(([, s]) => s[2] === classKey)
			.map(([id, s]) => ({ value: Number(id), label: s[0], iconUrl: iconUrl(s[1]) }))
	);
	const skillName = (id: number | null) => (id ? (GEM_SKILLS[id]?.[0] ?? `Skill ${id}`) : 'Unknown skill');
	const effectText = (i: number) => {
		const g = sim.gems[i];
		const tier = gems[i].tier ?? 'T4';
		const v = (GEM_EFFECTS[tier][g.kind][g.level - 1] ?? 0) / 100;
		return g.kind === 'damage' ? `+${v}% dmg` : `−${v}% CD`;
	};

	const setAll = (fn: (current: number) => number) =>
		editable.forEach(({ i }) => (sim.gems[i].level = Math.min(10, Math.max(1, fn(sim.gems[i].level)))));
	const gemChanged = (i: number) => JSON.stringify(sim.gems[i]) !== JSON.stringify(base.gems[i]);

	const dps = $derived(gemDpsGainPct(base.gems, sim.gems, gems, sim.skillShares));
	const sharedTotal = $derived(Object.values(sim.skillShares).reduce((a, v) => a + (Number(v) || 0), 0));
	let showShares = $state(false);
	$effect.pre(() => {
		if (Object.keys(sim.skillShares).length) showShares = true;
	});
</script>

<SimCard title="Gems" {delta}>
	{#snippet actions()}
		<button type="button" class={btn} onclick={() => (showShares = !showShares)} aria-pressed={showShares}>
			{showShares ? 'Hide' : 'Add'} damage shares
		</button>
	{/snippet}
	{#if editable.length === 0}
		<p class="text-sm text-surface-400">No gems equipped.</p>
	{:else}
		<div class="mb-3 flex flex-row flex-wrap items-center gap-1.5">
			<span class="mr-1 text-xs text-surface-400">Set all</span>
			{#each [10, 9, 8, 7, 6] as lv (lv)}
				<button type="button" class={lv === 10 ? btnAccent : btn} onclick={() => setAll(() => lv)}>All Lv. {lv}</button>
			{/each}
			<span class="mx-1 h-5 w-px bg-surface-700"></span>
			<button type="button" class={btn} onclick={() => setAll((v) => v - 1)}>All −1</button>
			<button type="button" class={btn} onclick={() => setAll((v) => v + 1)}>All +1</button>
			<button type="button" class={btn} onclick={() => (sim.gems = structuredClone($state.snapshot(base.gems)))}>Reset</button>
		</div>
		{#if showShares}
			<div class="mb-3 rounded-xs border border-surface-700 bg-black/20 p-2.5 text-xs text-surface-300">
				Combat Power treats every gem the same. Real damage depends on the skill: enter roughly what share of your damage
				each skill does (from a log) to see an estimated <b>DPS</b> change next to Combat Power.
				{#if dps !== null}
					<div class="mt-1.5 text-sm">
						Gem DPS estimate:
						<span class="font-bold {dps > 0 ? 'text-green-400' : dps < 0 ? 'text-red-400' : 'text-surface-200'}">{formatPct(dps)}%</span>
						<span class="text-surface-400">({sharedTotal.toFixed(0)}% of damage covered)</span>
					</div>
				{/if}
			</div>
		{/if}
		<div class="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-2">
			{#each editable as { g, i } (i)}
				{@const gem = sim.gems[i]}
				{@const look = itemLook(gemId(g.id, gem.kind, gem.level))}
				<div class="flex flex-col gap-1.5 rounded-xs p-2 {gemChanged(i) ? 'bg-accent-500/10 ring-1 ring-accent-500' : 'bg-black/15'}">
					<div class="flex flex-row items-center gap-2">
						<ItemIcon src={look.icon} grade={look.grade} size="size-11" badge={gem.level} title={look.name} />
						<div class="flex min-w-0 flex-1 flex-col gap-1">
							<Segmented
								value={gem.kind}
								options={KIND_OPTIONS}
								onselect={(k) => (gem.kind = k)}
								label={`Gem ${i + 1} type`}
								size="h-6 flex-1 px-1.5 text-[11px]"
							/>
							<span class="text-[11px] text-surface-400">{g.tier} · {effectText(i)}</span>
						</div>
					</div>
					<MenuPicker
						value={gem.skill ?? 0}
						options={SKILL_OPTIONS}
						label={`Gem ${i + 1} skill`}
						changed={gem.skill !== base.gems[i].skill}
						onpick={(v) => (gem.skill = v)}
					>
						{#snippet trigger()}
							{#if gem.skill && GEM_SKILLS[gem.skill]}<img src={iconUrl(GEM_SKILLS[gem.skill][1])} alt="" class="size-5 rounded-xs" />{/if}
							<span class="max-w-28 truncate text-xs">{skillName(gem.skill)}</span>
						{/snippet}
					</MenuPicker>
					<div class="flex flex-row items-center justify-between gap-1">
						<Stepper bind:value={gem.level} min={1} max={10} prefix="Lv. " changed={gem.level !== base.gems[i].level} label={`Gem ${i + 1} level`} width="w-6" />
						{#if showShares && gem.skill}
							<label class="flex h-8 w-16 cursor-text items-center gap-0.5 rounded-xs border border-surface-600 bg-surface-800 px-1.5 hover:border-accent-500 focus-within:border-accent-500" title={`${skillName(gem.skill)}: share of total damage`}>
								<input
									type="number"
									min="0"
									max="100"
									step="0.1"
									placeholder="0"
									class="w-full bg-transparent text-right text-sm tabular-nums [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
									aria-label={`${skillName(gem.skill)} damage share`}
									value={sim.skillShares[gem.skill] ?? ''}
									oninput={(e) => {
										const v = Number(e.currentTarget.value);
										if (v > 0) sim.skillShares[gem.skill!] = v;
										else delete sim.skillShares[gem.skill!];
									}}
								/>
								<span class="text-xs text-surface-400">%</span>
							</label>
						{/if}
					</div>
				</div>
			{/each}
		</div>
	{/if}
</SimCard>
