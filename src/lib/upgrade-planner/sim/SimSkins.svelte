<script lang="ts">
	import type { SimState } from '../simulate';
	import { iconUrl, itemLook } from '../icons';
	import { setSkinPart, skinParts } from '../skins';
	import ItemIcon from './ItemIcon.svelte';
	import SimCard from './SimCard.svelte';
	import { btn, btnAccent, selectClass, type SectionDelta } from './ui';

	let { sim = $bindable(), base, delta, mainStatName, itemIds }: {
		sim: SimState; base: SimState; delta: SectionDelta; mainStatName: string; itemIds: Record<string, number>;
	} = $props();
	const bonuses = Array.from({ length: 17 }, (_, i) => i / 2);
	const current = $derived(base.skins.bonus ?? sim.skins.currentBonus);
	const pieces = [
		{ label: 'Head', slot: 'head', fallback: 'Shop_icon_3064' },
		{ label: 'Chest', slot: 'upper_body', fallback: 'Shop_icon_3065' },
		{ label: 'Pants', slot: 'lower_body', fallback: 'Shop_icon_3066' },
		{ label: 'Weapon', slot: 'weapon', fallback: 'shop_icon_2666' }
	];
	const parts = $derived(skinParts(sim.skins));
	function setCurrent(value: string) {
		sim.skins.currentBonus = value === '' ? null : Number(value);
		if (sim.skins.bonus === null) sim.skins.bonus = sim.skins.currentBonus;
	}
</script>

<SimCard title="Skins" {delta} info="Weapon, head, chest and pants skins add main stat: Rare +0.5%, Epic +1%, Legendary +2% per piece. Four Legendary pieces give +8%. Other cosmetic bonuses are preserved. The imported total also includes skins worn underneath appearance overrides.">
	{#snippet actions()}
		<button type="button" class={btnAccent} onclick={() => (sim.skins = { ...sim.skins, bonus: 8, parts: [2, 2, 2, 2] })} title="All four pieces legendary (+8%)">Max</button>
		<button type="button" class={btn} onclick={() => (sim.skins = { ...base.skins })}>Reset</button>
	{/snippet}
	<div class="flex flex-wrap items-end gap-3">
		<div class="flex flex-col gap-1 text-xs text-surface-400">
			<span>Current {mainStatName} bonus</span>
			{#if base.skins.bonus === null}
				<select class={selectClass(false)} value={sim.skins.currentBonus ?? ''} onchange={(e) => setCurrent(e.currentTarget.value)} aria-label="Current skin bonus">
					<option value="">Select current bonus</option>
					{#each bonuses as bonus}<option value={bonus}>+{bonus}%</option>{/each}
				</select>
			{:else}<span class="flex h-8 items-center text-sm font-semibold text-surface-200">+{base.skins.bonus}%</span>{/if}
		</div>
		<label class="flex flex-col gap-1 text-xs text-surface-400">
			Simulated {mainStatName} bonus
			<select class={selectClass(sim.skins.bonus !== base.skins.bonus)} value={sim.skins.bonus ?? ''} onchange={(e) => (sim.skins = { ...sim.skins, bonus: e.currentTarget.value === '' ? null : Number(e.currentTarget.value), parts: e.currentTarget.value === '4' ? [1, 1, 1, 1] : undefined })} aria-label="Simulated skin bonus">
				{#if sim.skins.bonus === null}<option value="">Select bonus</option>{/if}
				{#each bonuses as bonus}<option value={bonus}>+{bonus}%{bonus === 8 ? ' · All legendary' : bonus === 4 ? ' · All epic' : ''}</option>{/each}
			</select>
		</label>
	</div>
	<div class="mt-3 grid grid-cols-2 gap-3 max-[380px]:grid-cols-1">
		{#each pieces as piece, i}
			{@const bonus = parts[i]}
			<div class="flex min-w-0 items-start gap-2 rounded-xs bg-black/15 p-2">
				<ItemIcon src={itemLook(itemIds[piece.slot]).icon ?? iconUrl(piece.fallback)} grade={bonus === 2 ? 4 : bonus === 1 ? 3 : bonus === 0.5 ? 2 : 0} size="size-11" badge={bonus === null ? '?' : `+${bonus}%`} title={`${piece.label} skin slot`} />
				<label class="flex min-w-0 flex-1 flex-col gap-1 text-xs text-surface-400">
					{piece.label}
					<select class={selectClass(bonus !== skinParts(base.skins)[i])} style:font-size="0.75rem" value={bonus === null ? '' : String(bonus)} onchange={(e) => (sim.skins = setSkinPart(sim.skins, i, Number(e.currentTarget.value)))} aria-label={`${piece.label} skin`}>
						{#if bonus === null}<option value="" disabled>Unknown</option>{/if}
						<option value="0">None · 0%</option>
						<option value="0.5">Rare · +0.5%</option>
						<option value="1">Epic · +1%</option>
						<option value="2">Legendary · +2%</option>
					</select>
				</label>
			</div>
		{/each}
	</div>
	{#if parts.some((p) => p === null)}
		<p class="mt-2 text-xs text-surface-400">Individual grades aren't available from the imported total. Select all four pieces to use their combined bonus, or set the simulated total above.</p>
	{/if}
	{#if current === null}
		<p class="mt-2 text-xs text-surface-400">This snapshot has no skin stat total. Set your current bonus to calculate the CP change.</p>
	{/if}
</SimCard>
