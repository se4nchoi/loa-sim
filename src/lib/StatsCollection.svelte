<script lang="ts">
	import StatsBars from './StatsBars.svelte';
	import {statsBreakdown} from './stats-model';
	import {CP_BUCKETS} from './plan-stats';
	import {CATEGORY_LABELS,type UpgradeCategory} from './upgrade-planner/upgrades';
	import {GOLD_LABELS,ASSUMPTION_LABELS,MODEL_LABELS,affordableOffers,budgetCurves,choicePairs,recommendations,type SampleRow} from './stats-report';
	import {CP_STATS_MODEL,CP_STATS_MODELS} from './stats-versions';
	let {totals,view}:{totals:Record<string,number>;view:'exploration'|'plans'}=$props();
	const sections:Record<string,string>={gear:'Equipment',accessories:'Accessories',bracelet:'Bracelet',skins:'Skins',gems:'Gems',engravings:'Engravings',arkGrid:'Ark Grid',karma:'Karma',paradise:'Paradise',none:'No positive gain',tie:'Tied systems'};
	const bound:Record<string,string>={none:'No bound materials',some:'Bound + market',all:'All materials bound',na:'No material breakdown'};
	const gain=(key:string)=>CP_BUCKETS.find(([k])=>k===key)?.[1]??key;
	const category=(key:string)=>CATEGORY_LABELS[key as UpgradeCategory]??key;
	const rows=(prefix:string,labels:Record<string,string>={})=>statsBreakdown(totals,prefix).map(([key,count])=>[labels[key]??key,count] as [string,number]);
	let model=$state<string>(CP_STATS_MODEL);
	let coverage=$state('all');
	const coverageLabel=(key:string)=>({complete:'Fully priced',partial:'Partly priced',unpriced:'Unpriced'}[key]??key);
	const curves=$derived(budgetCurves(totals,model));
	const offers=$derived(affordableOffers(totals,model,coverage));
	const pairs=$derived(choicePairs(totals,model,coverage));
	const leaders=$derived(recommendations(totals,model,coverage));
	function distribution(samples:SampleRow[],at:number,label:(key:string)=>string):[string,number][] {
		const grouped=new Map<string,number>();
		for(const row of samples)grouped.set(row.dimensions[at],(grouped.get(row.dimensions[at])??0)+row.count);
		return [...grouped].sort((a,b)=>b[1]-a[1]).map(([key,n])=>[label(key),n]);
	}
	const rank=(key:string)=>({best:'Best observed',other:'Another upgrade',unpriced:'Unpriced choice'}[key]??key);
</script>

