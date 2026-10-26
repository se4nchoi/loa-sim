<script lang="ts">
	import { formatPct } from '../format';
	import { iconUrl } from '../icons';
	import { formatPower, orbChoices, orbIcon, orbK, orbName, orbPower, orbSeason, orbValue, parsePower } from '../paradise';
	import type { SimState } from '../simulate';
	import ItemIcon from './ItemIcon.svelte';
	import LinePicker from './LinePicker.svelte';
	import NoDpsChip from './NoDpsChip.svelte';
	import SimCard from './SimCard.svelte';
	import { btn, btnAccent, type PickOption, type PreviewEdit, type SectionDelta } from './ui';

	let { sim = $bindable(), base, delta, preview, dpsBase = null }: { sim: SimState; base: SimState; delta: SectionDelta; preview: PreviewEdit; /** DPS mode: the run's setup; orbs other than its own aren't counted. */ dpsBase?: SimState | null } = $props();
	const runOrb = $derived(dpsBase?.paradise && !dpsBase.paradise.flat ? dpsBase.paradise.orb : null);

	/** lostark.bible's Relic name color: orbs are Relic items. */
	const RELIC = '#fa5d00';

	const orb = $derived(sim.paradise);
	const season = $derived(orb ? (orbSeason(orb.orb) ?? 0) : 0);
	/** An orb's own share of CP, in percent, at its season's power (supports: a flat 1.30%). */
	const shareOf = (p: NonNullable<SimState['paradise']>, o: number) => {
		if (p.flat) return 1.3;
		return base.paradise ? orbValue(orbK(o, base.paradise), p.powers[orbSeason(o) ?? 0] ?? 0) / 100 : 0;
	};

	const previewOrb = (o: number) => preview((s) => (s.paradise!.orb = o));
	const options = $derived<PickOption[]>(
		orb && base.paradise && !orb.flat
			? orbChoices(base.paradise).map((o) => {
					const better = o !== orb.orb && previewOrb(o) > 0.005;
					return {
						value: String(o),
						label: orbName(o),
						color: RELIC,
						textColor: RELIC,
						iconUrl: iconUrl(orbIcon(o)),
						group: `Season ${orbSeason(o) ?? '?'}`,
						detail: { label: `${formatPct(shareOf(orb, o))}% CP${better ? ' ▲' : ''}${runOrb !== null && o !== runOrb ? ' · no DPS' : ''}`, color: better ? '#38bdf8' : '#a1a1aa' }
					};
				})
			: []
	);

	// The box holds what the player is typing; it follows the simulation (Apply, Reset, undo, orb) when that changes.
	let draft = $state('');
	$effect(() => {
		draft = formatPower(sim.paradise ? orbPower(sim.paradise) : 0);
	});
	const typed = $derived(parsePower(draft));
	const pending = $derived(typed !== null && !!orb && typed !== orbPower(orb));
	const setPower = (v: number) => {
		if (!sim.paradise) return;
		sim.paradise = { ...sim.paradise, powers: { ...sim.paradise.powers, [season]: v } };
		draft = formatPower(v);
	};
	function apply() {
		if (typed !== null) setPower(typed);
	}
	/** Leaving the box without applying: an empty or unreadable entry goes back to the snapshot's power; a typed but
	 *  unapplied number is dropped. Moving to Apply itself keeps the entry so the click can apply it. */
	function leave(e: FocusEvent) {
		if ((e.relatedTarget as HTMLElement | null)?.dataset.paradiseApply !== undefined) return;
		if (typed === null && base.paradise) setPower(orbPower(base.paradise));
		else if (orb) draft = formatPower(orbPower(orb));
	}
</script>

{#if orb && base.paradise}
	<SimCard title="Paradise" {delta} info="Every orb from the game's data. Each orb scales with its own season's Paradise power; other seasons start at your snapshot's power.">
		{#snippet actions()}
			<button type="button" class={btn} onclick={() => (sim.paradise = structuredClone($state.snapshot(base.paradise)))}>Reset</button>
		{/snippet}
		<div class="flex flex-col gap-2.5">
			<div class="flex flex-row items-center gap-2.5">
				<ItemIcon src={iconUrl(orbIcon(orb.orb))} grade={5} title={orbName(orb.orb)} />
				{#if orb.flat}
					<span class="min-w-0 flex-1 truncate text-sm font-semibold" style:color={RELIC}>{orbName(orb.orb)}</span>
				{:else}
					<LinePicker
						value={String(orb.orb)}
						{options}
						label="Paradise orb"
						plain
						changed={orb.orb !== base.paradise.orb}
						onpick={(o) => (sim.paradise = { ...sim.paradise!, orb: Number(o) })}
						preview={(o) => previewOrb(Number(o))}
					/>
					{#if runOrb !== null && orb.orb !== runOrb}<NoDpsChip limit="paradise" title="Another orb than the run's: its proc isn't in this run, so the swap isn't counted" />{/if}
				{/if}
			</div>
			{#if orb.flat}
				<p class="text-xs text-surface-400">For support, orb is always a flat {formatPct(shareOf(orb, orb.orb))}% CP. Blame Smilegate :(</p>
			{:else}
				<form
					class="flex flex-row items-end gap-2"
					onsubmit={(e) => {
						e.preventDefault();
						apply();
					}}
				>
					<label class="flex min-w-0 flex-1 flex-col gap-1">
						<span class="text-xs text-surface-200">Paradise power</span>
						<input
							type="text"
							autocomplete="off"
							bind:value={draft}
							onblur={leave}
							aria-label="Paradise power"
							aria-invalid={typed === null}
							class="h-8 w-full min-w-0 rounded-xs border bg-surface-950 px-2 text-sm tabular-nums text-surface-100 focus:border-accent-500 focus:outline-none {typed === null
								? 'border-red-500'
								: pending
									? 'border-amber-400'
									: orbPower(orb) !== base.paradise.powers[season]
										? 'border-accent-500 bg-accent-500/10'
										: 'border-surface-700'}"
						/>
					</label>
					<button
						type="submit"
						data-paradise-apply
						onpointerdown={(e) => e.preventDefault()}
						class="{btnAccent} h-8 min-w-16 disabled:cursor-not-allowed disabled:border-surface-700 disabled:bg-surface-800 disabled:text-surface-500"
						disabled={!pending}
					>
						Apply
					</button>
				</form>
			{/if}
		</div>
	</SimCard>
{/if}
