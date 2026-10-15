<script lang="ts">
	import { MANOR_EQUIPMENT, MANOR_SCOPES, effectLabel, equipLabel, manorTotals, rankManorEquipment, suggestManor, type ManorSetup } from './manor';
	import ManorPicker from './ManorPicker.svelte';
	import MenuPicker from '$lib/upgrade-planner/sim/MenuPicker.svelte';
	import { btn, btnAccent, type MenuOption } from '$lib/upgrade-planner/sim/ui';
	let { setup = $bindable(), category }: { setup: ManorSetup; category: string } = $props();
	let goal = $state<'cost' | 'time'>('cost');
	let ownedOnly = $state(false);
	const goals = [{ key: 'cost', label: 'Lowest fee' }, { key: 'time', label: 'Fastest queue' }] as const;
	const totals = $derived(manorTotals(setup, category));
	const recommendations = $derived(goals.map(target => {
		const selection = suggestManor(setup, category, target.key, ownedOnly);
		return { ...target, selection, totals: manorTotals(selection, category), items: [...selection.structures, ...selection.outfits].filter(Boolean).map(id => MANOR_EQUIPMENT.find(item => item.id === id)!) };
	}));
	const collectionOptions: MenuOption<string>[] = $derived([
		...rankManorEquipment(setup, category, 'structures', 0, goal),
		...rankManorEquipment(setup, category, 'outfits', 0, goal)
	].filter(({ item }) => !setup.owned.includes(item.id)).map(({ item, applies }) => ({ value: item.id, label: equipLabel(item), muted: !applies,
		title: item.effects.map(effect => `${effect.scope}: ${effectLabel(effect)}`).join('; ') })));
	function setBase(key: 'baseCost' | 'baseTime' | 'baseEnergy', value: string) { setup[key] = Math.max(0, Math.min(30, Number(value) || 0)); }
</script>

