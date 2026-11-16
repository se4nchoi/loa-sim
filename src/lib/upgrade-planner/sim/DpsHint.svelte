<!-- First-look context, restored from the original hint without its numbered import walkthrough. -->
<script lang="ts">
	import { PARADISE_ORBS } from '../game-data';
	import { engravingIcon, iconUrl, itemLook, t4GemId, type ItemLook } from '../icons';
	import ItemIcon from './ItemIcon.svelte';
	import ReportDialog from '$lib/ReportDialog.svelte';
	import type { DpsLimitKey } from '../dps-limit-link.svelte';

	let { support = false, ondismiss }: { support?: boolean; ondismiss: () => void } = $props();
	const blazing = itemLook(t4GemId(2, 10));
	const order: ItemLook = { icon: iconUrl('Use_13_96'), grade: 6, name: 'Ancient Order Sun Core' };
	// Shadow of Karma, item 52324201 in the same Maxroll item feed used by bake-game-data.mjs.
	const karma: ItemLook = { icon: iconUrl('Use_12_222'), grade: 6, name: 'Shadow of Karma' };
	const adrenaline: ItemLook = { icon: engravingIcon(1299), name: 'Adrenaline' };
	// Reaper's Heavy Bleeding effect (280030); the icon name comes from meter-data's SkillBuff table.
	const bleeding: ItemLook = { icon: iconUrl('Buff_382'), name: 'Heavy Bleeding' };
	const bracelet = itemLook(213400023);
	// Use the latest dealer orb in the game's table, rather than a past season's or support orb.
	const latestDealerOrb = Object.entries(PARADISE_ORBS).filter(([, orb]) => !orb.support).sort(([a], [b]) => Number(b) - Number(a))[0]?.[1];
	const paradise: ItemLook = { icon: iconUrl(latestDealerOrb?.icon), grade: latestDealerOrb?.grade, name: latestDealerOrb?.name };
	type Factor = { key?: DpsLimitKey; label: string; kind: 'Not valued' | 'Assumed' | 'Unverified'; look?: ItemLook; tldr: string; points: string[]; link?: { label: string } };
	/** "Send a log": the site's own report dialog, like the beta note's Report. */
	let sendingLog = $state(false);
	// Checked on the runs in the author's own encounters (theirs and their parties'); the thinnest classes are named.
	const coverage: Factor = { label: 'Class coverage', kind: 'Unverified', tldr: 'Checked on the author’s own encounters.', points: [
		'Fewest runs checked: Machinist, Reaper, Destroyer, Dimensionalist, Glaivier.'
	], link: { label: 'Feels off ? Report it →' } };
	const dealerFactors: Factor[] = [
		{ key: 'cores', label: 'Order core swaps', kind: 'Not valued', look: order, tldr: 'A swap is another build. Upgrades on the same cores (Relic → Ancient) count.', points: [
			'Other cores play another rotation and other Destinies; this run can’t show them.',
			'Same-core upgrades count their damage lines, not speed, cooldown or meter lines: casts stay as recorded.'
		] },
		{ key: 'karma', label: 'Evolution Karma', kind: 'Not valued', look: karma, tldr: 'HP and CP only. Enlightenment and Leap Karma count.', points: [] },
		{ key: 'paradise', label: 'Paradise orb swaps', kind: 'Not valued', look: paradise, tldr: 'A swap is another proc. Paradise power on the same orb counts.', points: [
			'Proc hits scale with the orb’s season power; proc count stays as recorded.'
		] },
		{ key: 'stacks', label: 'Stacked buffs', kind: 'Assumed', look: adrenaline, tldr: 'Replayed per cast where the logs show stacks; otherwise full stacks or uptime.', points: [
			'Replayed per cast: Slaughter Spectacle, Demon Fire, Hidden Fang, Lawless Land, TA-64 Reaper Bolt, Thunder, SMG Agent, Titan Suit, Utter Carnage, Manifest, Earth Collapse, Ravening Nightmare (older imports: re-import).',
			'Full: Adrenaline 6 stacks, Ether Predator 30, stacking bracelet Weapon Power.',
			'Full: Power Drive, Eternal Blood, Supreme Connection, Dimensional Annihilation, Pulse Nova, Quasar Cannon Suit, Art Master, Overheated Shell, Infinity Deck, Yeon-Style Slash.',
			'Gear Additional Damage: Master at 5 stacks and the pet’s +1%, as LOA Logs.'
		] },
		{ key: 'summons', label: 'Summons & DoTs', kind: 'Unverified', look: bleeding, tldr: 'Damage per hit scales; hit and tick counts stay as recorded.', points: [
			'Core bonuses aimed at them (Heavy Bleeding) aren’t counted.'
		] },
		{ key: 'cooldown', label: 'Cooldown gems', kind: 'Assumed', look: blazing, tldr: 'Extra casts from the skill’s time on cooldown; can overstate the gain.', points: [
			'Each extra cast deals the skill’s average in this run and pushes nothing out of the rotation.',
			'Without cooldown data: base attack only.'
		] },
		{ key: 'bracelet', label: 'Bracelet effects', kind: 'Not valued', look: bracelet, tldr: 'Plain stat and damage lines count; most conditional lines don’t.', points: [
			'Demon/Archdemon: off on known non-Demon gates; not counted elsewhere (no card-book total or damage by target).',
			'Boss race from the gate’s listed bosses; adds ignored.',
			'Not counted: stagger bonuses, HP-gated Weapon Power, speed and cooldown lines (not timed in the logs).',
			'Not counted: combat stats (Specialization, Swiftness, …).'
		] },
		coverage
	];
	const supportFactors: Factor[] = [
		{ label: 'Buff uptime & cooldowns', kind: 'Assumed', look: blazing, tldr: 'Buff strength changes; uptime and dealers’ damage stay as recorded.', points: [
			'Cooldown gems add no buff casts; their base attack counts.'
		] },
		{ label: 'Ark Passive party buffs & orbs', kind: 'Assumed', look: paradise, tldr: 'As recorded; gear doesn’t move them.', points: [] },
		{ label: 'New Destiny effects', kind: 'Not valued', look: order, tldr: 'Not in the run, so nothing to scale.', points: [] },
		coverage
	];
	const factorColumns = $derived.by(() => {
		const factors = support ? supportFactors : dealerFactors;
		const split = Math.ceil(factors.length / 2);
		return [factors.slice(0, split), factors.slice(split)];
	});
