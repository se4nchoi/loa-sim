<script lang="ts">
	import { getContext } from 'svelte';
	import { gemDpsGainPct } from '../dps';
	import type { RoleTables } from '../roles';
	import { formatPct } from '../format';
	import { GEM_SKILL_GROUPS, GEM_SKILLS, ITEMS } from '../game-data';
	import { iconUrl, itemLook } from '../icons';
	import type { GemKind, GemPart, SimState } from '../simulate';
	import ItemIcon from './ItemIcon.svelte';
	import LogsImport from './LogsImport.svelte';
	import MenuPicker from './MenuPicker.svelte';
	import SimCard from './SimCard.svelte';
	import Stepper from './Stepper.svelte';
	import { btn, btnAccent, type MenuOption, type SectionDelta } from './ui';

	let {
		sim = $bindable(),
		base,
		gems,
		delta,
		characterName
	}: { sim: SimState; base: SimState; gems: GemPart[]; delta: SectionDelta; characterName?: string } = $props();

	const KINDS: GemKind[] = ['damage', 'cooldown'];
	const GEM_INFO = [
		`Combat Power counts every gem the same. The DPS estimate weighs each gem by its skill:`,
		`• DPS gain = skill damage share × gem effect. Damage gems raise the skill's damage; cooldown gems add casts.`,
		`• CD use: how much of the fight the skill spends on cooldown (LOA Logs records it). At 100% every second saved becomes casts; the lower it is, the less a cooldown gem helps (0% = the skill always waits on your rotation). Blank counts as 100%.`,
		`• Enter damage shares by hand from your logs or a combat analyzer, or load your LOA Logs database to use your average shares.`,
		`• Logs can include older builds or settings (e.g. Night's Edge before switching to Full Moon Harvester), so pick a range that matches your current build.`
	].join('\n');
	const editable = $derived(gems.map((g, i) => ({ g, i })).filter(({ g }) => g.table));

	/**
	 * One row per skill with its damage and cooldown gem side by side. Built from the loaded gems so rows don't
	 * jump around while editing; highest gem level first, then damage before cooldown.
	 */
	const rows = $derived.by(() => {
		const bySkill = new Map<string, { skill: number | null; slots: Partial<Record<GemKind, number>>; extra: number[] }>();
		for (const { i } of editable) {
			const g = base.gems[i];
			const key = g.skill === null ? `none-${i}` : String(g.skill);
			const row = bySkill.get(key) ?? { skill: g.skill, slots: {}, extra: [] };
			if (row.slots[g.kind] === undefined) row.slots[g.kind] = i;
			else row.extra.push(i);
			bySkill.set(key, row);
		}
		const levelOf = (i: number | undefined) => (i === undefined ? 0 : base.gems[i].level);
		return [...bySkill.values()].sort(
			(a, b) =>
				Math.max(levelOf(b.slots.damage), levelOf(b.slots.cooldown)) - Math.max(levelOf(a.slots.damage), levelOf(a.slots.cooldown)) ||
				levelOf(b.slots.damage) - levelOf(a.slots.damage) ||
				levelOf(b.slots.cooldown) - levelOf(a.slots.cooldown)
		);
	});

	/**
	 * Gem item id for a tier/kind/level: 650[tier][1 dmg|2 cd][level 2 digits][bound digit]. Brilliant gems (6504)
	 * don't encode the kind; their icon is the same either way. Falls back to the unbound id when the bound one
	 * isn't in the item table.
	 */
	const gemId = (id: number, kind: GemKind, level: number) => {
		const brilliant = Math.floor(id / 10000) % 10 === 4;
		const kindDigit = brilliant ? Math.floor(id / 1000) % 10 : kind === 'damage' ? 1 : 2;
		const unbound = Math.floor(id / 10000) * 10000 + kindDigit * 1000 + level * 10;
		return ITEMS[unbound + (id % 10)] ? unbound + (id % 10) : unbound;
	};

	// The character's class is whatever class its gem skills belong to.
	const classKey = $derived(sim.gems.map((g) => (g.skill ? GEM_SKILLS[g.skill]?.[2] : undefined)).find(Boolean));
	const SKILL_OPTIONS = $derived.by<MenuOption<number>[]>(() => {
		const inUse = new Set(base.gems.map((g) => g.skill));
		const byName = new Map<string, MenuOption<number>>();
		for (const [id, s] of Object.entries(GEM_SKILLS)) {
			// Regular combat skills, plus any skill a gem already sits on (e.g. incarnation skills).
			if (s[2] !== classKey || !(s[3] === 1 || inUse.has(Number(id)))) continue;
			// One entry per name (some skills have several ids); keep the id the gems use.
			const prev = byName.get(s[0]);
			if (prev && (inUse.has(prev.value) || !inUse.has(Number(id)))) continue;
			byName.set(s[0], { value: Number(id), label: s[0], iconUrl: iconUrl(s[1]) });
		}
		return [...byName.values()];
	});
	/** The picker entry for a skill: the one with the same name. */
	const optionOf = (id: number | null) =>
		SKILL_OPTIONS.find((o) => o.value === id || (id !== null && o.label === GEM_SKILLS[id]?.[0]))?.value ?? 0;
	/** Shares from logs are per skill; a gem on a skill group gets the sum of the group's skills. */
	/** Per-skill values from logs, for a gem on a skill group: shares add up; cooldown use takes the busiest skill. */
	const withGroups = (values: Record<number, number>, combine: 'sum' | 'max' = 'sum') => {
		const out = { ...values };
		for (const g of sim.gems) {
			const members = g.skill !== null ? GEM_SKILL_GROUPS[g.skill] : undefined;
			if (!members || out[g.skill!] !== undefined) continue;
			const known = members.filter((m) => values[m] !== undefined).map((m) => values[m]);
			if (!known.length) continue;
			const v = combine === 'sum' ? known.reduce((a, x) => a + x, 0) : Math.max(...known);
			if (v > 0) out[g.skill!] = Number(v.toFixed(2));
		}
		return out;
	};
	const skillName = (id: number | null) => (id ? (GEM_SKILLS[id]?.[0] ?? `Skill ${id}`) : 'Unknown skill');

	const rowGems = (r: (typeof rows)[number]) => [r.slots.damage, r.slots.cooldown, ...r.extra].filter((i): i is number => i !== undefined);
	const setRowSkill = (r: (typeof rows)[number], skill: number) => rowGems(r).forEach((i) => (sim.gems[i].skill = skill));
	/** The gem currently sitting in a row's slot (a gem can be moved to the other slot by switching its kind). */
	const inSlot = (r: (typeof rows)[number], kind: GemKind) => rowGems(r).find((i) => sim.gems[i].kind === kind);

	const setAll = (fn: (current: number) => number) =>
		editable.forEach(({ i }) => (sim.gems[i].level = Math.min(10, Math.max(1, fn(sim.gems[i].level)))));
	const gemChanged = (i: number) => JSON.stringify(sim.gems[i]) !== JSON.stringify(base.gems[i]);

	const dps = $derived(gemDpsGainPct(base.gems, sim.gems, gems, sim.skillShares, sim.skillCooldownUse));
	const sharedTotal = $derived(Object.values(sim.skillShares).reduce((a, v) => a + (Number(v) || 0), 0));
	// Damage shares estimate a dealer's DPS; supports don't get them.
	const role = getContext<() => RoleTables>('loa-sim:role');
	const support = $derived(role().support);
	let showShares = $state(false);
	$effect.pre(() => {
		if (Object.keys(sim.skillShares).length || Object.keys(sim.skillCooldownUse).length) showShares = true;
	});
