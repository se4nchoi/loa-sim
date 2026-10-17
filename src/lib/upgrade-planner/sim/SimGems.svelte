<script lang="ts">
	import { getContext } from 'svelte';
	import { gemDpsGainPct } from '../dps';
	import type { RoleTables } from '../roles';
	import { formatPct } from '../format';
	import { GEM_SKILL_GROUPS, GEM_SKILLS, ITEMS } from '../game-data';
	import { iconUrl, itemLook } from '../icons';
	import { gemsInEffect, MAX_GEMS, type GemKind, type GemPart, type SimState } from '../simulate';
	import ItemIcon from './ItemIcon.svelte';
	import LogsImport from './LogsImport.svelte';
	import MenuPicker from './MenuPicker.svelte';
	import SimCard from './SimCard.svelte';
	import HScroll from './HScroll.svelte';
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
	/** Snapshot gems with a known CP table, plus gems added in empty slots (after the snapshot's). */
	const editable = $derived(sim.gems.map((_, i) => i).filter((i) => i >= gems.length || gems[i].table));
	const isAdded = (i: number) => i >= base.gems.length;
	/** Which gems take effect: a second gem of a kind on one skill doesn't (the game deactivates it). */
	const on = $derived(gemsInEffect(sim.gems));
	const equipped = $derived(sim.gems.length);
	/** Gems sharing a skill and kind with another equipped gem: the game keeps only the highest, so both rows show it. */
	const duplicate = $derived(sim.gems.map((g, i) => g.skill !== null && sim.gems.some((h, j) => j !== i && h.kind === g.kind && sameSkill(h.skill, g.skill))));
	const full = $derived(equipped >= MAX_GEMS);

	/**
	 * One row per gem, like the game's gem slots. Snapshot gems keep their loaded order (grouped by skill, highest
	 * level first, damage before cooldown) so rows don't jump while editing; added gems follow.
	 */
	const order = $derived.by(() => {
		const bySkill = new Map<string, number[]>();
		for (const i of editable) {
			if (isAdded(i)) continue;
			const g = base.gems[i];
			const key = g.skill === null ? `none-${i}` : String(g.skill);
			bySkill.set(key, [...(bySkill.get(key) ?? []), i]);
		}
		const top = (list: number[]) => Math.max(...list.map((i) => base.gems[i].level));
		const kindRank = (i: number) => (base.gems[i].kind === 'damage' ? 0 : 1);
		return [
			...[...bySkill.values()].sort((a, b) => top(b) - top(a)).flatMap((list) => list.toSorted((a, b) => kindRank(a) - kindRank(b))),
			...editable.filter(isAdded)
		];
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
	const skillName = (id: number | null) => (id ? (GEM_SKILLS[id]?.[0] ?? `Skill ${id}`) : 'Pick a skill');
	/** For rows: "Brawl King Twelve Forms (Falling Blossoms / Violent Waves)" → "Brawl King Twelve Forms"; the full name shows on hover. */
	const shortName = (id: number | null) => skillName(id).replace(/\s*\(.*\)$/, '');
	const sameSkill = (a: number | null, b: number | null) => a !== null && b !== null && (a === b || GEM_SKILLS[a]?.[0] === GEM_SKILLS[b]?.[0]);
	/** The picker entry for a skill: the one with the same name. */
	const optionOf = (id: number | null) => SKILL_OPTIONS.find((o) => sameSkill(o.value, id))?.value ?? 0;
	/** Another equipped gem of this gem's kind on `skill`. */
	const holder = (i: number, skill: number) => sim.gems.findIndex((g, j) => j !== i && g.kind === sim.gems[i].kind && sameSkill(g.skill, skill));
	/** Same colors as the row's kind button. */
	const KIND_CHIP: Record<GemKind, { label: string; class: string }> = {
		damage: { label: 'DMG', class: 'border-rose-700/70 text-rose-300' },
		cooldown: { label: 'CD', class: 'border-sky-700/70 text-sky-300' }
	};
	/** Skills that already hold gems show their kinds as chips; picking one with this gem's kind swaps the two gems' skills. */
	const optionsFor = (i: number) =>
		SKILL_OPTIONS.map((o) => {
			const kinds = KINDS.filter((k) => sim.gems.some((g, j) => j !== i && g.kind === k && sameSkill(g.skill, o.value)));
			return kinds.length ? { ...o, chips: kinds.map((k) => KIND_CHIP[k]) } : o;
		});
	function pickSkill(i: number, skill: number) {
		const j = holder(i, skill);
		if (j >= 0) sim.gems[j].skill = sim.gems[i].skill;
		sim.gems[i].skill = skill;
	}
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

	const tierOf = (i: number) => sim.gems[i].tier ?? gems[i]?.tier ?? 'T4';
	/** A new gem in an empty slot: the character's usual tier and highest level, skill picked next. */
	function addGem() {
		if (full) return;
		const tier = sim.gems.some((_, i) => tierOf(i) === 'T4') || !equipped ? 'T4' : 'T3';
		sim.gems.push({ tier, level: Math.max(1, ...sim.gems.map((g) => g.level)), kind: 'damage', skill: null });
	}

	const setAll = (fn: (current: number) => number) =>
		editable.forEach((i) => (sim.gems[i].level = Math.min(10, Math.max(1, fn(sim.gems[i].level)))));
	const gemChanged = (i: number) => JSON.stringify(sim.gems[i]) !== JSON.stringify(base.gems[i]);
	const TIER_OPTIONS: MenuOption<'T3' | 'T4'>[] = [{ value: 'T3', label: 'T3' }, { value: 'T4', label: 'T4' }];

	const dps = $derived(gemDpsGainPct(base.gems, sim.gems, gems, sim.skillShares, sim.skillCooldownUse));
	/** Skills with a gem in effect, once each, in row order: what damage shares are entered for. */
	const gemSkills = $derived.by(() => {
		const out: { skill: number; gems: number[] }[] = [];
		for (const i of order) {
			const skill = sim.gems[i].skill;
			if (!on[i] || skill === null) continue;
			const row = out.find((r) => sameSkill(r.skill, skill));
			if (row) row.gems.push(i);
			else out.push({ skill, gems: [i] });
		}
		return out;
	});
	const covered = $derived(gemSkills.reduce((a, r) => a + (Number(sim.skillShares[r.skill]) || 0), 0));
	const unshared = $derived(gemSkills.filter((r) => sim.skillShares[r.skill] === undefined).length);
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
	{@const tier = tierOf(i)}
	{@const loaded = gems[i]}
	{@const iconId = loaded && tier === loaded.tier ? loaded.regular : tier === 'T3' ? 65021000 : 65031000}
	{@const look = itemLook(gemId(iconId, gem.kind, gem.level))}
	<div class="flex h-11 flex-row items-center gap-1.5 rounded-xs p-1">
		<MenuPicker iconOnly value={tier} options={TIER_OPTIONS} columns={2} label={`${skillName(gem.skill)} ${gem.kind} gem tier`} changed={!loaded || tier !== loaded.tier} onpick={(v) => { if (loaded && v === loaded.tier) delete gem.tier; else gem.tier = v; }}>
			{#snippet trigger()}<ItemIcon src={look.icon} grade={look.grade} size="size-9" badge={gem.level} title={`${look.name} (${tier}) · Change gem tier`} />{/snippet}
		</MenuPicker>
		<Stepper bind:value={gem.level} min={1} max={10} changed={gem.level !== base.gems[i]?.level} label={`${skillName(gem.skill)} ${gem.kind} gem level`} buttonsOnly />
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
	{#snippet toolbar()}
		<!-- Sticks with the card header: one sideways-scrolling row of bulk levels, Reset pinned on the right. -->
		<div class="flex min-w-0 flex-row items-center gap-2" hidden={editable.length === 0}>
			<HScroll class="flex-1 items-center gap-1.5">
				{#each [10, 9, 8, 7, 6] as lv (lv)}
					<button type="button" class="{lv === 10 ? btnAccent : btn} shrink-0 whitespace-nowrap" onclick={() => setAll(() => lv)} title={`Every gem at Lv. ${lv}`}>Lv. {lv}</button>
				{/each}
				<span class="mx-1 h-5 w-px shrink-0 bg-surface-700"></span>
				<button type="button" class="{btn} shrink-0 whitespace-nowrap" onclick={() => setAll((v) => v - 1)}>All −1</button>
				<button type="button" class="{btn} shrink-0 whitespace-nowrap" onclick={() => setAll((v) => v + 1)}>All +1</button>
			</HScroll>
			<button type="button" class="{btn} shrink-0" onclick={() => {
				sim.gems = structuredClone($state.snapshot(base.gems));
				sim.skillShares = {};
				sim.skillCooldownUse = {};
				showShares = false;
			}}>Reset</button>
		</div>
	{/snippet}
	{#if editable.length === 0}<p class="mb-2 text-sm text-surface-400">No gems equipped. Add one below.</p>{/if}
		{#if showShares}
			<div class="mb-3 flex flex-col gap-2">
				{#if dps !== null}
					<div class="text-sm">
						DPS estimate
						<span class="font-bold {dps > 0 ? 'text-green-400' : dps < 0 ? 'text-red-400' : 'text-surface-200'}">{formatPct(dps)}%</span>
						<span class="text-xs text-surface-400">· skills with gems deal {covered.toFixed(0)}% of your damage</span>
						<button type="button" class="ml-1 text-xs text-surface-400 underline hover:text-surface-100" onclick={() => ((sim.skillShares = {}), (sim.skillCooldownUse = {}))}>Clear</button>
					</div>
				{/if}
				<details class="group rounded-xs border border-surface-700 bg-black/15 px-3 py-2 text-xs text-surface-300">
					<summary class="cursor-pointer font-semibold text-surface-100 select-none hover:text-accent-200">How the DPS estimate works</summary>
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

		<!-- One row per gem slot, like the game. Narrow cards scroll the rows sideways at their desktop size. -->
		<div class="@container">
		<div class="grid items-center gap-x-2 max-sm:gap-x-1 grid-cols-[auto_auto_minmax(2.5rem,1fr)]">
			<span class="px-1 text-xs text-surface-400">Gem</span>
			<span class="text-xs text-surface-400">Kind</span>
			<span class="flex justify-between text-xs text-surface-400">Skill<span class="tabular-nums text-surface-500">{equipped}/{MAX_GEMS}</span></span>
			{#each order as i, n (i)}
				{@const gem = sim.gems[i]}
				{@const newSkill = n === 0 || !sameSkill(sim.gems[order[n - 1]].skill, gem.skill)}
				<div class="col-span-full grid grid-cols-subgrid items-center rounded-xs px-1 {newSkill ? 'mt-1 border-t border-neutral-950 pt-1' : ''} {duplicate[i] ? 'bg-red-500/10 ring-1 ring-inset ring-red-500' : gemChanged(i) ? 'bg-accent-500/10 ring-1 ring-inset ring-accent-500' : ''}" title={duplicate[i] ? `Two ${gem.kind === 'damage' ? 'damage' : 'cooldown'} gems on ${skillName(gem.skill)}: only the higher one works${on[i] ? '' : ' (not this one)'}` : undefined}>
						{@render gemCell(i)}
						<button type="button" class="h-8 w-12 rounded-xs border text-xs font-semibold {gem.kind === 'damage' ? 'border-rose-700/70 text-rose-300' : 'border-sky-700/70 text-sky-300'} {gem.kind !== base.gems[i]?.kind ? 'ring-1 ring-accent-500' : ''} hover:bg-surface-800" onclick={() => (gem.kind = gem.kind === 'damage' ? 'cooldown' : 'damage')} title={`Make it a ${gem.kind === 'damage' ? 'cooldown' : 'damage'} gem`}>
							{gem.kind === 'damage' ? 'DMG' : 'CD'}
						</button>
						<div class="min-w-0">
							<MenuPicker value={optionOf(gem.skill)} options={optionsFor(i)} label={`${skillName(gem.skill)} ${gem.kind} gem: skill`} changed={!sameSkill(gem.skill, base.gems[i]?.skill ?? null)} onpick={(v) => pickSkill(i, v)} full>
								{#snippet trigger()}
									{#if gem.skill && GEM_SKILLS[gem.skill]}<img src={iconUrl(GEM_SKILLS[gem.skill][1])} alt="" class="size-6 shrink-0 rounded-xs" />{/if}
									<span class="min-w-0 truncate text-sm {gem.skill ? '' : 'text-surface-400'} @max-[23rem]:hidden" title={skillName(gem.skill)}>{shortName(gem.skill)}</span>
								{/snippet}
							</MenuPicker>
						</div>
				</div>
			{/each}
			{#each { length: MAX_GEMS - equipped } as _, n (n)}
				<button type="button" class="col-span-full mt-1 flex h-11 items-center justify-center rounded-xs border border-dashed border-surface-700 text-xs font-semibold text-surface-500 hover:bg-surface-800 hover:text-surface-100" onclick={addGem}>+ Add gem</button>
			{/each}
		</div>
		</div>

		{#if showShares && gemSkills.length}
			<!-- Damage share and cooldown use belong to the skill, not the gem: entered once per skill. -->
			<div class="mt-4 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-3 gap-y-1 text-sm">
				<span class="text-xs text-surface-400">Skills with gems</span>
				<span class="text-xs text-surface-400">Gems</span>
				<span class="text-right text-xs text-surface-400" title="Share of your total damage">Share</span>
				<span class="text-right text-xs text-surface-400" title="Share of the fight the skill spent on cooldown (from LOA Logs); blank = always cast right off cooldown">CD use</span>
				{#each gemSkills as r (r.skill)}
					<span class="flex min-w-0 items-center gap-2 border-t border-neutral-950 pt-1">
						{#if GEM_SKILLS[r.skill]}<img src={iconUrl(GEM_SKILLS[r.skill][1])} alt="" class="size-6 shrink-0 rounded-xs" />{/if}
						<span class="truncate" title={skillName(r.skill)}>{shortName(r.skill)}</span>
					</span>
					<span class="border-t border-neutral-950 pt-1 text-xs tabular-nums text-surface-400">{r.gems.map((i) => `${sim.gems[i].kind === 'damage' ? 'DMG' : 'CD'} ${sim.gems[i].level}`).join(' · ')}</span>
					<span class="border-t border-neutral-950 pt-1">{@render pctInput(sim.skillShares, r.skill, 'damage share', 'share of total damage', '0')}</span>
					<span class="border-t border-neutral-950 pt-1">{@render pctInput(sim.skillCooldownUse, r.skill, 'cooldown use', 'share of the fight spent on cooldown; blank = 100%', '100')}</span>
				{/each}
			</div>
			{#if unshared}<p class="mt-2 text-xs text-amber-300">{unshared} {unshared === 1 ? 'skill has' : 'skills have'} no damage share, so {unshared === 1 ? 'its gems count' : 'their gems count'} as 0 DPS.</p>{/if}
		{/if}
</SimCard>
