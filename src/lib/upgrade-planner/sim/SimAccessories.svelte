<script lang="ts">
	import { getContext } from 'svelte';
	import { itemLook } from '../icons';
	import type { RoleTables } from '../roles';
	import { ACCESSORY_SLOTS, familyOf, isOtherLine, lineOf, type AccessorySlot, type SimLine, type SimState } from '../simulate';
	import { ACCESSORY_MAIN_STAT_RANGE, TIERS, formatLineValue, type Tier } from '../tables';
	import ItemIcon from './ItemIcon.svelte';
	import LinePicker from './LinePicker.svelte';
	import RangeInput from './RangeInput.svelte';
	import Segmented from './Segmented.svelte';
	import SimCard from './SimCard.svelte';
	import { ROLL_COLORS, btn, btnAccent, type PickOption, type PreviewEdit, type SectionDelta } from './ui';

	let {
		sim = $bindable(),
		base,
		delta,
		itemIds,
		mainStatName,
		preview
	}: {
		sim: SimState;
		base: SimState;
		delta: SectionDelta;
		itemIds: Record<string, number>;
		mainStatName: string;
		preview: PreviewEdit;
	} = $props();

	const LABELS: Record<AccessorySlot, string> = {
		neck: 'Necklace',
		ear1: 'Earring',
		ear2: 'Earring',
		finger1: 'Ring',
		finger2: 'Ring'
	};
	const TIER_OPTIONS = TIERS.toReversed().map((t) => ({
		value: t,
		label: { high: 'High', mid: 'Mid', low: 'Low' }[t],
		color: ROLL_COLORS[t]
	}));
	const slots = $derived(ACCESSORY_SLOTS.filter((s) => sim.accessories[s]));
	// Dealer or support lines: which ones score, and what "max" means.
	const role = getContext<() => RoleTables>('loa-sim:role');
	const LINES = $derived(role().accessoryLines);
	const goal = $derived(role().support ? 'support' : 'DPS');
	const same = (a: SimLine | undefined, b: SimLine) => JSON.stringify(a) === JSON.stringify(b);

	/** Line types this slot can roll, minus types already on its other lines (a type can't appear twice). */
	function optionsFor(slot: AccessorySlot, current: SimLine, index: number): PickOption[] {
		const taken = new Set(sim.accessories[slot]!.filter((ln, i) => i !== index && !isOtherLine(ln)).map((ln) => ln.key));
		const tier: Tier = isOtherLine(current) ? 'high' : current.tier;
		const out: PickOption[] = LINES.filter((l) => l.slots.includes(familyOf(slot)) && !taken.has(l.key)).map((l) => ({
			value: l.key,
			label: `${l.name} ${formatLineValue(l, l.values[tier])}`,
			color: ROLL_COLORS[tier],
			group: l.primary ? `${goal === 'DPS' ? 'DPS' : 'Support'} lines` : 'Any accessory'
		}));
		out.push({
			value: 'other',
			label: isOtherLine(current) ? current.label : `Other (no ${goal} value)`,
			color: ROLL_COLORS.none,
			group: 'Other'
		});
		return out;
	}

	/** Picking a new line type keeps the line's grade (or High when it was a non-DPS line). */
	const withKey = (ln: SimLine, key: string): SimLine =>
		key === 'other'
			? isOtherLine(ln)
				? ln
				: { key: 'other', label: `Other (no ${goal} value)` }
			: { key, tier: isOtherLine(ln) ? 'high' : ln.tier };

	const display = (ln: SimLine) => {
		if (isOtherLine(ln)) return { label: ln.label, color: ROLL_COLORS.none };
		const l = lineOf(ln.key)!;
		return { label: `${l.name} ${formatLineValue(l, l.values[ln.tier])}`, color: ROLL_COLORS[ln.tier] };
	};

	/** Both main lines (DPS or support) at High, replacing other or flat lines first. */
	function maxDps(slot: AccessorySlot) {
		const lines = sim.accessories[slot]!;
		for (const p of LINES.filter((l) => l.primary && l.slots.includes(familyOf(slot)))) {
			const existing = lines.findIndex((ln) => ln.key === p.key);
			if (existing >= 0) {
				lines[existing] = { key: p.key, tier: 'high' };
				continue;
			}
			const replace = lines.findIndex((ln) => isOtherLine(ln) || !lineOf(ln.key)?.primary);
			if (replace >= 0) lines[replace] = { key: p.key, tier: 'high' };
		}
	}
	function resetSlot(slot: AccessorySlot) {
		sim.accessories[slot] = structuredClone($state.snapshot(base.accessories[slot]!));
		sim.accessoryStats[slot] = base.accessoryStats[slot];
	}
