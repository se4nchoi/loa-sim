<script lang="ts">
	let {title,rows,note}: {title:string;rows:[string,number][];note?:string}=$props();
	const total=$derived(rows.reduce((sum,[,count])=>sum+count,0));
	const max=$derived(Math.max(1,...rows.map(([,count])=>count)));
</script>

<section class="rounded-xl border border-neutral-800 bg-neutral-900/40 p-5">
	<h2 class="font-semibold">{title}</h2>
	{#if note}<p class="mt-1 text-xs text-surface-400">{note}</p>{/if}
	{#if total}
		<div class="mt-5 space-y-3">
			{#each rows as [label,count]}
				{#if count}<div><div class="mb-1.5 flex items-baseline justify-between gap-3"><span class="text-sm text-surface-200">{label}</span><strong class="text-sm text-accent-300 tabular-nums">{count.toLocaleString()}</strong></div><div class="h-1 overflow-hidden rounded-full bg-neutral-800"><div class="h-full rounded-full bg-accent-500/70" style:width={`${count/max*100}%`}></div></div></div>{/if}
			{/each}
		</div>
	{:else}<p class="mt-4 text-sm text-surface-400">No samples yet</p>{/if}
</section>