<div class="mb-3 flex flex-wrap items-center justify-between gap-3">
	<div><h3 class="font-semibold">Recommended combinations · {category}</h3><p class="mt-1 text-xs text-surface-400">Best among listed equipment, using your slots and other bonuses.</p></div>
	<label class="flex items-center gap-2 text-xs text-surface-300">Slots per type<select class="manor-select w-14" bind:value={setup.slots} aria-label="Manor slots per type">{#each [1, 2, 3, 4] as count}<option value={count}>{count}</option>{/each}</select></label>
</div>
<label class="mb-3 flex items-center gap-2 text-xs text-surface-300"><input type="checkbox" bind:checked={ownedOnly} class="accent-amber-400" />Recommend owned equipment only</label>
<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
	{#each recommendations as recommendation (recommendation.key)}
		<section class="rounded-xs border border-surface-600 bg-surface-950/50 p-3" aria-label={`${recommendation.label} recommendation`}>
			<div class="flex flex-wrap items-center justify-between gap-2"><h4 class="text-sm font-semibold {recommendation.key === 'cost' ? 'text-amber-200' : 'text-sky-200'}">{recommendation.label}</h4><span class="text-xs text-surface-200">−{recommendation.totals.cost}% gold · −{recommendation.totals.time}% time</span></div>
			<div class="mt-3 grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
				{#each ['structure', 'outfit'] as kind}
					<div><p class="mb-1.5 text-[11px] text-surface-400">{kind === 'structure' ? 'Structures' : 'Outfits'}</p><ul class="space-y-1.5">{#each recommendation.items.filter(item => item.kind === kind) as item}<li>{equipLabel(item)}</li>{:else}<li class="text-surface-500">None needed</li>{/each}</ul></div>
				{/each}
			</div>
			<div class="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-surface-700 pt-3"><span class="text-[11px] text-surface-400">{ownedOnly ? 'Uses marked owned equipment' : `${recommendation.items.filter(item => !setup.owned.includes(item.id)).length} not marked owned`}</span><button type="button" class={btnAccent} disabled={!recommendation.items.length} aria-label={`Apply ${recommendation.label.toLowerCase()} setup`} onclick={() => { setup.structures = [...recommendation.selection.structures]; setup.outfits = [...recommendation.selection.outfits]; goal = recommendation.key; }}>Apply setup</button></div>
		</section>
	{/each}
</div>
<div class="mt-5 mb-3 flex flex-wrap items-center justify-between gap-2"><h3 class="text-sm font-semibold">Your equipped effects</h3><label class="flex items-center gap-2 text-xs text-surface-300">Rank choices by<select class="manor-select" bind:value={goal} aria-label="Rank manor choices by"><option value="cost">Lowest fee</option><option value="time">Fastest queue</option></select></label></div>
<p class="mb-3 text-xs text-surface-400">Search a slot to replace it. Best fits appear first; percentages preview the resulting full setup. One outfit per NPC.</p>
<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
	{#each ['structures', 'outfits'] as kind}
		{@const type = kind as 'structures' | 'outfits'}
		<div class="space-y-2"><h4 class="text-xs font-semibold text-surface-200">{type === 'structures' ? 'Structures' : 'Outfits'}</h4>
			{#each Array.from({ length: setup.slots }) as _, slot}<ManorPicker bind:setup kind={type} {slot} {category} {goal} />{/each}
		</div>
	{/each}
</div>
<div class="mt-2 rounded-xs border border-surface-700 bg-black/15 p-3 text-xs">
	<h3 class="mb-2 font-semibold text-surface-100">Stronghold effects · {category}</h3>
	<div class="grid grid-cols-1 gap-1 sm:grid-cols-2"><p>Crafting cost <b class="text-amber-300">−{totals.general.cost}%</b> <span class="text-surface-500">/ 30%</span></p><p>[{category}] Cost <b class="text-amber-300">−{totals.specific.cost}%</b> <span class="text-surface-500">/ 10%</span></p><p>Crafting time <b class="text-surface-100">−{totals.general.time}%</b></p><p>[{category}] Time <b class="text-surface-100">−{totals.specific.time}%</b></p></div>
	<p class="mt-2 border-t border-surface-700 pt-2">Applied: <b class="text-amber-300">−{totals.cost}% gold</b> · −{totals.time}% time · −{totals.energy}% energy</p>
	{#if totals.successBonus}<p class="mt-1 text-surface-400">Great success tooltips: General +{totals.general.success}% · [{category}] +{totals.specific.success}%. Actual proc chance is entered separately.</p>{/if}
</div>
<details class="mt-3"><summary class="text-xs text-surface-200">Research & other bonuses</summary><div class="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">{#each [{ key: 'baseCost', name: 'General cost' }, { key: 'baseTime', name: 'General time' }, { key: 'baseEnergy', name: 'General energy' }] as field}<label class="text-xs text-surface-300">{field.name} (%)<input type="number" min="0" max="30" step="0.1" class="manor-select mt-1 w-full" value={setup[field.key as 'baseCost']} oninput={(e) => setBase(field.key as 'baseCost' | 'baseTime' | 'baseEnergy', e.currentTarget.value)} aria-label={`${field.name} reduction percent`} /></label>{/each}</div><p class="mt-2 text-xs text-surface-400">Research, pets, aura, and other general bonuses. Do not repeat effects already equipped above.</p></details>
<details class="mt-3 border-t border-surface-700 pt-3">
	<summary class="text-xs text-surface-200">Pets & collectible effects <span class="text-surface-400">· {setup.extraEffects.length} added</span></summary>
	<p class="mt-3 text-xs text-surface-400">Enter active crafting bonuses using their tooltip scope. Exclude dispatch, gathering and combat effects; do not repeat bonuses entered elsewhere.</p>
	<div class="mt-3 space-y-3">
		{#each setup.extraEffects as effect, index}
			<div class="rounded-xs border border-surface-700 p-3">
				<div class="flex items-end gap-2">
					<label class="min-w-0 flex-1 text-xs text-surface-300">Source<input type="text" maxlength="80" class="manor-select mt-1 w-full" placeholder="e.g. Dock pet" bind:value={effect.name} aria-label={`Extra effect ${index + 1} source`} /></label>
					<button type="button" class={btn} onclick={() => setup.extraEffects = setup.extraEffects.filter((_, i) => i !== index)} aria-label={`Remove extra effect ${index + 1}`}>×</button>
				</div>
				<label class="mt-2 block text-xs text-surface-300">Applies to<select class="manor-select mt-1 w-full" bind:value={effect.scope} aria-label={`Extra effect ${index + 1} scope`}>{#each MANOR_SCOPES as scope}<option value={scope}>{scope === 'General' ? 'All crafting' : scope}</option>{/each}</select></label>
				<div class="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
					{#each [{ key: 'cost', name: 'Cost −%' }, { key: 'time', name: 'Time −%' }, { key: 'energy', name: 'Energy −%' }, { key: 'success', name: 'Success bonus +%' }] as field}
						<label class="min-w-0 text-xs text-surface-300">{field.name}<input type="number" min="0" max="30" step="0.1" class="manor-select mt-1 w-full" value={effect[field.key as 'cost'] ?? 0} oninput={e => effect[field.key as 'cost' | 'time' | 'energy' | 'success'] = Math.max(0, Math.min(30, Number(e.currentTarget.value) || 0))} aria-label={`Extra effect ${index + 1} ${field.key} percent`} /></label>
					{/each}
				</div>
			</div>
		{/each}
	</div>
	<button type="button" class={`${btn} mt-3`} disabled={setup.extraEffects.length >= 20} onclick={() => setup.extraEffects = [...setup.extraEffects, { name: '', scope: 'General', cost: 0, time: 0, energy: 0, success: 0 }]}>Add crafting effect</button>
</details>
<details class="mt-4 border-t border-surface-700 pt-3">
	<summary class="text-xs text-surface-200">Owned equipment · {setup.owned.length} marked</summary>
	<p class="mt-3 mb-2 text-xs text-surface-400">Mark equipment you own to filter the recommendations.</p>
	<MenuPicker value="" options={collectionOptions} label="Owned manor equipment" alwaysSearch full fitMenu onpick={id => setup.owned = [...new Set([...setup.owned, id])]}>
		{#snippet trigger()}<span class="min-w-0 truncate text-xs">Search equipment to mark owned…</span>{/snippet}
	</MenuPicker>
	<div class="mt-3 flex flex-wrap gap-2">{#each setup.owned as id (id)}{@const item = MANOR_EQUIPMENT.find(item => item.id === id)}{#if item}<span class="flex items-center gap-2 rounded-xs border border-surface-600 bg-surface-950 px-2 py-1 text-xs">{equipLabel(item)}<button type="button" class="px-1 text-surface-400 hover:text-surface-100" aria-label={`Unmark ${equipLabel(item)} as owned`} onclick={() => setup.owned = setup.owned.filter(value => value !== id)}>×</button></span>{/if}{/each}</div>
</details>

<style>
	.manor-select { height: 2rem; border: 1px solid var(--color-surface-600); border-radius: 2px; background: var(--color-surface-950); padding: 0 .375rem; font-size: .75rem; color: var(--color-surface-100); }
	.manor-select:focus { outline: 1px solid var(--color-accent-500); }
</style>
