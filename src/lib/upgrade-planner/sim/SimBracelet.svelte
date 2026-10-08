<script lang="ts">
	import { getContext } from 'svelte';
	import { BRACELET_EFFECTS } from '../game-data';
	import { itemLook } from '../icons';
	import type { RoleTables } from '../roles';
	import type { BraceletLine, SimState } from '../simulate';
	import { SUPPORT_BRACELET_EFFECTS } from '../support-data';
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

	const role = getContext<() => RoleTables>('loa-sim:role');
	const support = $derived(role().support);

	type StatLine = Extract<BraceletLine, { kind: 'stat' }>;
	/** Stat lines are keyed "type:index": type 2 = plain stat by index; 54 / 59 = Ally Atk. Power / Damage Enhancement %. */
	const statKey = (l: { type?: number; index: number }) => `${l.type ?? 2}:${l.index}`;
	const STAT_NAMES: Record<string, string> = {
		'2:6': 'Vitality',
		'2:15': 'Crit',
		'2:16': 'Specialization',
		'2:17': 'Domination',
		'2:18': 'Swiftness',
		'2:19': 'Endurance',
		'2:20': 'Expertise',
		'2:50': 'Additional Damage %',
		'2:74': 'Crit Rate %',
		'2:76': 'Crit Damage %',
		'54:0': 'Ally Atk. Power Enh. %',
		'59:0': 'Ally Damage Enh. %'
	};
	/** Lines stored in 1/100 % (500 = +5%); shown and edited as percents. */
	const PERCENT = new Set(['2:50', '2:74', '2:76', '54:0', '59:0']);
	// 3 / 4 / 5 are Strength / Dexterity / Intelligence; 11 is all three, which bracelets roll as the class's main stat.
	const statName = (key: string) => (['2:3', '2:4', '2:5', '2:11'].includes(key) ? mainStatName : (STAT_NAMES[key] ?? 'Other stat'));
	const STAT_CHOICES = $derived([
		'2:15', '2:16', '2:18', '2:17', '2:19', '2:20', '2:11', '2:6',
		// % lines: Crit Rate / Crit Damage / Additional Damage, and for supports the Ally Enhancement lines.
		'2:74', '2:76', '2:50',
		...(support ? ['54:0', '59:0'] : [])
	]);
	/** A typical T4 roll, used when a line switches to this stat. */
	const DEFAULT_VALUE: Record<string, number> = { '2:11': 12000, '2:6': 4000, '2:74': 400, '2:76': 800, '2:50': 300, '54:0': 400, '59:0': 600 };
	const parseKey = (key: string) => {
		const [type, index] = key.split(':').map(Number);
		return { type: type === 2 ? undefined : type, index };
	};
	const look = $derived(itemLook(itemId));

	/** "Outgoing Damage +3%." → short label for the family heading. */
	const shortText = (t: string) => (t.length > 70 ? `${t.slice(0, 68)}…` : t);
	// Dealers and supports roll the same effects but score them differently; supports list their own table.
	const EFFECTS = $derived(support ? SUPPORT_BRACELET_EFFECTS : BRACELET_EFFECTS);
	const OPTIONS = $derived<PickOption[]>(
		EFFECTS.toSorted((a, b) => Number(b.t4) - Number(a.t4) || a.family.localeCompare(b.family) || a.grade - b.grade).map((e) => ({
			value: e.key,
			label: shortText(e.text),
			color: GRADE_COLORS[e.grade] ?? ROLL_COLORS.none,
			group: e.t4 ? 'T4 bracelet effects' : 'Older effects'
		}))
	);
	// No duplicate lines: a stat or an effect family already on another line isn't offered.
	const FAMILY = $derived(new Map(EFFECTS.map((e) => [e.key, e.family])));
	const otherLines = (i: number) => sim.bracelet!.lines.filter((_, j) => j !== i);
	const usedStats = (i: number) => new Set(otherLines(i).flatMap((l) => (l.kind === 'stat' ? [statKey(l)] : [])));
	const usedFamilies = (i: number) =>
		new Set(otherLines(i).flatMap((l) => (l.kind === 'effect' ? [FAMILY.get(l.key) ?? l.key] : [])));
	const statChoices = (i: number, current: string) => {
		const used = usedStats(i);
		return [...new Set([current, ...STAT_CHOICES])].filter((k) => k === current || !used.has(k));
	};
	const optionsFor = (i: number, key: string): PickOption[] => {
		const used = usedFamilies(i);
		const free = OPTIONS.filter((o) => o.value === key || !used.has(FAMILY.get(String(o.value))!));
		return free.some((o) => o.value === key)
			? free
			: [...free, { value: key, label: `Other (no ${support ? 'support' : 'DPS'} value)`, color: ROLL_COLORS.none, group: 'Other' }];
	};

	type Kind = BraceletLine['kind'];
	const KINDS: { value: Kind; label: string; title: string }[] = [
		{ value: 'stat', label: 'Stat', title: 'A stat line (Crit, Strength, Vitality, ...)' },
		{ value: 'effect', label: 'Effect', title: 'A special effect line (Crit Rate, Outgoing Damage, ...)' },
		{ value: 'empty', label: '—', title: 'No line' }
	];

	/** Switching a line's kind restores what it had at the start (if no other line has taken it since). */
	function setKind(i: number, kind: Kind) {
		const before = base.bracelet?.lines[i];
		const taken =
			(before?.kind === 'stat' && usedStats(i).has(statKey(before))) ||
			(before?.kind === 'effect' && usedFamilies(i).has(FAMILY.get(before.key) ?? before.key));
		if (before?.kind === kind && !taken) sim.bracelet!.lines[i] = structuredClone($state.snapshot(before));
		else if (kind === 'stat') {
			const key = STAT_CHOICES.find((k) => !usedStats(i).has(k)) ?? '2:15';
			sim.bracelet!.lines[i] = { kind, ...parseKey(key), value: DEFAULT_VALUE[key] ?? 100 };
		} else if (kind === 'effect') {
			const key = OPTIONS.find((o) => !usedFamilies(i).has(FAMILY.get(String(o.value))!))?.value ?? OPTIONS[0].value;
			sim.bracelet!.lines[i] = { kind, key: String(key) };
		} else sim.bracelet!.lines[i] = { kind };
	}
	/** Picking another stat keeps the value unless the scale differs (main stat / Vitality / % lines vs combat stats). */
	function setStat(i: number, line: StatLine, key: string) {
		const scale = (k: string) => DEFAULT_VALUE[k] ?? 100;
		sim.bracelet!.lines[i] = { kind: 'stat', ...parseKey(key), value: scale(key) === scale(statKey(line)) ? line.value : scale(key) };
	}
	const sameLine = (a?: BraceletLine, b?: BraceletLine) => JSON.stringify(a) === JSON.stringify(b);
