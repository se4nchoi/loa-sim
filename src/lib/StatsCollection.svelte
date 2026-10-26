<script lang="ts">
	import StatsBars from './StatsBars.svelte';
	import {statsBreakdown} from './stats-model';
	import {CP_BUCKETS} from './plan-stats';
	import {CATEGORY_LABELS,type UpgradeCategory} from './upgrade-planner/upgrades';
	import {GOLD_LABELS,ASSUMPTION_LABELS,affordableOffers,budgetCurves,choicePairs} from './stats-report';
	let {totals,view}:{totals:Record<string,number>;view:'exploration'|'plans'}=$props();
	const sections:Record<string,string>={gear:'Equipment',accessories:'Accessories',bracelet:'Bracelet',skins:'Skins',gems:'Gems',engravings:'Engravings',arkGrid:'Ark Grid',karma:'Karma',paradise:'Paradise',none:'No positive gain',tie:'Tied systems'};
	const bound:Record<string,string>={none:'No bound materials',some:'Bound + market',all:'All materials bound',na:'No material breakdown'};
	const gain=(key:string)=>CP_BUCKETS.find(([k])=>k===key)?.[1]??key;
	const category=(key:string)=>CATEGORY_LABELS[key as UpgradeCategory]??key;
	const rows=(prefix:string,labels:Record<string,string>={})=>statsBreakdown(totals,prefix).map(([key,count])=>[labels[key]??key,count] as [string,number]);
	const curves=$derived(budgetCurves(totals));
	const offers=$derived(affordableOffers(totals));
	const pairs=$derived(choicePairs(totals));
</script>

{#if view==='exploration'}
	<div class="grid items-start gap-5 sm:grid-cols-2 lg:grid-cols-3">
		<StatsBars title="Budget price coverage" rows={rows('budget:coverage:',{complete:'Fully priced',partial:'Partly priced',unpriced:'Unpriced',empty:'No changes'})}/>
		<StatsBars title="Complete budget cost" rows={rows('budget:cost:',GOLD_LABELS)} note="Estimated average gold · fully priced views only"/>
		<StatsBars title="Bound-material use" rows={rows('budget:bound:',bound)}/>
		<StatsBars title="Budget assumptions" rows={rows('budget:assumption:',ASSUMPTION_LABELS)}/>
		<StatsBars title="Unpriced budget reasons" rows={rows('budget:limitation:',{rng:'RNG upgrades',unavailable:'Unsupported cost',excluded:'Excluded or downgraded', 'missing-price':'Missing prices'})} note="A budget can have more than one reason"/>
		<StatsBars title="Best observed CP per gold" rows={rows('opportunity:best:',CATEGORY_LABELS)} note="Single-step recommendations within entered price coverage"/>
		<StatsBars title="Recommendation price coverage" rows={rows('opportunity:coverage:',{complete:'All eligible steps priced',partial:'Some steps unpriced'})}/>
		<StatsBars title="Choices in Per gold mode" rows={rows('decision:rank:gold:',{best:'Best observed value',other:'Another upgrade',unpriced:'Unpriced choice'})}/>
		<StatsBars title="Choices in Most CP mode" rows={rows('decision:rank:cp:',{best:'Highest CP gain',other:'Another upgrade'})}/>
	</div>
	{#each [
		{title:'Single-step offers by gold ceiling',heads:['Model','Up to','Upgrade','CP gain','Assumptions','Samples'],data:offers.map(r=>({cells:[r.dimensions[0],r.dimensions[1],category(r.dimensions[2]),gain(r.dimensions[3]),ASSUMPTION_LABELS[r.dimensions[4]]],count:r.count}))},
		{title:'Complete budget views by cost and CP gain',heads:['Model','Gold','CP gain','Material use','Assumptions','Views'],data:curves.map(r=>({cells:[r.dimensions[0],GOLD_LABELS[r.dimensions[1]],gain(r.dimensions[2]),bound[r.dimensions[3]],ASSUMPTION_LABELS[r.dimensions[4]]],count:r.count}))},
		{title:'Recommendation versus applied choice',heads:['Rank mode','Recommended','Chosen','Assumptions','Choices'],data:pairs.map(r=>({cells:[r.dimensions[0]==='gold'?'Per gold':'Most CP',category(r.dimensions[1]),category(r.dimensions[2]),ASSUMPTION_LABELS[r.dimensions[3]]],count:r.count}))}
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
