<script lang="ts">
	import { untrack } from 'svelte';
	import { damageFactor, perStatGains, type DamageContext } from './dps-stat-engine';
	import { simulate, type SimState } from './simulate';
	import { baseAttackOf } from './dps-explain';
	import { bracerStats } from './bracer';
	import type { Loadout } from './types';
	let {loadout, base, characterKey, oncontext}: {loadout: Loadout; base: SimState; characterKey: string;
		oncontext: (c: DamageContext | null) => void} = $props();
	let values = $state<Partial<Record<keyof DamageContext, number>>>({});
	let enabled = $state(false);
	let loaded = $state(false);
	let conversion = $state<{enabled: boolean; threshold?: number; ratio?: number; maximum?: number}>({enabled: false});
	const key = $derived.by(() => {
		const source = JSON.stringify([loadout.battlePoint, base]);
		let hash = 2166136261;
		for (let i = 0; i < source.length; i++) hash = Math.imul(hash ^ source.charCodeAt(i), 16777619) >>> 0;
		return `loa-sim:dps-context:v2:${characterKey}:${hash.toString(36)}`;
	});
	$effect(() => {
		const k = key;
		untrack(() => {
			values = {}; enabled = false; conversion = {enabled: false};
			try {
				const saved = JSON.parse(localStorage.getItem(k) ?? 'null');
				if (saved?.values && typeof saved.values === 'object') values = Object.fromEntries(Object.entries(saved.values)
					.filter(([name, v]) => fields.some(([field]) => field === name) && typeof v === 'number' && Number.isFinite(v))) as typeof values;
				if (saved?.conversion?.enabled === true) conversion = {enabled: true,
					...Object.fromEntries(['threshold', 'ratio', 'maximum'].flatMap((name) => typeof saved.conversion[name] === 'number' && Number.isFinite(saved.conversion[name]) ? [[name, saved.conversion[name]]] : []))};
			} catch { /* this visit only */ }
			loaded = true;
		});
	});
	const stats = $derived(simulate(loadout, base, base));
	const defaults = $derived({mainStat: stats.mainStat, weaponPower: stats.weaponPower, baseAttackPct: baseAttackOf(loadout, base),
		baseAttackFlat: bracerStats(base.bracer).attackFlat, flatAttack: 0, supportAttack: 0, critCap: 100});
	const context = $derived({...defaults, ...values, ...(conversion.enabled ? {critConversion: {
		threshold: (conversion.threshold ?? NaN) / 100, ratio: conversion.ratio ?? NaN, maxBonus: (conversion.maximum ?? NaN) / 100}} : {})} as DamageContext);
	const valid = $derived(damageFactor(context) !== null);
	const gains = $derived(valid ? perStatGains(context) : []);
	$effect(() => { oncontext(enabled && valid ? $state.snapshot(context) : null); });
	$effect(() => {
		if (!loaded) return;
		try { localStorage.setItem(key, JSON.stringify({values, conversion})); } catch { /* inputs remain usable */ }
	});
	const fields = [
		['mainStat', 'Main stat', 'flat'], ['weaponPower', 'Weapon Power', 'flat'], ['baseAttackPct', 'Base Atk. Power', '%'],
		['attackPowerPct', 'Atk. Power', '%'], ['baseAttackFlat', 'Flat Basic Atk. Power', 'flat'], ['flatAttack', 'Flat Atk. Power', 'flat'], ['supportAttack', 'Fixed support attack', 'flat'],
		['additionalDamage', 'Additional Damage', '%'], ['evolutionDamage', 'Evolution Damage', '%'],
		['critRate', 'Crit Rate', '%'], ['critDamage', 'Total Crit Damage', '%'], ['critCap', 'Crit cap', '%']
	] as const;
	function valueOf(name: keyof DamageContext) { return values[name] ?? defaults[name as keyof typeof defaults]; }
</script>

<!-- Folded until the player has entered totals, so a first visit leads with the log import. -->
<details class="mb-3 rounded-xs border border-surface-700 bg-surface-900 p-3" open={Object.keys(values).length > 0}>
	<summary class="cursor-pointer text-sm font-semibold text-surface-100">Per-stat damage gains <span class="font-normal text-surface-400">· no logs required</span></summary>
	<p class="mt-2 text-xs text-surface-300">Enter the baseline build's combat totals. Main stat, Weapon Power, gems and bracer bonuses start from the loaded gear. Other totals include your passives and active buffs.</p>
	<div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
		{#each fields as [name, label, unit] (name)}
			<label class="text-xs text-surface-300">{label}{unit === '%' ? ' (%)' : ''}
				<input class="mt-1 w-full rounded-xs border border-surface-600 bg-surface-800 px-2 py-1 text-sm text-surface-100 tabular-nums" type="number" step="any" value={valueOf(name) ?? ''} placeholder="Required" oninput={(e) => {
					const value = e.currentTarget.valueAsNumber;
					if (Number.isFinite(value)) values[name] = value; else delete values[name];
				}} />
			</label>
		{/each}
	</div>
	<p class="mt-2 text-xs text-surface-400">Total Crit Damage: 200% means ×2. Support attack defaults to 0 and is held fixed when upgrading. Conditional effects need the matching combat totals.</p>
	<label class="mt-2 flex items-center gap-2 text-xs text-surface-300"><input type="checkbox" bind:checked={conversion.enabled} /> Crit-to-evolution conversion (e.g. Blunt Thorn)</label>
	{#if conversion.enabled}
		<div class="mt-2 grid grid-cols-3 gap-2 text-xs text-surface-300">
			<label>Crit threshold (%)<input class="mt-1 w-full border border-surface-600 bg-surface-800 p-1" type="number" min="0" max="100" step="any" bind:value={conversion.threshold} /></label>
			<label>Evolution pp per excess crit pp<input class="mt-1 w-full border border-surface-600 bg-surface-800 p-1" type="number" min="0" step="any" bind:value={conversion.ratio} /></label>
			<label>Max evolution bonus (%)<input class="mt-1 w-full border border-surface-600 bg-surface-800 p-1" type="number" min="0" step="any" bind:value={conversion.maximum} /></label>
		</div>
		<p class="mt-1 text-xs text-surface-400">Use your passive's values. Evolution Damage above excludes this conversion bonus; Crit Rate includes uncapped crit.</p>
	{/if}
	{#if valid}
		<div class="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-3">
			{#each gains as gain (gain.key)}<div class="flex justify-between gap-2"><span class="text-surface-300">+{gain.amount.toLocaleString()} {gain.label}{gain.amount === 1 ? ' pp' : ''}</span><strong class="text-sky-300 tabular-nums">{gain.gainPct === null ? 'Unknown' : `+${gain.gainPct.toFixed(4)}%`}</strong></div>{/each}
		</div>
	{:else}<p class="mt-2 text-xs text-amber-300">Complete valid combat totals to calculate per-stat gains.</p>{/if}
	<label class="mt-3 flex items-center gap-2 text-xs text-surface-100"><input type="checkbox" bind:checked={enabled} disabled={!valid} /> Use these totals for upgrade estimates</label>
	{#if enabled && valid}<p class="mt-1 text-xs text-surface-400">Relative damage under these assumptions. Logs supply observed DPS when selected; without logs, no absolute DPS is predicted. Gem and build changes still need their own models.</p>{/if}
</details>
