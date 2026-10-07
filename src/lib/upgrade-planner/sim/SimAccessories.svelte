<script lang="ts">
	import { itemLook } from '../icons';
	import { ACCESSORY_SLOTS, familyOf, isOtherLine, type AccessorySlot, type SimLine, type SimState } from '../simulate';
	import { ACCESSORY_LINES, ACCESSORY_MAIN_STAT_RANGE, TIERS, formatLineValue, type Tier } from '../tables';
	import ItemIcon from './ItemIcon.svelte';
	import LinePicker from './LinePicker.svelte';
	import SimCard from './SimCard.svelte';
	import { ROLL_COLORS, linkButtonClass, selectClass, type PickOption, type PreviewEdit, type SectionDelta } from './ui';

	let {
		sim = $bindable(),
		base,
		delta,
		itemIds,
		mainStatName,
		preview
	}: {
		sim: SimState;
		base: SimState;
		delta: SectionDelta;
		itemIds: Record<string, number>;
		mainStatName: string;
		preview: PreviewEdit;
	} = $props();

	const LABELS: Record<AccessorySlot, string> = {
		neck: 'Necklace',
		ear1: 'Earring',
		ear2: 'Earring',
		finger1: 'Ring',
		finger2: 'Ring'
	};
	const TIER_LABEL: Record<Tier, string> = { low: 'Low', mid: 'Mid', high: 'High' };
	const slots = $derived(ACCESSORY_SLOTS.filter((s) => sim.accessories[s]));

	const encode = (ln: SimLine) => (isOtherLine(ln) ? 'other' : `${ln.key}:${ln.tier}`);
	const decode = (v: string, previous: SimLine): SimLine => {
		if (v === 'other') return isOtherLine(previous) ? previous : { key: 'other', label: 'Other (no DPS value)' };
		const [key, tier] = v.split(':');
		return { key, tier: tier as Tier };
	};

	/** Lines this slot can roll, minus types already on its other lines (a type can't appear twice). */
	function optionsFor(slot: AccessorySlot, current: SimLine, index: number): PickOption[] {
		const taken = new Set(sim.accessories[slot]!.filter((ln, i) => i !== index && !isOtherLine(ln)).map((ln) => ln.key));
		const out: PickOption[] = [];
		for (const line of ACCESSORY_LINES.filter((l) => l.slots.includes(familyOf(slot)) && !taken.has(l.key)))
			for (const t of TIERS.toReversed())
				out.push({
					value: `${line.key}:${t}`,
					label: `${line.name} ${formatLineValue(line, line.values[t])}`,
					color: ROLL_COLORS[t],
					group: line.primary ? 'DPS lines' : 'Any accessory'
				});
		out.push({
			value: 'other',
			label: isOtherLine(current) ? current.label : 'Other (no DPS value)',
			color: ROLL_COLORS.none,
			group: 'Other'
		});
		return out;
	}

	/** Both main DPS lines at High, replacing non-DPS or flat lines first. */
	function maxDps(slot: AccessorySlot) {
		const lines = sim.accessories[slot]!;
		for (const p of ACCESSORY_LINES.filter((l) => l.primary && l.slots.includes(familyOf(slot)))) {
			const existing = lines.findIndex((ln) => ln.key === p.key);
			if (existing >= 0) {
				lines[existing] = { key: p.key, tier: 'high' };
				continue;
			}
			const replace = lines.findIndex((ln) => isOtherLine(ln) || !ACCESSORY_LINES.find((l) => l.key === ln.key)?.primary);
			if (replace >= 0) lines[replace] = { key: p.key, tier: 'high' };
		}
	}
	const tierWord = (ln: SimLine) => (isOtherLine(ln) ? 'no DPS value' : TIER_LABEL[ln.tier]);
</script>

<SimCard title="Accessories" {delta}>
	<div class="flex flex-col divide-y divide-neutral-950">
		{#each slots as slot (slot)}
			{@const look = itemLook(itemIds[slot])}
			{@const range = ACCESSORY_MAIN_STAT_RANGE[familyOf(slot)]}
			<div class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
				<ItemIcon src={look.icon} grade={look.grade} title={look.name} />
				<div class="flex min-w-0 flex-col gap-1">
					<div class="flex flex-row flex-wrap items-center gap-x-3 gap-y-1">
						<span class="text-sm font-semibold">{LABELS[slot]}</span>
						{#if sim.accessoryStats[slot] !== undefined}
							<label class="flex flex-row items-center gap-1 text-xs text-surface-300">
								{mainStatName}
								<input
									type="number"
									min={range.min}
									max={range.max}
									step="1"
									class="{selectClass(sim.accessoryStats[slot] !== base.accessoryStats[slot])} w-24 text-right"
									bind:value={sim.accessoryStats[slot]}
								/>
								<span class="text-surface-500">{range.min.toLocaleString()}–{range.max.toLocaleString()}</span>
							</label>
						{/if}
						<button type="button" class="ml-auto text-xs {linkButtonClass}" onclick={() => maxDps(slot)}>Max DPS lines</button>
					</div>
					<div class="grid grid-cols-3 gap-x-2 max-md:grid-cols-1">
						{#each sim.accessories[slot]! as ln, i (i)}
							{@const before = base.accessories[slot]?.[i]}
							<LinePicker
								value={encode(ln)}
								options={optionsFor(slot, ln, i)}
								label={`${LABELS[slot]} line ${i + 1}: ${tierWord(ln)}`}
								changed={!before || encode(before) !== encode(ln)}
								onpick={(v) => (sim.accessories[slot]![i] = decode(v, ln))}
								preview={(v) => preview((s) => (s.accessories[slot]![i] = decode(v, ln)))}
							/>
						{/each}
					</div>
				</div>
			</div>
		{/each}
	</div>
	<p class="mt-2 text-xs text-surface-400">
		Line colors follow lostark.bible: <span style:color={ROLL_COLORS.high}>High</span>,
		<span style:color={ROLL_COLORS.mid}>Mid</span>, <span style:color={ROLL_COLORS.low}>Low</span>. Open a line to see
		what each alternative would do to your CP. ≈ Weapon Power lines are estimated.
	</p>
</SimCard>
