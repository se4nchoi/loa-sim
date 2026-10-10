<script lang="ts">
	import { HONING_SLOTS, type HoningSlot } from '../honing-data';
	import { HONING_SLOT_LABELS as LABELS } from '../honing-upgrades';
	import { isInheritedGear, itemLook } from '../icons';
	import { gearItemLevel, type SimState } from '../simulate';
	import { maxEquipment } from '../sim-max';
	import ItemIcon from './ItemIcon.svelte';
	import SimCard from './SimCard.svelte';
	import Stepper from './Stepper.svelte';
	import QualityInput from './QualityInput.svelte';
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

<SimCard title="Equipment" {delta} info="Honing uses the game's Aegir and Serca stat tables. Weapon quality adds Additional Damage; armor quality adds Vigor and HP, increasing support Shield & Heal Power. Quality is read from the loadout's quality or additional stat.">
	{#snippet actions()}
		<button type="button" class={btnAccent} onclick={() => maxEquipment(sim)} title="Max honing, advanced honing and quality, Sidereal growth, and Ancient +25 bracer">Max</button>
		<button type="button" class={btn} onclick={() => bumpAll(-1)}>All −1</button>
		<button type="button" class={btn} onclick={() => bumpAll(1)}>All +1</button>
		<button type="button" class={btn} onclick={() => { sim.gear = structuredClone($state.snapshot(base.gear)); sim.quality = { ...base.quality }; sim.sidereal = structuredClone($state.snapshot(base.sidereal)); sim.bracer = base.bracer ? { ...base.bracer } : null; }}>Reset</button>
	{/snippet}
	{#if slots.length === 0 && !sim.sidereal}
		<p class="text-sm text-surface-400">No supported T4 gear found; honing can't be simulated for this loadout.</p>
	{/if}
	<div class="divide-y divide-surface-800">
		{#each slots as slot (slot)}
			{@const g = sim.gear[slot]!}
			{@const b = base.gear[slot]!}
			{@const look = itemLook(itemIds[slot])}
			<div class="flex flex-wrap items-center gap-3 py-3" role="group" aria-label={LABELS[slot]}>
				<div class="flex min-w-36 flex-1 items-center gap-3">
					<ItemIcon src={look.icon} grade={look.grade} title={look.name} frame="evolution" inherited={isInheritedGear(itemIds[slot])} />
					<div class="min-w-0 flex-1">
						<div class="flex flex-wrap items-center gap-1.5">
							<span class="text-sm font-semibold text-surface-100">{LABELS[slot]}</span>
							<span title="Item level" class="rounded-full border border-surface-700 px-1 text-[11px] leading-4 tabular-nums {gearItemLevel(g) !== gearItemLevel(b) ? 'text-accent-300' : 'text-surface-300'}">{gearItemLevel(g)}</span>
						</div>
						{#if sim.quality[slot] !== undefined}<div class="mt-1 max-w-32"><QualityInput small hideMax bind:value={sim.quality[slot]!} changed={sim.quality[slot] !== base.quality[slot]} label={`${LABELS[slot]} quality`} /></div>{/if}
					</div>
				</div>
				<div class="ml-auto flex shrink-0 items-center gap-2">
					<div class="flex flex-col items-center gap-1">
						<span class="text-[10px] text-surface-400">Honing</span>
						<Stepper bind:value={g.honing} min={0} max={25} prefix="+" changed={g.honing !== b.honing} label={`${LABELS[slot]} honing`} width="w-7" />
					</div>
					{#if g.set === 'aegir'}
						<div class="flex flex-col items-center gap-1">
							<span class="text-[10px] text-surface-400">Advanced</span>
							<Stepper bind:value={g.advanced} min={0} max={40} step={5} changed={g.advanced !== b.advanced} label={`${LABELS[slot]} advanced honing`} width="w-7" />
						</div>
					{/if}
					<div class="flex flex-col gap-1">
						<button type="button" class="{btnAccent} px-2" aria-label={`Max ${LABELS[slot]}`} onclick={() => { g.honing = 25; g.advanced = 40; if (sim.quality[slot] !== undefined) sim.quality[slot] = 100; }}>Max</button>
						<button type="button" class="{btn} px-2" aria-label={`Reset ${LABELS[slot]}`} onclick={() => { sim.gear[slot] = { ...b }; sim.quality[slot] = base.quality[slot]; }}>Reset</button>
					</div>
				</div>
			</div>
		{/each}
	</div>
	{#if sim.sidereal && base.sidereal}
		<SimSidereal bind:weapon={sim.sidereal} base={base.sidereal} itemId={itemIds.weapon} />
		{#if sim.quality.weapon !== undefined}<div class="mt-2 flex items-center gap-3"><span class="text-sm text-surface-100">Weapon quality</span><div class="min-w-0 flex-1"><QualityInput bind:value={sim.quality.weapon} changed={sim.quality.weapon !== base.quality.weapon} label="Weapon quality" /></div></div>{/if}
	{/if}
	<SimBracer bind:sim {base} {classId} />
</SimCard>
