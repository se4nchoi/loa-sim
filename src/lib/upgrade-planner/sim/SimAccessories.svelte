<script lang="ts">
	import { ACCESSORY_SLOTS, familyOf, isOtherLine, type AccessorySlot, type SimLine, type SimState } from '../simulate';
	import { ACCESSORY_LINES, TIERS, formatLineValue, type Tier } from '../tables';
	import SimCard from './SimCard.svelte';
	import { linkButtonClass, selectClass, type SectionDelta } from './ui';

	let { sim = $bindable(), base, delta }: { sim: SimState; base: SimState; delta: SectionDelta } = $props();

	const LABELS: Record<AccessorySlot, string> = {
		neck: 'Necklace',
		ear1: 'Earring 1',
		ear2: 'Earring 2',
		finger1: 'Ring 1',
		finger2: 'Ring 2'
	};
	const TIER_LABEL: Record<Tier, string> = { low: 'Low', mid: 'Mid', high: 'High' };
	const slots = $derived(ACCESSORY_SLOTS.filter((s) => sim.accessories[s]));

	const encode = (ln: SimLine) => (isOtherLine(ln) ? 'other' : `${ln.key}:${ln.tier}`);
	const decode = (v: string, previous: SimLine): SimLine => {
		if (v === 'other') return isOtherLine(previous) ? previous : { key: 'other', label: 'Other (no DPS value)' };
		const [key, tier] = v.split(':');
		return { key, tier: tier as Tier };
	};
	const optionsFor = (slot: AccessorySlot) => ACCESSORY_LINES.filter((l) => l.slots.includes(familyOf(slot)));

	/** Both main DPS lines at High, replacing non-DPS or flat lines first. */
	function maxDps(slot: AccessorySlot) {
		const lines = sim.accessories[slot]!;
		const primaries = ACCESSORY_LINES.filter((l) => l.primary && l.slots.includes(familyOf(slot)));
		for (const p of primaries) {
			const existing = lines.findIndex((ln) => ln.key === p.key);
			if (existing >= 0) {
				lines[existing] = { key: p.key, tier: 'high' };
				continue;
			}
			const replace = lines.findIndex((ln) => ln.key === 'other' || !ACCESSORY_LINES.find((l) => l.key === ln.key)?.primary);
			if (replace >= 0) lines[replace] = { key: p.key, tier: 'high' };
		}
	}
</script>

<SimCard title="Accessories" {delta}>
	<div class="grid grid-cols-[max-content_1fr] items-center gap-x-3 gap-y-2 max-md:grid-cols-1">
		{#each slots as slot (slot)}
			<div class="flex flex-row items-baseline gap-2 md:flex-col md:gap-0">
				<span class="text-sm text-surface-200">{LABELS[slot]}</span>
				<button type="button" class="text-xs {linkButtonClass}" onclick={() => maxDps(slot)}>Max DPS lines</button>
			</div>
			<div class="grid grid-cols-3 gap-1 max-sm:grid-cols-1">
				{#each sim.accessories[slot]! as ln, i (i)}
					{@const before = base.accessories[slot]?.[i]}
					<select
						class="{selectClass(!before || encode(before) !== encode(ln))} min-w-0"
						value={encode(ln)}
						onchange={(e) => (sim.accessories[slot]![i] = decode(e.currentTarget.value, ln))}
						aria-label={`${LABELS[slot]} line ${i + 1}`}
					>
						{#each optionsFor(slot) as line (line.key)}
							<optgroup label={line.name}>
								{#each TIERS.toReversed() as t (t)}
									<option value={`${line.key}:${t}`}>{line.name} {formatLineValue(line, line.values[t])} · {TIER_LABEL[t]}</option>
								{/each}
							</optgroup>
						{/each}
						<option value="other">{isOtherLine(ln) ? ln.label : 'Other (no DPS value)'}</option>
					</select>
				{/each}
			</div>
		{/each}
	</div>
	<p class="mt-2 text-xs text-surface-400">≈ Weapon Power lines change base attack and are estimated.</p>
</SimCard>
