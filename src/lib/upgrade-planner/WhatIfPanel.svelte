<script lang="ts">
	import { PartType, baseAttackPoint } from './cp';
	import { formatCp, formatPct } from './format';
	import type { Loadout } from './types';

	let { loadout, cp }: { loadout: Loadout; cp: number } = $props();

	const base = $derived(
		loadout.battlePoint.parts.find((p) => p.type === PartType.BaseAttack) as
			| { mainStat?: number; weaponPower?: number; attackPowerMultiplier?: number }
			| undefined
	);
	const current = $derived({
		mainStat: base?.mainStat ?? 0,
		weaponPower: base?.weaponPower ?? 0,
		attackPct: base?.attackPowerMultiplier ?? 0
	});

	let mainStat = $state(0);
	let weaponPower = $state(0);
	let attackPct = $state(0);
	$effect.pre(() => {
		mainStat = current.mainStat;
		weaponPower = current.weaponPower;
		attackPct = current.attackPct;
	});

	// CP is linear in the base attack battle point, so the ratio carries straight through.
	const ratio = $derived(
		current.mainStat && current.weaponPower
			? baseAttackPoint(mainStat, weaponPower, attackPct) /
					baseAttackPoint(current.mainStat, current.weaponPower, current.attackPct)
			: 1
	);
	const gainPct = $derived((ratio - 1) * 100);

	const fields = [
		{ key: 'mainStat', label: 'Main stat' },
		{ key: 'weaponPower', label: 'Weapon Power' },
		{ key: 'attackPct', label: 'Bonus Atk. Power %' }
	] as const;
	const inputClass =
		'w-32 rounded-xs border border-surface-700 bg-surface-950 px-2 py-0.5 text-right text-sm text-surface-100 focus:border-accent-500 focus:outline-none';
</script>

<span class="text-lg font-semibold">Honing what-if</span>
<span class="text-sm text-surface-300">
	Hover the honing preview in-game, then enter the main stat and Weapon Power you'd have after it. Combat Power
	scales with √(main stat × Weapon Power), so this is exact.
</span>
<div class="mt-2 grid grid-cols-[1fr_max-content_max-content] items-center gap-x-3 gap-y-1">
	<div class="text-xs text-surface-400"></div>
	<div class="text-right text-xs text-surface-400">Now</div>
	<div class="text-right text-xs text-surface-400">After</div>
	{#each fields as f (f.key)}
		<label class="text-sm text-surface-300" for={`whatif-${f.key}`}>{f.label}</label>
		<span class="text-right text-sm text-surface-100">{current[f.key].toLocaleString()}</span>
		{#if f.key === 'mainStat'}
			<input id="whatif-mainStat" type="number" class={inputClass} bind:value={mainStat} />
		{:else if f.key === 'weaponPower'}
			<input id="whatif-weaponPower" type="number" class={inputClass} bind:value={weaponPower} />
		{:else}
			<input id="whatif-attackPct" type="number" step="0.01" class={inputClass} bind:value={attackPct} />
		{/if}
	{/each}
</div>
<div class="mt-2 grid grid-cols-[1fr_max-content] rounded-xs bg-black/10 p-2">
	<div class="text-sm font-semibold">Combat Power</div>
	<div class="text-right text-sm font-semibold {gainPct >= 0 ? 'text-green-400' : 'text-red-400'}">
		{formatPct(gainPct)}% → {formatCp(cp * ratio)}
	</div>
</div>
<button
	type="button"
	class="mt-1 w-fit text-xs text-surface-300 underline"
	onclick={() => {
		mainStat = current.mainStat;
		weaponPower = current.weaponPower;
		attackPct = current.attackPct;
	}}>Reset</button
>