</script>

{#if sim.bracelet}
	<SimCard title="Bracelet" {delta} info="Each of the five lines can be a stat, a special effect, or empty.">
		{#snippet actions()}
			<button type="button" class={btn} onclick={() => (sim.bracelet = structuredClone($state.snapshot(base.bracelet)))}>Reset</button>
		{/snippet}
		<div class="grid grid-cols-[max-content_1fr] gap-x-3 rounded-xs bg-black/15 p-2.5">
			<ItemIcon src={look.icon} grade={look.grade} title={look.name} frame="leap" size="size-12" />
			<div class="flex min-w-0 flex-col gap-1.5">
				{#each sim.bracelet.lines as line, i (i)}
					{@const before = base.bracelet?.lines[i]}
					<div class="flex min-w-0 flex-row flex-wrap items-center gap-1.5">
						<Segmented
							value={line.kind}
							options={KINDS}
							onselect={(k) => setKind(i, k)}
							label={`Bracelet line ${i + 1} type`}
							size="h-8 min-w-9 px-1.5 text-xs"
						/>
						{#if line.kind === 'stat'}
							<span class="flex flex-row">
								<select
									class="{selectClass(before?.kind !== 'stat' || statKey(before) !== statKey(line))} rounded-r-none"
									value={statKey(line)}
									onchange={(e) => setStat(i, line, e.currentTarget.value)}
									aria-label={`Bracelet line ${i + 1} stat`}
								>
									{#each statChoices(i, statKey(line)) as k (k)}<option value={k}>{statName(k)}</option>{/each}
								</select>
								<span class="-ml-px">
									{#if PERCENT.has(statKey(line))}
										<Stepper
											bind:value={() => line.value / 100, (v) => (line.value = Math.round(v * 100))}
											min={0}
											max={100}
											step={0.1}
											suffix="%"
											changed={!sameLine(before, line)}
											label={`${statName(statKey(line))} value`}
											width="w-10"
										/>
									{:else}
										<Stepper
											bind:value={line.value}
											min={0}
											max={99999}
											changed={!sameLine(before, line)}
											label={`${statName(statKey(line))} value`}
											width={line.value >= 10000 ? 'w-14' : 'w-10'}
										/>
									{/if}
								</span>
							</span>
						{:else if line.kind === 'effect'}
							<LinePicker
								value={line.key}
								options={optionsFor(i, line.key)}
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
