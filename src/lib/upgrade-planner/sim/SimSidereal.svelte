<script lang="ts">
	import type { SimSidereal } from '../sidereal';
	import { SIDEREALS, setSiderealInfusion, siderealBondDps, siderealItemLevel, siderealMaxAdvanced, siderealMaxEvolution } from '../sidereal';
	import { SIDEREAL_ITEMS } from '../sidereal-data';
	import { iconUrl } from '../icons';
	import { formatPct } from '../format';
	import ItemIcon from './ItemIcon.svelte';
	import Stepper from './Stepper.svelte';
	import { btn, selectClass } from './ui';

	let { weapon = $bindable(), base, itemId, mainStat, attackPower }: {
		weapon: SimSidereal; base: SimSidereal; itemId: number; mainStat: number; attackPower: number;
	} = $props();
	const look = $derived(SIDEREAL_ITEMS[itemId + (weapon.infusion - base.infusion) * 1000] ?? SIDEREAL_ITEMS[itemId]);
	const gain = $derived(siderealBondDps(weapon, mainStat, attackPower));
	const estimated = $derived(weapon.bondEstimates[weapon.bond]);
	const descriptions: Record<string, string> = {
		Thirain: "Knight's Pride raises your main stat; from +8, Light of Daybreak also adds Atk. Power.",
		Wei: 'Direct damage and stagger. Enter a measured personal DPS gain for your fight.',
		Nineveh: 'Direct damage from arrows and Punishing Strike. Enter a measured personal DPS gain for your fight.',
		Azena: 'Direct damage from ancient spears. Enter a measured personal DPS gain for your fight.',
		Shandi: 'Cooldown resets, Swiftness and Crit. Enter a personal DPS estimate for your rotation.',
		Balthorr: 'Shield and Push Immunity. No direct personal damage bonus is modeled.',
		Inanna: 'Healing and protection from fatal damage. No direct personal damage bonus is modeled.'
	};
</script>

<div class="flex flex-col gap-3 border-t border-surface-700 pt-3">
	<div class="flex flex-wrap items-center gap-3">
		<ItemIcon src={iconUrl(look?.icon)} grade={7} title={look?.name} frame="evolution" />
		<div class="flex-1 text-sm"><b>Sidereal weapon</b><div class="text-xs text-surface-400">{look?.name} · Item Lv. {siderealItemLevel(weapon)}</div></div>
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
		<div class="flex flex-col gap-1 text-xs text-surface-400">Advanced
			<Stepper bind:value={weapon.advanced} min={weapon.infusion === 3 ? 40 : 0} max={siderealMaxAdvanced(weapon.infusion)} changed={weapon.advanced !== base.advanced} label="Sidereal advanced honing" />
		</div>
	</div>
	<p class="text-xs text-surface-400">+10 requires Elgic III. Elgic III includes advanced honing 40 in its weapon stats and item level. Weapon changes estimate Combat Power; the imported bond contribution is preserved.</p>
	<label class="flex flex-col gap-1 text-xs text-surface-400">Sidereal configuration
		<select bind:value={weapon.bond} class={selectClass(weapon.bond !== base.bond)}>
			<option value="unknown">Equipped (not provided by character data)</option>
			{#each SIDEREALS as bond}<option value={bond}>{bond}</option>{/each}
		</select>
	</label>
	{#if weapon.bond !== 'unknown'}
		<p class="text-xs text-surface-300">{descriptions[weapon.bond]}</p>
		{#if weapon.bond === 'Thirain' && estimated === undefined}
			<label class="flex flex-wrap items-center gap-2 text-xs text-surface-400">Damage dealt during buffs
				<Stepper bind:value={weapon.bondUptime} min={0} max={100} suffix="%" label="Thirain damage-weighted buff uptime" />
			</label>
			<p class="text-xs text-surface-400">100% shows the active-buff estimate, assuming both buffs overlap at +8 and above. Lower this for an average over the fight. +10-specific bond improvements are not modeled; use a measured estimate below.</p>
		{/if}
		<label class="flex flex-wrap items-center gap-2 text-xs text-surface-400">Measured / custom average DPS gain (%)
			<input type="number" min="0" step="0.1" class="h-8 w-24 rounded-xs border border-surface-700 bg-surface-950 px-2 text-sm text-surface-100" value={estimated ?? ''} placeholder="Optional" aria-label="Sidereal measured DPS gain" onchange={(e) => {
				const value = e.currentTarget.value;
				if (value === '') delete weapon.bondEstimates[weapon.bond];
				else weapon.bondEstimates[weapon.bond] = Math.max(0, Number(value) || 0);
			}} />
		</label>
		<p class="text-sm font-semibold text-accent-200">{weapon.bond}: {gain === null ? 'DPS estimate needs a measured value' : `${formatPct(gain)}% personal DPS vs. no bond`}</p>
		<p class="text-xs text-surface-400">This bond estimate is separate from Combat Power. Switching bonds does not rewrite the imported score.</p>
	{/if}
</div>
