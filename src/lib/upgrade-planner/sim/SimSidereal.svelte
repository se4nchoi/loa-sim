<script lang="ts">
	import type { SimSidereal } from '../sidereal';
	import { setSiderealInfusion, siderealItemLevel, siderealMaxEvolution } from '../sidereal';
	import { SIDEREAL_ITEMS } from '../sidereal-data';
	import { iconUrl } from '../icons';
	import ItemIcon from './ItemIcon.svelte';
	import Stepper from './Stepper.svelte';
	import { btn, btnAccent, selectClass } from './ui';

	let { weapon = $bindable(), base, itemId }: {
		weapon: SimSidereal; base: SimSidereal; itemId: number;
	} = $props();
	const look = $derived(SIDEREAL_ITEMS[itemId + (weapon.infusion - base.infusion) * 1000] ?? SIDEREAL_ITEMS[itemId]);
</script>

<div class="flex flex-col gap-3 border-t border-surface-700 pt-3">
	<div class="flex flex-wrap items-center gap-3">
		<ItemIcon src={iconUrl(look?.icon)} grade={7} title={look?.name} frame="evolution" />
		<div class="flex-1 text-sm"><b>Sidereal weapon</b><div class="text-xs text-surface-400">{look?.name} · Item Lv. {siderealItemLevel(weapon)}</div></div>
		<button type="button" class={btnAccent} onclick={() => Object.assign(weapon, { infusion: 3, evolution: 10, advanced: 40 })}>Max Sidereal</button>
		<button type="button" class={btn} onclick={() => weapon = structuredClone(base)}>Reset Sidereal</button>
	</div>
	<div class="flex flex-wrap gap-3">
		<label class="flex flex-col gap-1 text-xs text-surface-400">Elgic infusion
			<select class={selectClass(weapon.infusion !== base.infusion)} value={weapon.infusion} onchange={(e) => setSiderealInfusion(weapon, Number(e.currentTarget.value))}>
				<option value={0}>None</option><option value={1}>Elgic I</option><option value={2}>Elgic II</option><option value={3}>Elgic III</option>
			</select>
		</label>
		<div class="flex flex-col gap-1 text-xs text-surface-400">Evolution
			<Stepper bind:value={weapon.evolution} min={weapon.infusion === 3 ? 7 : weapon.infusion ? 6 : 1} max={siderealMaxEvolution(weapon.infusion)} prefix="+" changed={weapon.evolution !== base.evolution} label="Sidereal evolution" />
		</div>
	</div>
</div>
