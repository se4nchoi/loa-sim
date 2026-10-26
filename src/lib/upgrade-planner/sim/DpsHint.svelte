<!-- First-look context, restored from the original hint without its numbered import walkthrough. -->
<script lang="ts">
	import { PARADISE_ORBS } from '../game-data';
	import { engravingIcon, iconUrl, itemLook, t4GemId, type ItemLook } from '../icons';
	import ItemIcon from './ItemIcon.svelte';

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
	type Factor = { label: string; kind: 'Not valued' | 'Assumed' | 'Unverified'; look?: ItemLook; tldr: string; points: string[] };
	const dealerFactors: Factor[] = [
		{ label: 'Order core swaps', kind: 'Not valued', look: order, tldr: 'Core swaps are left out; supported same-core upgrades count.', points: [
			'Different cores change the rotation and Destiny triggers. This run cannot supply the replacement rotation, so swaps are left out.',
			'Same-core grade and point upgrades count for supported damage effects, using recorded buff coverage.',
			'Core speed, cooldown, meter gain and Burn effects are left out; cast timing and new ticks are not simulated.'
		] },
		{ label: 'Evolution Karma', kind: 'Not valued', look: karma, tldr: 'The HP/CP bonus adds no DPS here.', points: [
			'Its HP and CP bonuses supply no direct damage multiplier here.',
			'Enlightenment’s Weapon Power and Leap’s Hyper Awakening damage do count.'
		] },
		{ label: 'Paradise orb swaps', kind: 'Not valued', look: paradise, tldr: 'Same-orb power counts; orb swaps are left out.', points: [
			'Orb swaps add a different proc; its triggers, hit count and damage are not in this run.',
			'Same orb: recorded proc damage scales with its season’s power, assuming the orb’s CP power formula. Proc count and timing stay fixed.'
		] },
		{ label: 'Stacked buffs', kind: 'Assumed', look: adrenaline, tldr: 'Fixed engraving values, full bracelet stacks; per-stack core bonuses left out.', points: [
			'Adrenaline and other engravings use fixed book/stone damage values; stack buildup and expiry are not replayed.',
			'Stacking bracelet Weapon Power assumes full stacks throughout, including downtime.',
			'Per-stack core bonuses are left out because stack counts are not recorded.'
		] },
		{ label: 'Summons & DoTs', kind: 'Unverified', look: bleeding, tldr: 'Some Ark Grid interactions, including Heavy Bleeding, remain unverified.', points: [
			'Recorded summon/DoT damage can receive general stat scaling; specific Ark Grid interactions remain unverified.',
			'Reaper’s Heavy Bleeding core bonuses are left out: their target is not reliably mapped to logged damage.',
			'Recorded attacks and ticks stay fixed. New procs, durations and buff snapshot timing are not simulated.'
		] },
		{ label: 'Cooldown gems', kind: 'Assumed', look: blazing, tldr: 'Extra casts are estimated and can overstate the gain.', points: [
			'Extra casts use recorded time on cooldown. Without that data, cooldown gain is left out; base attack can still count.',
			'Each extra cast assumes the recorded average damage, no extra animation time or resources, and no other skill displaced. This can overstate the gain.'
		] },
		{ label: 'Conditional bracelet effects', kind: 'Not valued', look: bracelet, tldr: 'Conditional bonuses are left out; unconditional stat/damage lines count.', points: [
			'Staggered/Demon damage bonuses and HP-gated Weapon Power are left out; the model does not track when those conditions were met.',
			'Unconditional stat and damage lines count. Speed and cooldown lines are left out because the rotation is not rebuilt.'
		] }
	];
	const supportFactors: Factor[] = [
		{ label: 'Buff uptime & cooldowns', kind: 'Assumed', look: blazing, tldr: 'Buff strength changes; uptime stays fixed.', points: [
			'Buff strength changes; buff windows, uptime and dealers’ damage stay as recorded.',
			'Cooldown gems add no buff windows: cast timing and overlap are not simulated. Their base attack still counts.'
		] },
		{ label: 'Ark Passive party buffs & orbs', kind: 'Assumed', look: paradise, tldr: 'Setup changes are not simulated.', points: [
			'Assumes the same party buffs and orb setup. Their contribution stays as recorded.'
		] },
		{ label: 'New Destiny effects', kind: 'Not valued', look: order, tldr: 'New Destiny effects are left out.', points: [
			'New effects have no recorded buff window or affected damage to scale, so their contribution is left out.'
		] }
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
				<li class="min-w-0">
					<details open class="group overflow-hidden rounded-sm border border-surface-600/70 bg-surface-950/70">
						<summary class="flex cursor-pointer items-center gap-2.5 bg-surface-800/80 px-3 py-3 text-surface-100 select-none hover:bg-surface-700/80 sm:px-4">
							<span aria-hidden="true" class="text-surface-500 transition-transform group-open:rotate-90">▸</span>
							{#if factor.look}<ItemIcon src={factor.look.icon} grade={factor.look.grade} size="size-7" title={factor.look.name} />{:else}<span aria-hidden="true" class="flex size-7 shrink-0 items-center justify-center text-base text-amber-300/70">※</span>{/if}
							<span class="min-w-0 text-[13px] font-semibold">{factor.label}</span>
							<span class="ml-auto shrink-0 rounded-xs border px-1.5 py-0.5 text-[10px] {factor.kind === 'Not valued' || factor.kind === 'Unverified' ? 'border-amber-500/25 bg-amber-500/5 text-amber-300' : 'border-surface-600 bg-surface-900/60 text-surface-300'}">{factor.kind}</span>
						</summary>
						<div class="border-t border-surface-700/80 px-4 py-4 sm:px-5">
							<p class="mb-3 border-l-2 border-amber-400/60 pl-2.5 leading-relaxed text-surface-100"><span class="mr-1 font-semibold text-amber-200">TL;DR</span> {factor.tldr}</p>
							<ul class="list-disc space-y-2.5 pl-3.5 leading-relaxed text-surface-300 marker:text-surface-500">
								{#each factor.points as point (point)}<li class="pl-0.5">{point}</li>{/each}
							</ul>
						</div>
					</details>
				</li>
			{/each}
			</ul>
			{/each}
		</div>
	</section>
	<div class="mt-4 flex justify-start border-t border-amber-500/20 pt-4">
		<button type="button" class="shrink-0 rounded-xs border border-surface-600 px-3 py-1.5 text-xs text-surface-200 hover:bg-surface-800" onclick={ondismiss}>Got it</button>
	</div>
</aside>