</script>

<SimCard title="Accessories" {delta} info="Open a line to compare every alternative. Weapon Power lines are approximate.">
	{#snippet actions()}
		<button type="button" class={btnAccent} onclick={() => slots.forEach(maxDps)}>All max {goal} lines</button>
		<button type="button" class={btn} onclick={() => {
			sim.accessories = structuredClone($state.snapshot(base.accessories));
			sim.accessoryStats = structuredClone($state.snapshot(base.accessoryStats));
		}}>Reset</button>
	{/snippet}
	<div class="flex flex-col gap-2">
		{#each slots as slot (slot)}
			{@const look = itemLook(itemIds[slot])}
			{@const range = ACCESSORY_MAIN_STAT_RANGE[familyOf(slot)]}
			<!-- Phones: the item and its buttons sit on a row above the lines, so the lines get the full width. -->
			<div class="flex flex-row gap-2.5 rounded-xs bg-black/15 p-2 max-sm:flex-col max-sm:gap-1.5">
				<div class="flex w-14 shrink-0 flex-col items-center gap-1 pt-1 max-sm:w-full max-sm:flex-row max-sm:gap-2 max-sm:pt-0">
					<ItemIcon src={look.icon} grade={look.grade} title={look.name} frame="enlightenment" />
					<span class="text-[11px] font-semibold text-surface-300">{LABELS[slot]}</span>
					<div class="ml-auto flex flex-row gap-1.5 sm:hidden">
						<button type="button" class={btnAccent} onclick={() => maxDps(slot)} title={`Both main ${goal} lines at High`}>Max {goal}</button>
						<button type="button" class={btn} onclick={() => resetSlot(slot)}>Reset</button>
					</div>
				</div>
				<div class="flex min-w-0 flex-1 flex-col gap-1">
					{#each sim.accessories[slot]! as ln, i (i)}
						{@const before = base.accessories[slot]?.[i]}
						<div class="flex flex-row items-center gap-2">
							<LinePicker
								value={ln.key}
								display={display(ln)}
								options={optionsFor(slot, ln, i)}
								label={`${LABELS[slot]} line ${i + 1}`}
								changed={!before || before.key !== ln.key}
								onpick={(key) => (sim.accessories[slot]![i] = withKey(ln, key))}
								preview={(key) => preview((s) => (s.accessories[slot]![i] = withKey(ln, key)))}
							/>
							<Segmented
								value={isOtherLine(ln) ? null : ln.tier}
								options={TIER_OPTIONS}
								disabled={isOtherLine(ln)}
								label={`${LABELS[slot]} line ${i + 1} grade`}
								onselect={(t) => !isOtherLine(ln) && (sim.accessories[slot]![i] = { key: ln.key, tier: t })}
								size="h-8 min-w-10 px-1.5 text-xs"
							/>
							<span
								class="size-1.5 shrink-0 rounded-full {before && !same(before, ln) ? 'bg-accent-400' : 'invisible'}"
								title="Changed"
								aria-hidden="true"
							></span>
						</div>
					{/each}
					<div class="mt-0.5 flex flex-row items-center gap-1.5">
						{#if sim.accessoryStats[slot] !== undefined}
							<RangeInput
								bind:value={sim.accessoryStats[slot]!}
								min={range.min}
								max={range.max}
								label={mainStatName}
								changed={sim.accessoryStats[slot] !== base.accessoryStats[slot]}
								compact
							/>
						{/if}
						<button type="button" class="{btnAccent} max-sm:hidden" onclick={() => maxDps(slot)} title={`Both main ${goal} lines at High`}>Max {goal}</button>
						<button type="button" class="{btn} max-sm:hidden" onclick={() => resetSlot(slot)}>Reset</button>
					</div>
				</div>
			</div>
		{/each}
	</div>
</SimCard>
