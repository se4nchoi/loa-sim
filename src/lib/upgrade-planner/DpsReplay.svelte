<script lang="ts">
	import type { SavedStatValues } from '$lib/logs/stat-values-store.svelte';
	import { replayStats, type HitContext } from './dps-replay';
	import { estimateDps } from './dps-estimate';
	import { simulate, type SimState } from './simulate';
	import { formatPct } from './format';
	import type { Loadout } from './types';
	let { loadout, simState, simBase, saved }: { loadout: Loadout; simState: SimState; simBase: SimState; saved: SavedStatValues } = $props();
	let enabled = $state(false);
	let supportAttack = $state(0);
	let flatAttack = $state(0);
	let attackPct = $state(0);
	let additionalDamage = $state(0);
	let critCap = $state(100);
	let critRate = $state<number | undefined>();
	let critMultiplier = $state<number | undefined>();
	const baseStats = $derived(simulate(loadout,simBase,simBase));
	const baseAttackPct = $derived(Number(loadout.battlePoint.parts.find(p => p.type === 1)?.attackPowerMultiplier ?? 0));
	const estimate = $derived(estimateDps(loadout,simBase,simState,simBase,saved.values));
	const result = $derived.by(() => {
		if (!enabled || !estimate.statDelta) return null;
		return replayStats(saved.sample?.runs ?? [],estimate.statDelta,(run,hit): HitContext => {
			const skill = run.skills.find(s => s.id === hit.skill);
			return { mainStat:baseStats.mainStat, weaponPower:baseStats.weaponPower, baseAttackPct:baseAttackPct/100,
				flatAttack, supportAttack, attackPowerPct:attackPct/100, additionalDamage:additionalDamage/100,
				critRate:critRate === undefined ? (skill?.hits ? skill.crits/skill.hits : 0) : critRate/100,
				critMultiplier:critMultiplier ?? run.effectiveCritMultiplier ?? 2, critCap:critCap/100 };
		});
	});
	const field = 'w-24 rounded-xs border border-surface-600 bg-surface-800 px-2 py-1 text-surface-100';
</script>

<details class="mt-3 border-t border-surface-700 pt-2">
	<summary class="cursor-pointer text-sm font-semibold text-sky-300">Per-hit stat replay experiment</summary>
	<p class="mt-2 text-xs text-amber-300">The database omits per-hit stat totals, crit multipliers and overcap crit rates. This comparison uses snapshot totals and the assumptions below. It does not replace the meter estimate or calculate unbuffed nDPS.</p>
	{#if !saved.sample?.runs.some(r => r.hits.length)}
		<p class="mt-2 text-sm text-surface-300">Reimport your logs to load hit data for replay.</p>
	{:else}
		<label class="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" bind:checked={enabled} />Compare using these assumptions</label>
		<p class="mt-1 text-xs text-surface-400">Main stat {Math.round(baseStats.mainStat).toLocaleString()} · Weapon Power {Math.round(baseStats.weaponPower).toLocaleString()} · base attack bonus {baseAttackPct.toFixed(2)}%, from the snapshot. Support/flat attack and other buckets below are constant across hits.</p>
		<div class="mt-2 flex flex-wrap gap-3 text-xs">
			<label class="flex flex-col gap-1">Support flat attack<input class={field} type="number" min="0" bind:value={supportAttack} /></label>
			<label class="flex flex-col gap-1">Own flat attack<input class={field} type="number" min="0" bind:value={flatAttack} /></label>
			<label class="flex flex-col gap-1">Atk. Power bucket %<input class={field} type="number" min="0" bind:value={attackPct} /></label>
			<label class="flex flex-col gap-1">Additional Damage bucket %<input class={field} type="number" min="0" bind:value={additionalDamage} /></label>
			<label class="flex flex-col gap-1">Crit cap %<input class={field} type="number" min="0" max="100" bind:value={critCap} /></label>
			<label class="flex flex-col gap-1">Assumed crit rate %<input class={field} type="number" min="0" placeholder="Observed" bind:value={critRate} /></label>
			<label class="flex flex-col gap-1">Full crit multiplier<input class={field} type="number" min="1" step="0.01" placeholder="Run effective" bind:value={critMultiplier} /></label>
		</div>
		<p class="mt-2 text-xs text-surface-400">Blank crit rate uses each skill's observed hit rate; this cannot reveal hidden overcap. Blank multiplier uses the run's aggregate all-crits / no-crits ratio (2× if absent). Crit-rate replay caps expected gain at the assumed cap; it does not model Blunt Thorn's overcap conversion. Untracked damage stays unchanged.</p>
		{#if result && result.gainPct !== null}
			<p class="mt-2 text-sm font-semibold text-sky-300">Stat replay under assumptions: {formatPct(result.gainPct!)}% · meter marginal estimate: {estimate.statPct === null ? 'unavailable' : `${formatPct(estimate.statPct)}%`}</p>
			<p class="mt-1 text-xs text-surface-300">{result.runs} replayed run{result.runs === 1 ? '' : 's'} · {result.coveragePct.toFixed(1)}% hit coverage · range {formatPct(result.minPct!)}% to {formatPct(result.maxPct!)}%. Gem skill and cooldown effects are excluded from this comparison.</p>
		{:else if enabled}
			<p class="mt-2 text-sm text-amber-300">Replay unavailable: check the assumed totals and hit coverage.</p>
		{/if}
	{/if}
</details>
