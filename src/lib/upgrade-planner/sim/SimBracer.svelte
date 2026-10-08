<script lang="ts">
	import { BRACER_GRADES, BRACER_LIMITS, bracerStats, type BracerGrade } from '../bracer';
	import { bracerLook } from '../icons';
	import type { SimState } from '../simulate';
	import ItemIcon from './ItemIcon.svelte';
	import Stepper from './Stepper.svelte';
	import { btn, selectClass } from './ui';

	let { sim = $bindable(), base, classId }: { sim: SimState; base: SimState; classId: string } = $props();
	const stats = $derived(bracerStats(sim.bracer));
	const changed = $derived(JSON.stringify(sim.bracer) !== JSON.stringify(base.bracer));
	const look = $derived(sim.bracer ? bracerLook(classId, sim.bracer.grade) : null);
	const details = $derived(`Main stat +${stats.mainStat.toLocaleString()} · Weapon Power +${stats.weaponPower.toLocaleString()} · Basic Atk. Power +${stats.attackFlat.toLocaleString()} / +${stats.attackPercent}% · Vitality +${stats.vitality.toLocaleString()}`);
	function setGrade(value: string) {
		if (value === 'none') { sim.bracer = null; return; }
		const grade = value as BracerGrade;
		const [min, max] = BRACER_LIMITS[grade];
		sim.bracer = { grade, honing: Math.min(max, Math.max(min, sim.bracer?.honing ?? min)) };
	}
</script>

<div class="mt-3.5 grid grid-cols-[2.5rem_minmax(0,1fr)_max-content_max-content] items-center gap-x-4 max-sm:gap-x-2">
<ItemIcon src={look?.icon} grade={look?.grade} title={look ? `${look.name} +${sim.bracer!.honing}\n${details}` : 'Bracer · Not equipped'} />
<span class="min-w-0 text-sm font-semibold text-surface-100" title={sim.bracer ? details : 'Belgardin Bracer'}>
	Bracer
	<span class="block text-[10px] font-normal text-surface-400">KR preview</span>
</span>
{#if sim.bracer}
	<Stepper bind:value={sim.bracer.honing} min={BRACER_LIMITS[sim.bracer.grade][0]} max={BRACER_LIMITS[sim.bracer.grade][1]} prefix="+" label="Bracer honing" width="w-7" {changed} />
{:else}
	<span class="text-center text-sm text-surface-500">—</span>
{/if}
<select aria-label="Bracer grade" class="{selectClass(changed)} w-28 min-w-0 max-sm:w-24" value={sim.bracer?.grade ?? 'none'} onchange={(e) => setGrade(e.currentTarget.value)}>
	<option value="none">None</option>
	{#each BRACER_GRADES as grade}
		<option value={grade}>{grade[0].toUpperCase() + grade.slice(1)}</option>
	{/each}
</select>
<div class="col-span-full mt-1.5 flex justify-end gap-1.5">
	<button type="button" class={btn} aria-label="Reset bracer" onclick={() => (sim.bracer = base.bracer ? { ...base.bracer } : null)}>Reset</button>
</div>
</div>
