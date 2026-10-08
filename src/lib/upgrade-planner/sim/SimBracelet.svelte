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
	/** Stat-coded lines are keyed "type:index" (type 2 = a stat by index; 54 / 59 = Ally Enhancement, index ignored). */
	const statKey = (l: { type?: number; index: number }) => {
		const type = l.type ?? 2;
		return `${type}:${type === 54 || type === 59 ? 0 : l.index}`;
	};
	const parseKey = (key: string) => {
		const [type, index] = key.split(':').map(Number);
		return { type: type === 2 ? undefined : type, index };
	};

	// Stat lines: Vitality, the main stat and the six combat stats; the value is rolled freely.
	const STAT_NAMES: Record<string, string> = {
		'2:15': 'Crit',
		'2:16': 'Specialization',
		'2:18': 'Swiftness',
		'2:17': 'Domination',
		'2:19': 'Endurance',
		'2:20': 'Expertise',
		'2:6': 'Vitality'
	};
	// 3 / 4 / 5 are Strength / Dexterity / Intelligence; 11 is all three, which bracelets roll as the class's main stat.
	const isMainStat = (key: string) => ['2:3', '2:4', '2:5', '2:11'].includes(key);
	const statName = (key: string) => (isMainStat(key) ? mainStatName : (STAT_NAMES[key] ?? 'Other stat'));
	const STAT_CHOICES = ['2:15', '2:16', '2:18', '2:17', '2:19', '2:20', '2:11', '2:6'];
	/** A typical T4 roll, used when a line switches to this stat. */
	const DEFAULT_VALUE: Record<string, number> = { '2:11': 12000, '2:6': 4000 };

	/**
	 * Effect lines bible stores as stats: each rolls one of three values [game]. Percent lines are in 1/100 %.
	 * Together with the special effects below they make up the bracelet's effect lines.
	 */
	const STAT_EFFECTS: Record<string, { name: string; values: number[]; percent: boolean }> = {
		'2:74': { name: 'Crit Rate', values: [340, 420, 500], percent: true },
		'2:76': { name: 'Crit Damage', values: [680, 840, 1000], percent: true },
		'2:50': { name: 'Additional Damage', values: [300, 350, 400], percent: true },
		'54:0': { name: 'Ally Atk. Power Enhancement Effect', values: [400, 500, 600], percent: true },
		'59:0': { name: 'Ally Damage Enhancement Effect', values: [600, 750, 900], percent: true },
		'2:151': { name: 'Weapon Power', values: [7200, 8100, 9000], percent: false },
		'2:27': { name: 'Max HP', values: [11200, 14000, 16800], percent: false },
		'2:55': { name: 'Physical Defense', values: [5000, 6000, 7000], percent: false },
		'2:56': { name: 'Magic Defense', values: [5000, 6000, 7000], percent: false },
		'2:34': { name: 'HP Recovery in Combat', values: [100, 130, 160], percent: false },
		'2:149': { name: 'Mana Recovery', values: [800, 1000, 1200], percent: true }
	};
	const isStatEffect = (l: BraceletLine): l is StatLine => l.kind === 'stat' && !!STAT_EFFECTS[statKey(l)];
	const statEffectLabel = (key: string, v: number) => {
		const e = STAT_EFFECTS[key];
		return `${e.name} +${e.percent ? `${Number((v / 100).toFixed(2))}%` : v.toLocaleString()}`;
	};
	/** Picker value of a stat-coded effect line: "stat:<type>:<index>:<value>". */
	const statEffectValue = (l: StatLine) => `stat:${statKey(l)}:${l.value}`;
	const lineFromValue = (v: string): BraceletLine => {
		if (!v.startsWith('stat:')) return { kind: 'effect', key: v };
		const [, type, index, value] = v.split(':');
		return { kind: 'stat', ...parseKey(`${type}:${index}`), value: Number(value) };
	};
	/** How the line shows: stat-coded effects count as effects. */
	const kindOf = (l: BraceletLine): BraceletLine['kind'] => (isStatEffect(l) ? 'effect' : l.kind);
	const look = $derived(itemLook(itemId));

	/** "Outgoing Damage +3%." → short label for the family heading. */
	const shortText = (t: string) => (t.length > 70 ? `${t.slice(0, 68)}…` : t);
	// Dealers and supports roll the same effects but score them differently; supports list their own table.
	// Only current (T4) effects are offered.
	const EFFECTS = $derived((support ? SUPPORT_BRACELET_EFFECTS : BRACELET_EFFECTS).filter((e) => e.t4));
	const TIER_COLORS = [ROLL_COLORS.low, ROLL_COLORS.mid, ROLL_COLORS.high];
	const OPTIONS = $derived<PickOption[]>([
		...EFFECTS.toSorted((a, b) => a.family.localeCompare(b.family) || a.grade - b.grade).map((e) => ({
			value: e.key,
			label: shortText(e.text),
			color: GRADE_COLORS[e.grade] ?? ROLL_COLORS.none,
			group: 'Special effects'
		})),
		...Object.entries(STAT_EFFECTS).flatMap(([key, e]) =>
			e.values.toReversed().map((v, i) => ({
				value: `stat:${key}:${v}`,
				label: statEffectLabel(key, v),
				color: TIER_COLORS[2 - i],
				group: 'Stat effects'
			}))
		)
	]);
	// No duplicate lines: a stat, a stat effect or an effect family already on another line isn't offered.
	const FAMILY = $derived(new Map(EFFECTS.map((e) => [e.key, e.family])));
	const familyOf = (v: string) => (v.startsWith('stat:') ? v.split(':').slice(0, 3).join(':') : (FAMILY.get(v) ?? v));
	const otherLines = (i: number) => sim.bracelet!.lines.filter((_, j) => j !== i);
	const usedStats = (i: number) => new Set(otherLines(i).flatMap((l) => (l.kind === 'stat' ? [statKey(l)] : [])));
	const usedFamilies = (i: number) =>
		new Set(
			otherLines(i).flatMap((l) => (l.kind === 'effect' ? [familyOf(l.key)] : isStatEffect(l) ? [familyOf(statEffectValue(l))] : []))
		);
	const statChoices = (i: number, current: string) => {
		const used = usedStats(i);
		return [...new Set([current, ...STAT_CHOICES])].filter((k) => k === current || !used.has(k));
	};
	const effectValue = (l: BraceletLine) => (l.kind === 'effect' ? l.key : isStatEffect(l) ? statEffectValue(l) : '');
	const optionsFor = (i: number, current: string): PickOption[] => {
		const used = usedFamilies(i);
		const free = OPTIONS.filter((o) => o.value === current || !used.has(familyOf(String(o.value))));
		if (free.some((o) => o.value === current)) return free;
		// The line's own value when it isn't one of the listed rolls (or an older effect).
		const [, type, index, value] = current.split(':');
		const label = current.startsWith('stat:')
			? statEffectLabel(`${type}:${index}`, Number(value))
			: `Other (no ${support ? 'support' : 'DPS'} value)`;
		return [...free, { value: current, label, color: ROLL_COLORS.none, group: 'Current' }];
	};

	type Kind = BraceletLine['kind'];
	const KINDS: { value: Kind; label: string; title: string }[] = [
		{ value: 'stat', label: 'Stat', title: 'A stat line: Crit, Specialization, Swiftness, Domination, Endurance, Expertise, main stat or Vitality' },
		{ value: 'effect', label: 'Effect', title: 'An effect line (Crit Rate, Weapon Power, Outgoing Damage, ...)' },
		{ value: 'empty', label: '—', title: 'No line' }
	];

	/** Switching a line's kind restores what it had at the start (if no other line has taken it since). */
	function setKind(i: number, kind: Kind) {
		const before = base.bracelet?.lines[i];
		const taken =
			(before?.kind === 'stat' && usedStats(i).has(statKey(before))) ||
			(before && kindOf(before) === 'effect' && usedFamilies(i).has(familyOf(effectValue(before))));
		if (before && kindOf(before) === kind && !taken) sim.bracelet!.lines[i] = structuredClone($state.snapshot(before));
		else if (kind === 'stat') {
			const key = STAT_CHOICES.find((k) => !usedStats(i).has(k)) ?? '2:15';
			sim.bracelet!.lines[i] = { kind, ...parseKey(key), value: DEFAULT_VALUE[key] ?? 100 };
		} else if (kind === 'effect') {
			const v = OPTIONS.find((o) => !usedFamilies(i).has(familyOf(String(o.value))))?.value ?? OPTIONS[0].value;
			sim.bracelet!.lines[i] = lineFromValue(String(v));
		} else sim.bracelet!.lines[i] = { kind };
	}
	/** Picking another stat keeps the value unless the scale differs (main stat / Vitality vs combat stats). */
	function setStat(i: number, line: StatLine, key: string) {
		const scale = (k: string) => DEFAULT_VALUE[k] ?? 100;
		sim.bracelet!.lines[i] = { kind: 'stat', ...parseKey(key), value: scale(key) === scale(statKey(line)) ? line.value : scale(key) };
	}
	const sameLine = (a?: BraceletLine, b?: BraceletLine) => JSON.stringify(a) === JSON.stringify(b);
