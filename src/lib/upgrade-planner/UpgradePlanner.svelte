<!--
	"Next Upgrades" sidebar card. Drop it under the Combat Power card on the character page:
		<UpgradePlanner loadout={loadout} />
	where `loadout` is the ark passive loadout bible already renders (the one with `battlePoint`).
-->
<script lang="ts">
	import { combatPower } from './cp';
	import { formatPct } from './format';
	import type { Loadout } from './types';
	import UpgradeDialog from './UpgradeDialog.svelte';
	import UpgradeTitle from './UpgradeTitle.svelte';
	import { CATEGORY_LABELS, buildUpgrades, topDistinct } from './upgrades';

	let { loadout, limit = 5 }: { loadout: Loadout; limit?: number } = $props();

	const isSupport = $derived(loadout.battlePoint.isSupport);
	const upgrades = $derived(buildUpgrades(loadout));
	const cp = $derived(loadout.combatPower?.score ?? combatPower(loadout.battlePoint.parts).max);
	let dialogOpen = $state(false);
</script>

<div class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
	<div class="flex flex-row items-center bg-black/10 px-3 py-2 font-bold">
		<div class="flex flex-row items-start">Next Upgrades</div>
	</div>
	{#if isSupport}
		<p class="p-2 text-sm text-surface-300">Upgrade suggestions are available for DPS loadouts only for now.</p>
	{:else if upgrades.length === 0}
		<p class="p-2 text-sm text-surface-300">No one-step upgrades found for this loadout.</p>
	{:else}
		<div class="grid grid-cols-[1fr_max-content] gap-x-2 p-1">
			{#each topDistinct(upgrades, limit) as u (u.key)}
				<div
					class="col-span-full grid grid-cols-subgrid items-center rounded-xs px-1.5 py-1 transition duration-75 hover:bg-black/20"
					title={u.detail}
				>
					<div class="flex min-w-0 flex-col">
						<UpgradeTitle {u} />
						{#if !u.subject}<span class="text-xs text-surface-500">{CATEGORY_LABELS[u.category]}</span>{/if}
					</div>
					<span class="text-right whitespace-nowrap text-green-400 tabular-nums">
						{u.approximate ? '≈' : ''}{formatPct(u.gainPct)}<span class="text-xs">%</span>
					</span>
				</div>
			{/each}
			<div class="col-span-full w-full px-1 text-right">
				<button
					class="text-xs text-surface-300 underline hover:text-surface-300"
					type="button"
					aria-haspopup="dialog"
					onclick={() => (dialogOpen = true)}
				>
					All Upgrades ({upgrades.length})
				</button>
			</div>
		</div>
	{/if}
</div>

{#if dialogOpen}
	<UpgradeDialog {upgrades} {cp} onclose={() => (dialogOpen = false)} />
{/if}
