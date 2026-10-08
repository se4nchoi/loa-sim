<!--
	"Next Upgrades" sidebar card: the best one-step upgrades for the loadout. With `onapply` (the simulator passes
	it), each row gets an Apply button that makes the edit in the simulator.
		<UpgradePlanner loadout={loadout} onapply={(u) => …} />
-->
<script lang="ts">
	import { formatPct } from './format';
	import { honingUpgrades } from './honing-upgrades';
	import { bracerUpgrades } from './bracer-upgrades';
	import type { SimState } from './simulate';
	import { roleOf } from './roles';
	import type { Loadout } from './types';
	import UpgradeDialog from './UpgradeDialog.svelte';
	import UpgradeTitle from './UpgradeTitle.svelte';
	import { btn } from './sim/ui';
	import { CATEGORY_LABELS, buildUpgrades, topDistinct, type Upgrade } from './upgrades';

	let {
		loadout,
		limit = 5,
		onapply,
		simState,
		simBase,
		currentCp
	}: { loadout: Loadout; limit?: number; simState?: SimState; simBase?: SimState; currentCp?: number; /** Returns false when it couldn't be applied. */ onapply?: (u: Upgrade) => boolean } = $props();

	/** Brief feedback on the row just applied. */
	let flash = $state<{ key: string; ok: boolean } | null>(null);
	let flashTimer: ReturnType<typeof setTimeout>;
	function apply(u: Upgrade) {
		const ok = onapply?.(u) ?? false;
		flash = { key: u.key, ok };
		clearTimeout(flashTimer);
		flashTimer = setTimeout(() => (flash = null), 1200);
	}

	const upgrades = $derived(buildUpgrades(loadout, [...honingUpgrades(loadout), ...bracerUpgrades(loadout, simState, simBase)]));
	const cp = $derived(currentCp ?? loadout.combatPower?.score ?? roleOf(loadout).score(loadout.battlePoint.parts));
	let dialogOpen = $state(false);
</script>

<div class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
	<div class="flex flex-row items-center bg-black/10 px-3 py-2 font-bold">
		<div class="flex flex-row items-start">Next Upgrades</div>
	</div>
	{#if upgrades.length === 0}
		<p class="p-2 text-sm text-surface-300">No one-step upgrades found for this loadout.</p>
	{:else}
		<div class="grid gap-x-2 p-1 {onapply ? 'grid-cols-[1fr_max-content_max-content]' : 'grid-cols-[1fr_max-content]'}">
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
						{#if u.count > 1}<span class="block text-[11px] text-surface-400">each</span>{/if}
					</span>
					{#if onapply}
						<button type="button" class="{btn} w-14 px-1.5" onclick={() => apply(u)} title="Make this change in the simulator">
							{flash?.key === u.key ? (flash.ok ? '✓' : 'Done') : 'Apply'}
						</button>
					{/if}
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
	<UpgradeDialog {upgrades} {cp} onapply={onapply ? apply : undefined} {flash} onclose={() => (dialogOpen = false)} />
{/if}
