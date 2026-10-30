<script lang="ts">
	import {MODEL_LABELS,SKIP_LABELS,samplingDiagnostics} from './stats-report';
	let {totals}:{totals:Record<string,number>}=$props();
	const rows=$derived(samplingDiagnostics(totals));
	const labels:Record<string,string>={opportunity:'Recommendations',decision:'Applied choices',budget:'Budget close / unmount',plan:'Named saves'};
</script>

<section class="min-w-0 rounded-xl border border-neutral-800 bg-neutral-900/40">
	<div class="p-5"><h2 class="font-semibold">Collection health</h2><p class="mt-1 text-xs text-surface-400">New tracking only · each received attempt has a sample or an exclusion reason. Legacy actions and undelivered events are outside these totals.</p></div>
	{#if rows.length}
		<div class="overflow-x-auto"><table class="w-full min-w-[650px] text-left text-xs tabular-nums">
			<thead class="bg-neutral-900 text-surface-400"><tr>{#each ['Model','Observation','Attempts','Sampled','Excluded','Reconciliation'] as heading}<th class="px-5 py-3 font-medium">{heading}</th>{/each}</tr></thead>
			<tbody>{#each rows as row}<tr class="border-t border-neutral-800/60"><td class="px-5 py-3 text-surface-300">{MODEL_LABELS[row.model]}</td><td class="px-5 py-3">{labels[row.kind]}</td><td class="px-5 py-3">{row.attempts.toLocaleString()}</td><td class="px-5 py-3 text-accent-300">{row.sampled.toLocaleString()}</td><td class="px-5 py-3">{row.excluded.toLocaleString()}</td><td class="px-5 py-3 {row.difference?'text-amber-300':'text-emerald-400'}">{row.difference?`${row.difference.toLocaleString()} unmatched`:'Balanced'}</td></tr>{/each}</tbody>
		</table></div>
		{#if rows.some(r=>r.skipped.length)}<div class="grid gap-4 border-t border-neutral-800 p-5 sm:grid-cols-2 lg:grid-cols-4">{#each rows.filter(r=>r.skipped.length) as row}<div><h3 class="text-sm font-medium">{labels[row.kind]}</h3><p class="mt-1 text-xs text-surface-500">{MODEL_LABELS[row.model]}</p><ul class="mt-3 space-y-2 text-xs">{#each row.skipped as skip}<li class="flex justify-between gap-3"><span class="text-surface-300">{SKIP_LABELS[skip.reason]}</span><strong class="text-amber-200 tabular-nums">{skip.count.toLocaleString()}</strong></li>{/each}</ul></div>{/each}</div>{/if}
	{:else}<p class="px-5 pb-5 text-sm text-surface-400">No diagnostic receipts in this date range yet. They accumulate after the collection fix.</p>{/if}
</section>
