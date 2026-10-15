<script lang="ts">
	import { MANOR_EQUIPMENT, effectLabel, equipLabel, manorTotals, suggestManor, type ManorSetup } from './manor';
	import { iconUrl } from '$lib/upgrade-planner/icons';
	import { btn, btnAccent } from '$lib/upgrade-planner/sim/ui';
	let { setup = $bindable(), category }: { setup: ManorSetup; category: string } = $props();
	let goal = $state<'cost' | 'time'>('cost');
	let ownedOnly = $state(false);
	const totals = $derived(manorTotals(setup, category));
	const suggestion = $derived(suggestManor(setup, category, goal, ownedOnly));
	const suggested = $derived([...suggestion.structures, ...suggestion.outfits].filter(Boolean).map((id) => MANOR_EQUIPMENT.find((e) => e.id === id)!));
	const suggestedTotals = $derived(manorTotals(suggestion, category));
	function equip(kind: 'structures' | 'outfits', slot: number, id: string) {
		const selected = MANOR_EQUIPMENT.find((e) => e.id === id);
		setup[kind] = Array.from({ length: setup.slots }, (_, i) => i === slot ? id : setup[kind][i] === id || (selected?.npc && MANOR_EQUIPMENT.find((e) => e.id === setup[kind][i])?.npc === selected.npc) ? '' : setup[kind][i] ?? '');
	}
	function setBase(key: 'baseCost' | 'baseTime' | 'baseEnergy', value: string) { setup[key] = Math.max(0, Math.min(30, Number(value) || 0)); }
</script>

