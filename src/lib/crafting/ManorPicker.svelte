<script lang="ts">
	import MenuPicker from '$lib/upgrade-planner/sim/MenuPicker.svelte';
	import type { MenuOption } from '$lib/upgrade-planner/sim/ui';
	import { iconUrl } from '$lib/upgrade-planner/icons';
	import { MANOR_EQUIPMENT, effectLabel, equipLabel, matchesManorScope, rankManorEquipment, withManorEquipment, type ManorSetup } from './manor';
	let { setup = $bindable(), kind, slot, category, goal }: { setup: ManorSetup; kind: 'structures' | 'outfits'; slot: number; category: string; goal: 'cost' | 'time' } = $props();
	const current = $derived(MANOR_EQUIPMENT.find(item => item.id === setup[kind][slot]));
	const ranked = $derived(rankManorEquipment(setup, category, kind, slot, goal));
	const options: MenuOption<string>[] = $derived([
		...ranked.map(({ item, totals, applies }, index) => ({ value: item.id, label: equipLabel(item),
			iconUrl: item.icon ? item.kind === 'outfit' ? `https://lostarkcodex.com/icons/${item.icon.toLowerCase()}.webp` : iconUrl(item.icon) : undefined,
			marker: index === 0 && applies ? '#facc15' : '', muted: !applies,
			suffix: setup.owned.includes(item.id) ? { label: '· owned', color: '#94a3b8' } : undefined,
			detail: { label: `−${totals[goal]}% ${goal === 'cost' ? 'gold' : 'time'}`, color: applies ? '#fcd34d' : '#94a3b8' },
			title: item.effects.map(effect => `${effect.scope}: ${effectLabel(effect)}`).join('; ') })),
		{ value: '', label: 'None' }
	]);
</script>

<div class="rounded-xs border border-surface-700 bg-surface-950 p-2">
	<p class="mb-2 text-[11px] text-surface-400">{kind === 'structures' ? 'Structure' : 'Outfit'} {slot + 1}</p>
	<MenuPicker value={current?.id ?? ''} {options} label={`${kind === 'structures' ? 'Structure' : 'Outfit'} slot ${slot + 1}`} alwaysSearch full fitMenu onpick={id => { setup = withManorEquipment(setup, kind, slot, id); }}>
		{#snippet trigger()}<span class="min-w-0 truncate text-xs">{current ? equipLabel(current) : 'Search and select…'}</span>{/snippet}
	</MenuPicker>
	{#if current}<div class="mt-2 space-y-0.5 text-[11px] text-surface-300">{#each current.effects as effect}<p class={matchesManorScope(effect.scope, category) ? 'text-amber-200' : 'text-surface-500'}>{effect.scope === 'General' ? '' : `[${effect.scope}] `}{effectLabel(effect)}</p>{/each}</div>{/if}
</div>
