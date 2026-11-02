<script lang="ts">
	import { day, STATUS_TONE, type ReportEvent } from '$lib/reports';

	let { data } = $props();
	const r = $derived(data.report);
	const ACTION: Record<Exclude<ReportEvent['kind'], 'comment'>, string> = {
		assigned: 'is on it',
		done: 'marked it done',
		closed: 'closed it',
		reopened: 'reopened it'
	};
</script>

<svelte:head>
	<title>#{r.number} {r.title} · loa-sim</title>
</svelte:head>

{#snippet name(by: string, dev: boolean)}
	<span class="font-semibold {dev ? 'text-accent-200' : 'text-surface-100'}">{by}</span>{#if dev}<span class="ml-1.5 rounded-xs border border-accent-500/60 px-1 text-[10px] font-semibold tracking-wide text-accent-200 uppercase">dev</span>{/if}
{/snippet}

<article class="mx-auto flex max-w-3xl flex-col gap-3">
	<a href="/reports" class="text-xs text-surface-400 hover:text-surface-100">← Reports</a>
	<header class="flex flex-col gap-2 rounded-xs bg-surface-900 px-4 py-3 shadow-sm shadow-neutral-800">
		<h1 class="text-lg font-bold text-surface-50"><span class="mr-1.5 font-normal text-surface-500">#{r.number}</span>{r.title}</h1>
		<div class="flex flex-row flex-wrap items-center gap-x-3 gap-y-1 text-xs text-surface-400">
			<span class="rounded-xs border px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase {STATUS_TONE[r.status]}">{r.status}</span>
			{#if r.kind}<span>{r.kind}</span>{/if}
			{#if r.character}<span>{r.character}</span>{/if}
			<span class="ml-auto tabular-nums">{day(r.created)}</span>
		</div>
	</header>

	<ol class="flex flex-col gap-3">
		<li class="rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
			<div class="bg-black/10 px-4 py-2 text-xs">{@render name(r.author ?? 'Player', r.author === null ? false : r.author === data.dev)}</div>
			{#if r.text !== undefined}
				<p class="px-4 py-3 text-sm whitespace-pre-wrap text-surface-200">{r.text}</p>
			{:else}
				<!-- GitHub's own rendering of the issue's Markdown (sanitized by GitHub). -->
				<div class="gh-body px-4 py-3 text-sm text-surface-200">{@html r.html}</div>
			{/if}
		</li>
		{#each r.timeline as e, i (i)}
			{#if e.kind === 'comment'}
				<li class="rounded-xs bg-surface-900 shadow-sm shadow-neutral-800 {e.dev ? 'border-l-2 border-accent-500/70' : ''}">
					<div class="flex flex-row items-center bg-black/10 px-4 py-2 text-xs">
						{@render name(e.by, e.dev)}
						<span class="ml-auto text-surface-500 tabular-nums">{day(e.at)}</span>
					</div>
					<div class="gh-body px-4 py-3 text-sm text-surface-200">{@html e.html}</div>
				</li>
			{:else}
				<li class="flex flex-row items-center gap-2 px-4 text-xs text-surface-400">
					<span class="size-1.5 rounded-full {e.kind === 'done' ? 'bg-green-400' : e.kind === 'assigned' ? 'bg-accent-400' : 'bg-surface-500'}" aria-hidden="true"></span>
					<span>{@render name(e.by, e.dev)} {ACTION[e.kind]}</span>
					<span class="ml-auto tabular-nums text-surface-500">{day(e.at)}</span>
				</li>
			{/if}
		{/each}
	</ol>
</article>

<style>
	.gh-body :global(p + p),
	.gh-body :global(ul),
	.gh-body :global(ol),
	.gh-body :global(pre),
	.gh-body :global(blockquote) { margin-top: 0.6rem; }
	.gh-body :global(ul) { list-style: disc; padding-left: 1.25rem; }
	.gh-body :global(ol) { list-style: decimal; padding-left: 1.25rem; }
	.gh-body :global(a) { color: var(--color-accent-300); text-decoration: underline; }
	.gh-body :global(code) { font-family: var(--font-mono); font-size: 0.85em; background: rgb(0 0 0 / 0.3); padding: 0.1em 0.3em; border-radius: 2px; }
	.gh-body :global(pre) { background: rgb(0 0 0 / 0.3); padding: 0.6rem; overflow-x: auto; border-radius: 2px; }
	.gh-body :global(pre code) { background: none; padding: 0; }
	.gh-body :global(blockquote) { border-left: 2px solid var(--color-surface-600); padding-left: 0.75rem; color: var(--color-surface-400); }
	.gh-body :global(img) { max-width: 100%; border-radius: 2px; }
	.gh-body :global(h1),
	.gh-body :global(h2),
	.gh-body :global(h3) { font-weight: 600; color: var(--color-surface-100); margin-top: 0.8rem; }
</style>
