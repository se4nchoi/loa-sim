<script lang="ts">
	import { BRACER_GRADES, BRACER_LIMITS, bracerStats, type BracerGrade } from '../bracer';
	import { bracerLook } from '../icons';
	import { itemLevel, type SimState } from '../simulate';
	import ItemIcon from './ItemIcon.svelte';
	import VambraceSlot from './VambraceSlot.svelte';
	import Stepper from './Stepper.svelte';
	import { btn, btnAccent, selectClass } from './ui';

	let { sim = $bindable(), base, classId }: { sim: SimState; base: SimState; classId: string } = $props();
	const stats = $derived(bracerStats(sim.bracer));
	const changed = $derived(JSON.stringify(sim.bracer) !== JSON.stringify(base.bracer));
	const look = $derived(sim.bracer ? bracerLook(classId, sim.bracer.grade) : null);
	const simulatedLevel = $derived(itemLevel(sim));
	const locked = $derived(!sim.bracer && simulatedLevel !== null && simulatedLevel < 1750);
	const details = $derived(`Main stat +${stats.mainStat.toLocaleString()} · Weapon Power +${stats.weaponPower.toLocaleString()} · Basic Atk. Power +${stats.attackFlat.toLocaleString()} / +${stats.attackPercent}% · Vitality +${stats.vitality.toLocaleString()}`);
	function setGrade(value: string) {
		if (value === 'none') { sim.bracer = null; return; }
		const grade = value as BracerGrade;
		const [min, max] = BRACER_LIMITS[grade];
		sim.bracer = { grade, honing: Math.min(max, Math.max(min, sim.bracer?.honing ?? min)) };
	}
</script>

<!-- Equipped Vambraces use their gear frame; empty slots follow the simulated item level. -->
<div class="flex flex-wrap items-center gap-3 border-t border-surface-800 py-3" role="group" aria-label="Vambraces">
	<div class="flex min-w-36 flex-1 items-center gap-3">
		{#if look}
			<ItemIcon src={look.icon} grade={look.grade} frame="evolution" inherited title={`${look.name} +${sim.bracer!.honing}
${details}`} />
		{:else}
			<VambraceSlot {locked} />
		{/if}
		<span class="min-w-0 text-sm font-semibold text-surface-100" title={sim.bracer ? details : 'Belgardin Vambraces'}>Vambraces</span>
	</div>
	<div class="ml-auto flex shrink-0 items-center gap-2">
		<div class="flex flex-col items-center gap-1">
			<span class="text-[10px] text-surface-400">Honing</span>
			{#if sim.bracer}
				<Stepper bind:value={sim.bracer.honing} min={BRACER_LIMITS[sim.bracer.grade][0]} max={BRACER_LIMITS[sim.bracer.grade][1]} prefix="+" label="Vambraces honing" width="w-7" {changed} />
			{:else}
				<span class="flex h-8 w-24 items-center justify-center text-sm text-surface-500">—</span>
			{/if}
		</div>
		<div class="flex flex-col items-center gap-1">
			<span class="text-[10px] text-surface-400">Grade</span>
			<select aria-label="Vambraces grade" disabled={locked} title={locked ? 'Requires item level 1750' : undefined} class="{selectClass(changed)} w-24 min-w-0 disabled:opacity-40" value={sim.bracer?.grade ?? 'none'} onchange={(e) => setGrade(e.currentTarget.value)}>
				<option value="none">None</option>
				{#each BRACER_GRADES as grade}
					<option value={grade}>{grade[0].toUpperCase() + grade.slice(1)}</option>
				{/each}
			</select>
		</div>
		<div class="flex flex-col gap-1">
			<button type="button" class="{btnAccent} px-2 disabled:opacity-40" disabled={locked} title={locked ? 'Requires item level 1750' : undefined} aria-label="Max vambraces" onclick={() => (sim.bracer = { grade: 'ancient', honing: BRACER_LIMITS.ancient[1] })}>Max</button>
			<button type="button" class="{btn} px-2" aria-label="Reset vambraces" onclick={() => (sim.bracer = base.bracer ? { ...base.bracer } : null)}>Reset</button>
		</div>
	</div>
</div>