{#if view==='exploration'}
	<p class="text-xs text-surface-400">Budget overview · all recorded models in the selected dates</p>
	<div class="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
		<StatsBars title="Budget price coverage" rows={rows('budget:coverage:',{complete:'Fully priced',partial:'Partly priced',unpriced:'Unpriced',empty:'No changes'})}/>
		<StatsBars title="Complete budget cost" rows={rows('budget:cost:',GOLD_LABELS)} note="Estimated average gold · fully priced views only"/>
		<StatsBars title="Bound-material use" rows={rows('budget:bound:',bound)}/>
		<StatsBars title="Budget assumptions" rows={rows('budget:assumption:',ASSUMPTION_LABELS)}/>
		<StatsBars title="Unpriced budget reasons" rows={rows('budget:limitation:',{rng:'RNG upgrades',unavailable:'Unsupported cost',excluded:'Excluded or downgraded', 'missing-price':'Missing prices'})} note="A budget can have more than one reason"/>
	</div>
	<div class="flex flex-wrap items-end justify-between gap-4 border-t border-neutral-800 pt-5">
		<div><h2 class="font-semibold">Comparisons with recorded context</h2><p class="mt-1 text-xs text-surface-400">Partial pricing covers only priced steps. Cost assumptions remain separate in the tables.</p></div>
		<div class="flex flex-wrap gap-3 text-xs">
			<label class="space-y-1"><span class="block text-surface-400">CP model</span><select aria-label="Comparison CP model" bind:value={model} class="h-9 max-w-full rounded border border-neutral-700 bg-neutral-900 px-2">{#each [...CP_STATS_MODELS].reverse() as id}<option value={id}>{MODEL_LABELS[id]}</option>{/each}</select></label>
			<label class="space-y-1"><span class="block text-surface-400">Comparison price coverage</span><select aria-label="Comparison price coverage" bind:value={coverage} class="h-9 rounded border border-neutral-700 bg-neutral-900 px-2"><option value="all">All coverage</option><option value="complete">Fully priced only</option><option value="partial">Partly priced only</option><option value="unpriced">Unpriced choices only</option></select></label>
		</div>
	</div>
	{#if model!==CP_STATS_MODEL}<p class="rounded-md border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-200">Historical tag spans the Vambraces CP correction. Old pooled recommendations lack per-offer context and are not included in these comparison tables.</p>{/if}
	<div class="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
		<StatsBars title="Recommended categories" rows={distribution(leaders,4,category)} note="Best CP per gold among priced candidates"/>
		<StatsBars title="Choices in Per gold mode" rows={distribution(pairs.filter(r=>r.dimensions[2]==='gold'),7,rank)}/>
		<StatsBars title="Choices in Most CP mode" rows={distribution(pairs.filter(r=>r.dimensions[2]==='cp'),7,rank)}/>
	</div>
	{#each [
		{title:'Best-value recommendations',heads:['Schema','Coverage','Upgrade','Assumptions','Samples'],data:leaders.map(r=>({cells:[r.dimensions[0],coverageLabel(r.dimensions[2]),category(r.dimensions[4]),ASSUMPTION_LABELS[r.dimensions[3]]],count:r.count}))},
		{title:'Single-step offers by gold ceiling',heads:['Schema','Coverage','Up to','Upgrade','CP gain','Assumptions','Samples'],data:offers.map(r=>({cells:[r.dimensions[0],coverageLabel(r.dimensions[2]),r.dimensions[3],category(r.dimensions[4]),gain(r.dimensions[5]),ASSUMPTION_LABELS[r.dimensions[6]]],count:r.count}))},
		{title:'Complete budget views by cost and CP gain',heads:['Gold','CP gain','Material use','Assumptions','Views'],data:curves.map(r=>({cells:[GOLD_LABELS[r.dimensions[1]],gain(r.dimensions[2]),bound[r.dimensions[3]],ASSUMPTION_LABELS[r.dimensions[4]]],count:r.count}))},
		{title:'Recommendation versus applied choice',heads:['Schema','Mode','Coverage','Recommended','Chosen','Rank','CP gain','Gold','Assumptions','Choices'],data:pairs.map(r=>({cells:[r.dimensions[0],r.dimensions[2]==='gold'?'Per gold':'Most CP',coverageLabel(r.dimensions[3]),r.dimensions[5]==='none'?'—':category(r.dimensions[5]),category(r.dimensions[6]),rank(r.dimensions[7]),gain(r.dimensions[8]),GOLD_LABELS[r.dimensions[9]]??'Unpriced',ASSUMPTION_LABELS[r.dimensions[4]]],count:r.count}))}
	] as table}
		<section class="min-w-0 rounded-xl border border-neutral-800 bg-neutral-900/40"><h2 class="px-5 pt-5 pb-3 font-semibold">{table.title}</h2>
			{#if table.data.length}<div class="max-h-80 overflow-auto"><table class="w-full min-w-[680px] text-left text-xs"><thead class="sticky top-0 bg-neutral-900 text-surface-400"><tr>{#each table.heads as head}<th class="px-5 py-3 font-medium last:text-right">{head}</th>{/each}</tr></thead><tbody>{#each table.data.slice(0,100) as row}<tr class="border-t border-neutral-800/60">{#each row.cells as cell}<td class="px-5 py-3 text-surface-200">{cell}</td>{/each}<td class="px-5 py-3 text-right font-semibold text-accent-300 tabular-nums">{row.count.toLocaleString()}</td></tr>{/each}</tbody></table></div>{#if table.data.length>100}<p class="px-5 py-3 text-xs text-surface-400">Most common 100 combinations · all counters available below</p>{/if}
			{:else}<p class="px-5 pb-5 text-surface-400">No samples yet</p>{/if}
		</section>
	{/each}
{:else}
	<div class="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
		<StatsBars title="Plan shapes" rows={rows('plan:shape:',{unchanged:'Unchanged','weapon-only':'Weapon only','single-system':'Single system',mixed:'Mixed systems'})}/>
		<StatsBars title="Changed systems" rows={rows('plan:section:',sections)} note="A plan can change multiple systems"/>
		<StatsBars title="Strongest standalone system gain" rows={rows('plan:dominant:',sections)}/>
		<StatsBars title="Weapon targets" rows={rows('plan:weapon:',{under20:'Below +20','20to24':'+20–24','25':'+25',sidereal:'Sidereal'})}/>
		<StatsBars title="Gem targets" rows={rows('plan:gems:',{under9:'Below level 9','9':'Level 9',some10:'Some level 10',all10:'All level 10'})}/>
		<StatsBars title="Item-level milestones crossed" rows={rows('plan:milestone:')} note="A plan can cross multiple milestones"/>
	</div>
{/if}