<p class="mb-3 text-xs text-surface-400">Verified catalog · {MANOR_EQUIPMENT.filter((e) => e.kind === 'structure').length} structures · {MANOR_EQUIPMENT.filter((e) => e.kind === 'outfit').length} outfits. One outfit per NPC.</p>
<div class="mb-3 flex flex-wrap items-center justify-between gap-2"><h2 class="font-semibold">Manor</h2><label class="flex items-center gap-2 text-xs text-surface-300">Slots per type<select class="manor-select w-14" bind:value={setup.slots} aria-label="Manor slots per type">{#each [1, 2, 3, 4] as count}<option value={count}>{count}</option>{/each}</select></label></div>
<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
	{#each ['structures', 'outfits'] as kind}
		{@const type = kind as 'structures' | 'outfits'}
		<div><h3 class="mb-2 text-xs font-semibold text-surface-200">{type === 'structures' ? 'Structures' : 'Outfits'}</h3>
			{#each Array.from({ length: setup.slots }) as _, slot}
				{@const current = MANOR_EQUIPMENT.find((e) => e.id === setup[type][slot])}
				<div class="mb-2 rounded-xs border border-surface-700 bg-surface-950 p-2">
					<div class="flex min-w-0 items-center gap-2">
						{#if current?.icon}<img src={current.kind === 'outfit' ? `https://lostarkcodex.com/icons/${current.icon.toLowerCase()}.webp` : iconUrl(current.icon)} alt="" class="size-9 shrink-0 rounded-xs border border-white/20 bg-accent-700/20" />{:else}<span class="flex size-9 shrink-0 items-center justify-center rounded-full border border-surface-600 text-xs text-surface-400">{current ? '◆' : slot + 1}</span>{/if}
						<select class="manor-select min-w-0 flex-1" value={current?.id ?? ''} onchange={(e) => equip(type, slot, e.currentTarget.value)} aria-label={`${type === 'structures' ? 'Structure' : 'Outfit'} slot ${slot + 1}`}><option value="">None</option>{#each MANOR_EQUIPMENT.filter((e) => e.kind === (type === 'structures' ? 'structure' : 'outfit')) as item}<option value={item.id}>{equipLabel(item)}</option>{/each}</select>
					</div>
					{#if current}<div class="mt-2 space-y-0.5 text-[11px] text-surface-300">{#each current.effects as effect}<p class={effect.scope === 'General' || effect.scope === category || (category === 'Farm (Bound)' && effect.scope === 'Special') ? 'text-amber-200' : 'text-surface-500'}>{effect.scope === 'General' ? '' : `[${effect.scope}] `}{effectLabel(effect)}</p>{/each}</div>{/if}
				</div>
			{/each}
		</div>
	{/each}
</div>
<div class="mt-2 rounded-xs border border-surface-700 bg-black/15 p-3 text-xs">
	<h3 class="mb-2 font-semibold text-surface-100">Stronghold effects · {category}</h3>
	<div class="grid grid-cols-1 gap-1 sm:grid-cols-2"><p>Crafting cost <b class="text-amber-300">−{totals.general.cost}%</b> <span class="text-surface-500">/ 30%</span></p><p>[{category}] Cost <b class="text-amber-300">−{totals.specific.cost}%</b> <span class="text-surface-500">/ 10%</span></p><p>Crafting time <b class="text-surface-100">−{totals.general.time}%</b></p><p>[{category}] Time <b class="text-surface-100">−{totals.specific.time}%</b></p></div>
	<p class="mt-2 border-t border-surface-700 pt-2">Applied: <b class="text-amber-300">−{totals.cost}% gold</b> · −{totals.time}% time · −{totals.energy}% energy</p>
	{#if totals.successBonus}<p class="mt-1 text-surface-400">Great success bonus +{totals.successBonus}% · relative bonus, not actual proc chance.</p>{/if}
</div>
<details class="mt-3"><summary class="text-xs text-surface-200">Research & other bonuses</summary><div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">{#each [{ key: 'baseCost', name: 'General cost' }, { key: 'baseTime', name: 'General time' }, { key: 'baseEnergy', name: 'General energy' }] as field}<label class="text-xs text-surface-300">{field.name} (%)<input type="number" min="0" max="30" step="0.1" class="manor-select mt-1 w-full" value={setup[field.key as 'baseCost']} oninput={(e) => setBase(field.key as 'baseCost' | 'baseTime' | 'baseEnergy', e.currentTarget.value)} aria-label={`${field.name} reduction percent`} /></label>{/each}</div><p class="mt-2 text-xs text-surface-400">Research, pets, aura, and other general bonuses. Do not repeat effects already equipped above.</p></details>
<div class="mt-4 border-t border-surface-700 pt-3">
	<div class="flex flex-wrap items-center justify-between gap-2"><h3 class="text-sm font-semibold">Suggested setup</h3><label class="flex items-center gap-1.5 text-xs text-surface-300"><input type="checkbox" bind:checked={ownedOnly} class="accent-amber-400" />Owned only</label></div>
	<div class="mt-2 flex flex-wrap gap-1.5"><button type="button" class={goal === 'cost' ? btnAccent : btn} onclick={() => goal = 'cost'}>Lowest cost</button><button type="button" class={goal === 'time' ? btnAccent : btn} onclick={() => goal = 'time'}>Fastest</button></div>
	{#if suggested.length}<div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">{#each ['structure', 'outfit'] as kind}<div class="space-y-1 text-xs">{#each suggested.filter((item) => item.kind === kind) as item}<p class={setup.owned.includes(item.id) ? 'text-surface-100' : 'text-surface-300'}>{equipLabel(item)}{#if !setup.owned.includes(item.id)} <span class="text-amber-300">· not owned</span>{/if}</p>{/each}</div>{/each}</div><div class="mt-3 flex items-center justify-between gap-2"><span class="text-xs text-amber-300">−{suggestedTotals.cost}% gold · −{suggestedTotals.time}% time</span><button type="button" class={btn} onclick={() => { setup.structures = [...suggestion.structures]; setup.outfits = [...suggestion.outfits]; }}>Use suggestion</button></div>{:else}<p class="mt-3 text-xs text-surface-400">Mark your owned effects below to find a setup.</p>{/if}
</div>
<details class="mt-3 border-t border-surface-700 pt-3"><summary class="text-xs text-surface-200">Collection · {setup.owned.length}/{MANOR_EQUIPMENT.length} owned</summary><div class="mt-2 space-y-2">{#each MANOR_EQUIPMENT as item}<label class="flex items-start gap-2 rounded-xs border border-surface-800 p-2"><input type="checkbox" class="mt-1 accent-amber-400" checked={setup.owned.includes(item.id)} onchange={(e) => setup.owned = e.currentTarget.checked ? [...setup.owned, item.id] : setup.owned.filter((id) => id !== item.id)} /><span class="min-w-0 text-xs"><b class="font-semibold">{equipLabel(item)}</b><span class="mt-0.5 block text-surface-400">{item.acquisition}</span><span class="mt-1 block text-surface-300">{item.effects.map((effect) => `${effect.scope === 'General' ? 'All crafts' : effect.scope}: ${effectLabel(effect)}`).join('; ')}</span></span></label>{#if item.source.startsWith('https://')}<a href={item.source} target="_blank" rel="noopener noreferrer" class="ml-7 inline-block text-[11px] text-surface-400 underline hover:text-surface-100" aria-label={`View source for ${equipLabel(item)}`}>View source ↗</a>{/if}{/each}</div></details>

<style>
	.manor-select { height: 2rem; border: 1px solid var(--color-surface-600); border-radius: 2px; background: var(--color-surface-950); padding: 0 .375rem; font-size: .75rem; color: var(--color-surface-100); }
	.manor-select:focus { outline: 1px solid var(--color-accent-500); }
</style>
