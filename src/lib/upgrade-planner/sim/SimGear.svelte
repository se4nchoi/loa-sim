<script lang="ts">
	import { HONING_SLOTS, type HoningSlot } from '../honing-data';
	import { HONING_SLOT_LABELS as LABELS } from '../honing-upgrades';
	import { isInheritedGear, itemLook } from '../icons';
	import { gearItemLevel, type SimState } from '../simulate';
	import { maxEquipment } from '../sim-max';
	import ItemIcon from './ItemIcon.svelte';
	import SimCard from './SimCard.svelte';
	import Stepper from './Stepper.svelte';
	import SimSidereal from './SimSidereal.svelte';
	import SimBracer from './SimBracer.svelte';
	import { btn, btnAccent, type SectionDelta } from './ui';

	let {
		sim = $bindable(),
		base,
		delta,
		itemIds,
		classId
	}: { sim: SimState; base: SimState; delta: SectionDelta; itemIds: Record<string, number>; classId: string } = $props();

	const ORDER: HoningSlot[] = ['head', 'shoulder', 'upper_body', 'lower_body', 'hand', 'weapon'];
	const slots = $derived(ORDER.filter((s) => sim.gear[s]));

	function bumpAll(delta: number) {
		for (const s of HONING_SLOTS) {
			const g = sim.gear[s];
			if (g) g.honing = Math.min(25, Math.max(0, g.honing + delta));
		}
	}
</script>

<SimCard title="Equipment" {delta} info="Approximate: stats from the game's Aegir and Serca honing tables. Armor adds main stat; the weapon scales Weapon Power.">
	{#snippet actions()}
		<button type="button" class={btnAccent} onclick={() => maxEquipment(sim)} title="Max honing and advanced honing, Sidereal growth, and Ancient +25 bracer">All max</button>
		<button type="button" class={btn} onclick={() => bumpAll(-1)}>All −1</button>
		<button type="button" class={btn} onclick={() => bumpAll(1)}>All +1</button>
		<button type="button" class={btn} onclick={() => { sim.gear = structuredClone($state.snapshot(base.gear)); sim.sidereal = structuredClone($state.snapshot(base.sidereal)); sim.bracer = base.bracer ? { ...base.bracer } : null; }}>Reset</button>
	{/snippet}
	{#if slots.length === 0 && !sim.sidereal}
		<p class="text-sm text-surface-400">No supported T4 gear found; honing can't be simulated for this loadout.</p>
	{/if}
		<div class="grid w-fit grid-cols-[max-content_minmax(4rem,8rem)_max-content_max-content_max-content_3rem] items-center gap-x-4 gap-y-3.5 max-sm:w-full max-sm:grid-cols-[max-content_minmax(0,1fr)_max-content_3rem] max-sm:gap-x-2">
			<!-- Phones: icon only (no name column), so the steppers keep their room. -->
			<span></span>
			<span class="text-xs text-surface-400 max-sm:hidden">Piece</span>
			<span class="text-center text-xs text-surface-400">Honing</span>
			<span class="text-center text-xs text-surface-400">Advanced</span>
			<span class="text-right text-xs text-surface-400 max-sm:hidden">Item Lv.</span>
			<span></span>
			{#each slots as slot (slot)}
				{@const g = sim.gear[slot]!}
				{@const b = base.gear[slot]!}
				{@const look = itemLook(itemIds[slot])}
				<ItemIcon src={look.icon} grade={look.grade} title={look.name} frame="evolution" inherited={isInheritedGear(itemIds[slot])} />
				<span class="min-w-0 truncate text-sm font-semibold text-surface-100 max-sm:hidden">{LABELS[slot]}</span>
				<Stepper bind:value={g.honing} min={0} max={25} prefix="+" changed={g.honing !== b.honing} label={`${LABELS[slot]} honing`} width="w-7" />
				{#if g.set === 'aegir'}
					<Stepper bind:value={g.advanced} min={0} max={40} step={5} changed={g.advanced !== b.advanced} label={`${LABELS[slot]} advanced honing`} width="w-7" />
				{:else}
					<span class="text-center text-sm text-surface-400" title="Serca transfer requires Advanced Honing 40">40</span>
				{/if}
				<span class="text-right text-sm tabular-nums max-sm:hidden {gearItemLevel(g) !== gearItemLevel(b) ? 'text-accent-300' : 'text-surface-300'}">{gearItemLevel(g)}</span>
				{#if g.honing !== b.honing || g.advanced !== b.advanced}
					<button type="button" class="{btn} px-2" aria-label={`Reset ${LABELS[slot]}`} onclick={() => (sim.gear[slot] = { ...b })}>Reset</button>
				{:else}<span></span>{/if}
			{/each}
		</div>
	{#if sim.sidereal && base.sidereal}
		<SimSidereal bind:weapon={sim.sidereal} base={base.sidereal} itemId={itemIds.weapon} />
	{/if}
	<SimBracer bind:sim {base} {classId} />
</SimCard>
