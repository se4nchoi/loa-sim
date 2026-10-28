<!-- First-look context, restored from the original hint without its numbered import walkthrough. -->
<script lang="ts">
	import { PARADISE_ORBS } from '../game-data';
	import { engravingIcon, iconUrl, itemLook, t4GemId, type ItemLook } from '../icons';
	import ItemIcon from './ItemIcon.svelte';
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
	type Factor = { key?: DpsLimitKey; label: string; kind: 'Not valued' | 'Assumed' | 'Unverified'; look?: ItemLook; tldr: string; points: string[] };
	const dealerFactors: Factor[] = [
		{ key: 'cores', label: 'Order core swaps', kind: 'Not valued', look: order, tldr: 'Core swaps aren’t counted (another build); same-build core upgrades (Relic → Ancient) are.', points: [
			'Other cores play another rotation and trigger other Destinies, which this run can’t show.',
			'Upgrades on the same cores count for their damage effects; their speed, cooldown and meter effects don’t (casts stay as recorded).'
		] },
		{ key: 'karma', label: 'Evolution Karma', kind: 'Not valued', look: karma, tldr: 'No DPS (HP and CP only); Enlightenment and Leap Karma are counted.', points: [] },
		{ key: 'paradise', label: 'Paradise orb swaps', kind: 'Not valued', look: paradise, tldr: 'Orb swaps aren’t counted (another proc); Paradise power on the same orb is.', points: [
			'The run’s proc hits scale with its orb’s season power; how often it procs stays as recorded.'
		] },
		{ key: 'stacks', label: 'Stacked buffs', kind: 'Assumed', look: adrenaline, tldr: 'Core stack bonuses are counted per cast from the run’s own casts where the logs show them; the rest assume full stacks or uptime.', points: [
			'Replayed per cast: Slaughter Spectacle, Demon Fire, Hidden Fang, Lawless Land, TA-64 Reaper Bolt, Thunder, SMG Agent, Titan Suit, Utter Carnage, Manifest, Earth Collapse, Ravening Nightmare. Older imports need a re-import.',
			'Adrenaline assumes 6 stacks, Ether Predator 30; stacking bracelet Weapon Power uses full stacks.',
			'Gear-derived Additional Damage assumes Master at 5 stacks and the pet’s +1% Additional Damage, as LOA Logs does.',
			'Assumed at full: Power Drive, Eternal Blood, Supreme Connection, Dimensional Annihilation, Pulse Nova, Quasar Cannon Suit, Art Master, Overheated Shell, Infinity Deck, Yeon-Style Slash.'
		] },
		{ key: 'summons', label: 'Summons & DoTs', kind: 'Unverified', look: bleeding, tldr: 'Scaled like other damage; core bonuses aimed at them (Heavy Bleeding) aren’t counted.', points: [
			'Their hits and ticks stay as recorded; only the damage per hit scales.'
		] },
		{ key: 'cooldown', label: 'Cooldown gems', kind: 'Assumed', look: blazing, tldr: 'Extra casts from the skill’s time on cooldown in this run; can overstate the gain.', points: [
			'Each extra cast deals the run’s average for that skill, with nothing else pushed out of the rotation.',
			'A run without cooldown data counts only the gem’s base attack.'
		] },
		{ key: 'bracelet', label: 'Bracelet effects', kind: 'Not valued', look: bracelet, tldr: 'Plain stat and damage lines count; most conditional lines and combat stats don’t.', points: [
			'Demon/Archdemon bonus: inactive on known non-Demon gates. Changing it on other gates isn’t counted: card-book totals and damage by target aren’t available.',
			'Boss race assumes damage to the gate’s listed bosses; adds aren’t reconstructed.',
			'Stagger bonuses aren’t counted: the logs don’t give usable damage during stagger.',
			'Not counted: HP-gated Weapon Power, speed and cooldown lines (when they applied isn’t logged).',
			'Combat stats (Specialization, Swiftness, …) aren’t counted (what they do depends on the class).'
		] }
	];
	const supportFactors: Factor[] = [
		{ label: 'Buff uptime & cooldowns', kind: 'Assumed', look: blazing, tldr: 'Buff strength changes; uptime and dealers’ damage stay as recorded.', points: [
			'Cooldown gems add no buff casts; their base attack still counts.'
		] },
		{ label: 'Ark Passive party buffs & orbs', kind: 'Assumed', look: paradise, tldr: 'Kept as recorded (not moved by gear).', points: [] },
		{ label: 'New Destiny effects', kind: 'Not valued', look: order, tldr: 'A Destiny effect the run didn’t have isn’t counted (nothing recorded to scale).', points: [] }
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
				<span class="block">If you played a raid run <em class="underline decoration-violet-400/70 underline-offset-4">exactly</em> like this again,</span>
				<span class="block">with the gear changes in the simulator,</span>
				<span class="block">{#if support}how much would your buffs add ?{:else}what DPS would it be ?{/if}</span>
			</p>
		</section>
		<section class="rounded-xs border border-green-500/25 bg-green-500/5 p-4">
			<h3 class="flex items-center gap-2 text-sm font-semibold text-green-200"><span aria-hidden="true" class="flex size-5 items-center justify-center rounded-full border border-green-400/40 text-xs">!</span>Heads up</h3>
			<ul class="mt-3 list-disc space-y-2 pl-4 leading-relaxed text-surface-300 marker:text-green-400/60">
				<li>Gear changes tend to move DPS by <span class="font-medium text-surface-100">only a few percent.</span></li>
				<li>Uptime, positionals and staying alive can matter more, and <span class="font-medium text-green-200">they're free.</span></li>
				<li>These are estimates from <span class="font-medium text-surface-100">one run;</span> real runs will vary.</li>
				<li>Best used to <span class="font-medium text-surface-100">compare options,</span> not as a list of things to buy.</li>
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
							<p class="{factor.points.length ? 'mb-3' : ''} border-l-2 border-amber-400/60 pl-2.5 leading-relaxed text-surface-100"><span class="mr-1 font-semibold text-amber-200">TL;DR</span> {factor.tldr}</p>
							{#if factor.points.length}
								<ul class="list-disc space-y-2.5 pl-3.5 leading-relaxed text-surface-300 marker:text-surface-500">
									{#each factor.points as point (point)}<li class="pl-0.5">{point}</li>{/each}
								</ul>
							{/if}
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