</script>

{#if sim.bracelet}
	<SimCard title="Bracelet" {delta} info="Each of the five lines can be a stat, an effect, or empty.">
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
							value={kindOf(line)}
							options={KINDS}
							onselect={(k) => setKind(i, k)}
							label={`Bracelet line ${i + 1} type`}
							size="h-8 min-w-9 px-1.5 text-xs"
						/>
						{#if kindOf(line) === 'effect'}
							<LinePicker
								value={effectValue(line)}
								options={optionsFor(i, effectValue(line))}
								label={`Bracelet line ${i + 1} effect`}
								changed={!sameLine(before, line)}
								onpick={(v) => (sim.bracelet!.lines[i] = lineFromValue(v))}
								preview={(v) => preview((s) => (s.bracelet!.lines[i] = lineFromValue(v)))}
							/>
						{:else if line.kind === 'stat'}
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
									<Stepper
										bind:value={line.value}
										min={0}
										max={99999}
										changed={!sameLine(before, line)}
										label={`${statName(statKey(line))} value`}
										width={line.value >= 10000 ? 'w-14' : 'w-10'}
									/>
								</span>
							</span>
						{:else}
							<span class="text-xs text-surface-500">No line</span>
						{/if}
					</div>
				{/each}
			</div>
		</div>
	</SimCard>
{/if}