</script>

<aside id="dps-sim-hint" aria-label="How the DPS sim works" class="mb-3 rounded-xs border border-amber-500/30 bg-amber-500/5 p-3 sm:p-4">
	<div class="mb-3 flex items-center gap-2">
		<span class="text-sm font-semibold text-surface-100">How the DPS sim works</span>
	</div>
	<div class="grid items-start gap-4 text-xs md:grid-cols-2">
		<section class="rounded-xs border border-surface-700/70 bg-surface-950/60 p-4">
			<h3 class="text-sm font-semibold text-surface-100">What it simulates</h3>
			<p class="mt-3 border-l-2 border-violet-400/70 pl-3 text-sm leading-relaxed font-medium text-surface-50">
				This run, played <em class="underline decoration-violet-400/70 underline-offset-4">exactly</em> the same, with the Simulator’s gear edits: {#if support}how much party DPS do your buffs add?{:else}what would its DPS be?{/if}
			</p>
		</section>
		<section class="rounded-xs border border-green-500/25 bg-green-500/5 p-4">
			<h3 class="text-sm font-semibold text-green-200">Read it as</h3>
			<ul class="mt-3 list-disc space-y-2 pl-4 leading-relaxed text-surface-300 marker:text-green-400/60">
				<li>Gear moves DPS <span class="font-medium text-surface-100">a few percent;</span> uptime, positionals and staying alive often move it more.</li>
				<li>One run’s estimate: <span class="font-medium text-surface-100">compare options with it,</span> don’t shop by it.</li>
			</ul>
		</section>
	</div>
	<section class="mt-4 border-t border-amber-500/20 pt-4 text-xs">
		<h3 class="mb-3 flex items-center gap-2 font-semibold text-amber-200"><span aria-hidden="true" class="text-base leading-none">※</span> Limitations</h3>
		<div class="grid items-start gap-4 sm:grid-cols-2">
			{#each factorColumns as column, index (index)}
			<ul class="space-y-4">
			{#each column as factor (factor.label)}
				<li class="min-w-0 scroll-mt-24 rounded-sm transition-shadow" id={factor.key ? `dps-limit-${factor.key}` : undefined}>
					<details open class="group overflow-hidden rounded-sm border border-surface-600/70 bg-surface-950/70">
						<summary class="flex cursor-pointer items-center gap-2.5 bg-surface-800/80 px-3 py-3 text-surface-100 select-none hover:bg-surface-700/80 sm:px-4">
							<span aria-hidden="true" class="text-surface-500 transition-transform group-open:rotate-90">▸</span>
							{#if factor.look}<ItemIcon src={factor.look.icon} grade={factor.look.grade} size="size-7" title={factor.look.name} />{:else}<span aria-hidden="true" class="flex size-7 shrink-0 items-center justify-center text-base text-amber-300/70">※</span>{/if}
							<span class="min-w-0 text-[13px] font-semibold">{factor.label}</span>
							<span class="ml-auto shrink-0 rounded-xs border px-1.5 py-0.5 text-[10px] {factor.kind === 'Not valued' || factor.kind === 'Unverified' ? 'border-amber-500/25 bg-amber-500/5 text-amber-300' : 'border-surface-600 bg-surface-900/60 text-surface-300'}">{factor.kind}</span>
						</summary>
						<div class="border-t border-surface-700/80 px-4 py-4 sm:px-5">
							<p class="{factor.points.length ? 'mb-3' : ''} border-l-2 border-amber-400/60 pl-2.5 leading-relaxed text-surface-100">{factor.tldr}</p>
							{#if factor.points.length}
								<ul class="list-disc space-y-2.5 pl-3.5 leading-relaxed text-surface-300 marker:text-surface-500">
									{#each factor.points as point (point)}<li class="pl-0.5">{point}</li>{/each}
								</ul>
							{/if}
							{#if factor.link}<button type="button" class="mt-3 inline-block text-accent-300 underline underline-offset-2 hover:text-accent-200" onclick={() => (sendingLog = true)}>{factor.link.label}</button>{/if}
						</div>
					</details>
				</li>
			{/each}
			</ul>
			{/each}
		</div>
	</section>
	<div class="mt-4 flex justify-center border-t border-amber-500/20 pt-4">
		<button type="button" class="h-10 min-w-40 rounded-xs bg-accent-700 px-6 text-sm font-semibold text-white hover:bg-accent-600" onclick={ondismiss}>Got it</button>
	</div>
</aside>
{#if sendingLog}<ReportDialog kind="data" title="DPS sim log" bodyHint="The lostark.bible log link (lostark.bible/logs/…), and anything that looks off in it." onclose={() => (sendingLog = false)} />{/if}
