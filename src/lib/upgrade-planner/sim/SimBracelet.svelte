<script lang="ts">
	import { BRACELET_EFFECTS } from '../game-data';
	import { itemLook } from '../icons';
	import { BRACELET_STAT_LINES, type BraceletLine, type SimState } from '../simulate';
	import ItemIcon from './ItemIcon.svelte';
	import LinePicker from './LinePicker.svelte';
	import Segmented from './Segmented.svelte';
	import SimCard from './SimCard.svelte';
	import Stepper from './Stepper.svelte';
	import { GRADE_COLORS, ROLL_COLORS, btn, selectClass, type PickOption, type PreviewEdit, type SectionDelta } from './ui';

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
		6: 'Vitality',
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
	// 3 / 4 / 5 are Strength / Dexterity / Intelligence; 11 is all three, which bracelets roll as the class's main stat.
	const statName = (i: number) => (i === 3 || i === 4 || i === 5 || i === 11 ? mainStatName : (STAT_NAMES[i] ?? 'Other stat'));
	const STAT_CHOICES = [15, 16, 18, 17, 19, 20, 11, 6];
	/** A typical T4 roll, used when a line switches to this stat. */
	const defaultValue = (i: number) => (i === 11 ? 12000 : i === 6 ? 4000 : 100);
	const group = (i: number) => (i === 11 || (i >= 3 && i <= 5) ? 'main' : i === 6 ? 'vit' : 'other');
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

	type Kind = BraceletLine['kind'];
	const KINDS: { value: Kind; label: string; title: string }[] = [
		{ value: 'stat', label: 'Stat', title: 'A stat line (Crit, Strength, Vitality, ...)' },
		{ value: 'effect', label: 'Effect', title: 'A special effect line (Crit Rate, Outgoing Damage, ...)' },
		{ value: 'empty', label: '—', title: 'No line' }
	];

	/** Switching a line's kind keeps what that line had at the start when it was the same kind. */
	function setKind(i: number, kind: Kind) {
		const before = base.bracelet?.lines[i];
		if (before?.kind === kind) sim.bracelet!.lines[i] = structuredClone($state.snapshot(before));
		else if (kind === 'stat') sim.bracelet!.lines[i] = { kind, index: 15, value: defaultValue(15) };
		else if (kind === 'effect') sim.bracelet!.lines[i] = { kind, key: String(OPTIONS[0].value) };
		else sim.bracelet!.lines[i] = { kind };
	}
	function setIndex(line: Extract<BraceletLine, { kind: 'stat' }>, index: number) {
		if (group(index) !== group(line.index)) line.value = defaultValue(index);
		line.index = index;
	}
	const sameLine = (a?: BraceletLine, b?: BraceletLine) => JSON.stringify(a) === JSON.stringify(b);
</script>

{#if sim.bracelet}
	<SimCard title="Bracelet" {delta} info="Lines 1–2 are stat lines. Lines 3–5 can each roll a stat or a special effect.">
		{#snippet actions()}
			<button type="button" class={btn} onclick={() => (sim.bracelet = structuredClone($state.snapshot(base.bracelet)))}>Reset</button>
		{/snippet}
		<div class="grid grid-cols-[max-content_1fr] gap-x-3 rounded-xs bg-black/15 p-2.5">
			<ItemIcon src={look.icon} grade={look.grade} title={look.name} frame="leap" size="size-12" />
			<div class="flex min-w-0 flex-col gap-1.5">
				{#each sim.bracelet.lines as line, i (i)}
					{@const before = base.bracelet?.lines[i]}
					<div class="flex min-w-0 flex-row flex-wrap items-center gap-1.5 {i === BRACELET_STAT_LINES ? 'mt-1 border-t border-neutral-950 pt-2.5' : ''}">
						{#if i >= BRACELET_STAT_LINES}
							<Segmented
								value={line.kind}
								options={KINDS}
								onselect={(k) => setKind(i, k)}
								label={`Bracelet line ${i + 1} type`}
								size="h-8 min-w-9 px-1.5 text-xs"
							/>
						{/if}
						{#if line.kind === 'stat'}
							<span class="flex flex-row">
								<select
									class="{selectClass(before?.kind !== 'stat' || before.index !== line.index)} rounded-r-none"
									value={line.index}
									onchange={(e) => setIndex(line, Number(e.currentTarget.value))}
									aria-label={`Bracelet line ${i + 1} stat`}
								>
									{#each [...new Set([line.index, ...STAT_CHOICES])] as idx (idx)}<option value={idx}>{statName(idx)}</option>{/each}
								</select>
								<span class="-ml-px">
									<Stepper
										bind:value={line.value}
										min={0}
										max={99999}
										changed={!sameLine(before, line)}
										label={`${statName(line.index)} value`}
										width={line.value >= 10000 ? 'w-14' : 'w-10'}
									/>
								</span>
							</span>
						{:else if line.kind === 'effect'}
							<LinePicker
								value={line.key}
								options={optionsFor(line.key)}
								label={`Bracelet line ${i + 1} effect`}
								changed={!sameLine(before, line)}
								onpick={(v) => (sim.bracelet!.lines[i] = { kind: 'effect', key: v })}
								preview={(v) => preview((s) => (s.bracelet!.lines[i] = { kind: 'effect', key: v }))}
							/>
						{:else}
							<span class="text-xs text-surface-500">No line</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</SimCard>
{/if}
