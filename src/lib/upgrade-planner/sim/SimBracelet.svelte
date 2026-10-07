<script lang="ts">
	import { BRACELET_EFFECTS } from '../game-data';
	import { itemLook } from '../icons';
	import { COMBAT_STAT_INDICES, type SimState } from '../simulate';
	import ItemIcon from './ItemIcon.svelte';
	import LinePicker from './LinePicker.svelte';
	import SimCard from './SimCard.svelte';
	import { GRADE_COLORS, ROLL_COLORS, selectClass, type PickOption, type PreviewEdit, type SectionDelta } from './ui';

	let {
		sim = $bindable(),
		base,
		delta,
		itemId,
		mainStatName,
		preview
	}: {
		sim: SimState;
		base: SimState;
		delta: SectionDelta;
		itemId?: number;
		mainStatName: string;
		preview: PreviewEdit;
	} = $props();

	const STAT_NAMES: Record<number, string> = {
		15: 'Crit',
		16: 'Specialization',
		17: 'Domination',
		18: 'Swiftness',
		19: 'Endurance',
		20: 'Expertise',
		50: 'Additional Damage %',
		74: 'Crit Rate %',
		76: 'Crit Damage %'
	};
	const statName = (i: number) => (i === 3 || i === 4 || i === 5 ? mainStatName : (STAT_NAMES[i] ?? `Stat ${i}`));
	const statChoices = $derived([15, 16, 18, 17, 19, 20]);
	const look = $derived(itemLook(itemId));

	/** "Outgoing Damage +3%." → short label for the family heading. */
	const shortText = (t: string) => (t.length > 70 ? `${t.slice(0, 68)}…` : t);
	const OPTIONS: PickOption[] = [
		...BRACELET_EFFECTS.toSorted((a, b) => Number(b.t4) - Number(a.t4) || a.family.localeCompare(b.family) || a.grade - b.grade).map(
			(e) => ({
				value: e.key,
				label: shortText(e.text),
				color: GRADE_COLORS[e.grade] ?? ROLL_COLORS.none,
				group: e.t4 ? 'T4 bracelet effects' : 'Older effects'
			})
		)
	];
	const optionsFor = (key: string): PickOption[] =>
		OPTIONS.some((o) => o.value === key) ? OPTIONS : [...OPTIONS, { value: key, label: 'Other (no DPS value)', color: ROLL_COLORS.none, group: 'Other' }];
</script>

{#if sim.bracelet}
	<SimCard title="Bracelet" {delta}>
		<div class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-2">
			<ItemIcon src={look.icon} grade={look.grade} title={look.name} />
			<div class="flex min-w-0 flex-col gap-2">
				<div class="flex flex-row flex-wrap gap-2">
					{#each sim.bracelet.stats as st, i (i)}
						{@const before = base.bracelet?.stats[i]}
						<span class="flex flex-row">
							<select
								class="{selectClass(before?.index !== st.index)} rounded-r-none"
								bind:value={st.index}
								aria-label={`Bracelet stat ${i + 1}`}
							>
								{#each [...new Set([st.index, ...statChoices])] as idx (idx)}<option value={idx}>{statName(idx)}</option>{/each}
							</select>
							<input
								type="number"
								min="0"
								class="{selectClass(before?.value !== st.value)} -ml-px w-20 rounded-l-none text-right"
								bind:value={st.value}
								aria-label={`${statName(st.index)} value`}
							/>
						</span>
					{/each}
				</div>
				<div class="flex flex-col gap-1">
					{#each sim.bracelet.effects as key, i (i)}
						<LinePicker
							value={key}
							options={optionsFor(key)}
							label={`Bracelet effect ${i + 1}`}
							changed={base.bracelet?.effects[i] !== key}
							onpick={(v) => (sim.bracelet!.effects[i] = v)}
							preview={(v) => preview((s) => (s.bracelet!.effects[i] = v))}
						/>
					{/each}
				</div>
			</div>
		</div>
		<p class="mt-2 text-xs text-surface-400">
			Effect values are the game's own Combat Power weights. Only {COMBAT_STAT_INDICES.map(statName).join(', ')} count
			toward Combat Power ({3} per point); the colors show an effect's grade within its family.
		</p>
	</SimCard>
{/if}