</script>

{#snippet gemCell(i: number)}
	{@const gem = sim.gems[i]}
	{@const look = itemLook(gemId(gems[i].regular, gem.kind, gem.level))}
	<div class="flex h-11 w-[9.75rem] flex-row items-center gap-1.5 rounded-xs p-1 @max-[30rem]:w-[7rem] {gemChanged(i) ? 'bg-accent-500/10 ring-1 ring-accent-500' : ''}">
		<!-- Narrow cards drop the gem icon; the stepper still shows the level. -->
		<span class="@max-[30rem]:hidden"><ItemIcon src={look.icon} grade={look.grade} size="size-9" badge={gem.level} title={look.name} /></span>
		<Stepper bind:value={gem.level} min={1} max={10} changed={gem.level !== base.gems[i].level} label={`${skillName(gem.skill)} ${gem.kind} gem level`} width="w-6" />
	</div>
{/snippet}

{#snippet pctInput(map: Record<number, number>, skill: number, what: string, hint: string, placeholder: string)}
	<label
		class="flex h-8 w-16 cursor-text items-center gap-0.5 justify-self-end rounded-xs border border-surface-600 bg-surface-800 px-1.5 focus-within:border-accent-500 hover:border-accent-500"
		title={`${skillName(skill)}: ${hint}`}
	>
		<input
			type="number"
			min="0"
			max="100"
			step="0.1"
			{placeholder}
			class="w-full [appearance:textfield] bg-transparent text-right text-sm tabular-nums focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
			aria-label={`${skillName(skill)} ${what}`}
			value={map[skill] ?? ''}
			oninput={(e) => {
				const v = Number(e.currentTarget.value);
				if (e.currentTarget.value !== '' && v >= 0) map[skill] = Math.min(100, v);
				else delete map[skill];
			}}
		/>
		<span class="text-xs text-surface-400">%</span>
	</label>
{/snippet}

<SimCard
	title="Gems"
	{delta}
	info={support ? undefined : GEM_INFO}
>
	{#snippet actions()}
		{#if !support}
			<button type="button" class={btn} onclick={() => (showShares = !showShares)} aria-pressed={showShares}>
				{showShares ? 'Hide' : 'Add'} damage shares
			</button>
		{/if}
	{/snippet}
	{#if editable.length === 0}
		<p class="text-sm text-surface-400">No gems equipped.</p>
	{:else}
		<div class="mb-3 flex flex-row flex-wrap items-center gap-1.5">
			{#each [10, 9, 8, 7, 6] as lv (lv)}
				<button type="button" class={lv === 10 ? btnAccent : btn} onclick={() => setAll(() => lv)}>All Lv. {lv}</button>
			{/each}
			<span class="mx-1 h-5 w-px bg-surface-700"></span>
			<button type="button" class={btn} onclick={() => setAll((v) => v - 1)}>All −1</button>
			<button type="button" class={btn} onclick={() => setAll((v) => v + 1)}>All +1</button>
			<button type="button" class={btn} onclick={() => (sim.gems = structuredClone($state.snapshot(base.gems)))}>Reset</button>
		</div>

		{#if showShares}
			<div class="mb-3 flex flex-col gap-2">
				{#if dps !== null}
					<div class="text-sm">
						DPS estimate
						<span class="font-bold {dps > 0 ? 'text-green-400' : dps < 0 ? 'text-red-400' : 'text-surface-200'}">{formatPct(dps)}%</span>
						<span class="text-xs text-surface-400">· {sharedTotal.toFixed(0)}% of damage covered</span>
						<button type="button" class="ml-1 text-xs text-surface-400 underline hover:text-surface-100" onclick={() => ((sim.skillShares = {}), (sim.skillCooldownUse = {}))}>Clear</button>
					</div>
				{/if}
				<details class="group rounded-xs border border-surface-700 bg-black/15 px-3 py-2 text-xs text-surface-300">
					<summary class="cursor-pointer font-semibold text-surface-100 select-none">How the DPS estimate works</summary>
					<div class="mt-2 flex flex-col gap-2 leading-relaxed">
						<p>
							Combat Power counts every gem the same. Real damage depends on the skill: a gem on a skill that does 30% of your
							damage matters 15× more than one on a skill doing 2%. The estimate adds up each skill's change, weighted by its
							<b class="text-surface-100">Share</b> of your damage.
						</p>
						<p>
							<b class="text-surface-100">Damage gems</b> multiply that skill's damage. Lv. 9 → 10 (40% → 44%) is ×1.44 / 1.40 = +2.9%
							for the skill; at a 20% share that's about <b class="text-green-400">+0.57%</b> DPS.
						</p>
						<p>
							<b class="text-surface-100">Cooldown gems</b> add casts, but only while the skill is actually waiting on its cooldown.
							<b class="text-surface-100">CD use</b> is the share of the fight the skill spends on cooldown; the rest it sits ready while
							you cast other things. Cooldown 20% → 24% gives
							<b class="text-green-400">+5.3%</b> casts at 100% CD use, <b class="text-green-400">+2.6%</b> at 50%, and nothing at 0%.
							Blank CD use counts as 100% (the best case).
						</p>
						<p>
							<b class="text-surface-100">Where the numbers come from:</b> type them in, or load your LOA Logs file. Share is the average per
							run; CD use comes from LOA Logs' "time available" (logs you recorded yourself, recent versions). Skills without a gem
							(awakenings, identity, ...) count in the total but don't change.
						</p>
						<p class="text-surface-400">
							Limits: it assumes the rest of your rotation stays the same, and doesn't model buff windows or identity timing. Logs
							can include older builds, so pick a range after your last build change.
						</p>
					</div>
				</details>
				<LogsImport
					{characterName}
					onapply={(shares, cooldownUse) => {
						sim.skillShares = withGroups(shares);
						sim.skillCooldownUse = withGroups(cooldownUse, 'max');
					}}
				/>
			</div>
		{/if}

		<!-- Narrow cards (container query) show skill icons only and drop gem icons. -->
		<div class="@container">
		<div class="grid items-center gap-x-2 gap-y-1 max-[360px]:gap-x-1 {showShares ? 'grid-cols-[minmax(0,1fr)_auto_auto_auto_auto]' : 'grid-cols-[minmax(3rem,1fr)_auto_auto]'}">
			<span class="text-xs text-surface-400">Skill</span>
			<span class="px-1 text-xs text-surface-400">Damage</span>
			<span class="px-1 text-xs text-surface-400">Cooldown</span>
			{#if showShares}
				<span class="text-right text-xs text-surface-400" title="Share of your total damage">Share</span>
				<span class="text-right text-xs text-surface-400" title="Share of the fight the skill spent on cooldown (from LOA Logs); blank = always cast right off cooldown">CD use</span>
			{/if}
			{#each rows as r, ri (ri)}
				{@const skill = r.slots.damage !== undefined ? sim.gems[r.slots.damage].skill : r.slots.cooldown !== undefined ? sim.gems[r.slots.cooldown].skill : r.skill}
				<div class="col-span-full grid grid-cols-subgrid items-center border-t border-neutral-950 py-1">
					<MenuPicker
						value={optionOf(skill)}
						options={SKILL_OPTIONS}
						label={`${skillName(skill)} gems: skill`}
						changed={skill !== r.skill}
						onpick={(v) => setRowSkill(r, v)}
						full
					>
						{#snippet trigger()}
							{#if skill && GEM_SKILLS[skill]}<img src={iconUrl(GEM_SKILLS[skill][1])} alt="" class="size-6 shrink-0 rounded-xs" title={skillName(skill)} />{/if}
							<span class="min-w-0 truncate text-sm @max-[30rem]:hidden" title={skillName(skill)}>{skillName(skill)}</span>
						{/snippet}
					</MenuPicker>
					{#each KINDS as kind (kind)}
						{@const i = inSlot(r, kind)}
						{#if i !== undefined}
							{@render gemCell(i)}
						{:else}
							{@const other = inSlot(r, kind === 'damage' ? 'cooldown' : 'damage')}
							<div class="flex h-11 w-[9.75rem] items-center justify-center rounded-xs border border-dashed border-surface-700 @max-[30rem]:w-[7rem] text-xs text-surface-500">
								{#if other !== undefined && rowGems(r).length === 1}
									<button type="button" class="h-full w-full font-semibold hover:bg-surface-800 hover:text-surface-100" onclick={() => (sim.gems[other].kind = kind)} title={`Make it a ${kind} gem`}>
										→ {kind === 'damage' ? 'DMG' : 'CD'}
									</button>
								{:else}—{/if}
							</div>
						{/if}
					{/each}
					{#if showShares}
						{#if skill}
							{@render pctInput(sim.skillShares, skill, 'damage share', 'share of total damage', '0')}
							{@render pctInput(sim.skillCooldownUse, skill, 'cooldown use', 'share of the fight spent on cooldown; blank = 100%', '100')}
						{:else}<span></span><span></span>{/if}
					{/if}
					{#each r.extra as i (i)}
						<span></span>
						{@render gemCell(i)}
					{/each}
				</div>
			{/each}
		</div>
		</div>
	{/if}
</SimCard>
