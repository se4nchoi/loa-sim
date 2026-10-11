<!-- What's new, and known issues / what's planned, with a link to report one. Entries live in site-news.ts. Shown as
     the landing page's side card on desktop and inside SiteNewsStrip on phones (`heading` off: the strip is the title). -->
<script lang="ts">
	import { onMount, type Snippet } from 'svelte';
	import Segmented from '$lib/upgrade-planner/sim/Segmented.svelte';
	import { ISSUES, ISSUES_URL, UPDATES, type IssueStatus, type UpdateKind } from '$lib/site-news';
	import { isFresh, readNewsSeen } from '$lib/news-seen.svelte';
	import ReportDialog from '$lib/ReportDialog.svelte';

	let { heading = true, class: cls = '' }: { heading?: boolean; class?: string } = $props();

	const SHORT = 8;
	type Tab = 'updates' | 'issues';
	let tab = $state<Tab>('updates');
	let all = $state(false);
	/** Unfolded rows, by tab and index ("u3", "i0"). */
	let open = $state<Record<string, boolean>>({});
	/** Unfolded rows whose title didn't fit its line: the full title opens the text below instead. */
	let cut = $state<Record<string, boolean>>({});
	function toggle(key: string, button: HTMLElement) {
		const title = button.querySelector<HTMLElement>('[data-title]');
		cut[key] = !!title && title.scrollWidth > title.clientWidth;
		open[key] = !open[key];
	}
	onMount(readNewsSeen);
	let reporting = $state(false);

	const freshCount = $derived(UPDATES.filter((u) => isFresh(u.date)).length);
	const shown = $derived(all ? UPDATES : UPDATES.slice(0, SHORT));
	const KIND: Record<UpdateKind, string> = {
		new: 'border-accent-500/60 text-accent-200',
		improved: 'border-sky-500/50 text-sky-300',
		fix: 'border-green-500/50 text-green-300'
	};
	const STATUS: Record<IssueStatus, string> = {
		'in progress': 'border-accent-500/60 text-accent-200',
		planned: 'border-sky-500/50 text-sky-300',
		'known issue': 'border-amber-400/60 text-amber-200',
		investigating: 'border-surface-500 text-surface-300'
	};
	/** YYYY-MM-DD → MM-DD-YY. */
	const day = (d: string) => `${d.slice(5, 7)}-${d.slice(8, 10)}-${d.slice(2, 4)}`;
</script>

{#snippet badge(text: string, tone: string, width: string)}
	<span class="shrink-0 rounded-xs border py-0.5 text-center text-[10px] font-semibold tracking-wide whitespace-nowrap uppercase {width} {tone}">{text}</span>
{/snippet}

{#snippet chevron(up: boolean)}
	<svg class="size-3 shrink-0 text-surface-500 transition {up ? 'rotate-180' : ''}" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M2 4l4 4 4-4z" /></svg>
{/snippet}

<!-- One foldable line, like a notice board: [date] title tag. The title stays on one line; unfolded, a title that
     didn't fit opens the text below in full (so the row never grows tall), then the points as bullets. -->
{#snippet line(key: string, title: string, points: string[] | undefined, tag: Snippet, lead?: Snippet)}
	<li>
		<button
			type="button"
			class="flex w-full flex-row items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/[0.03]"
			aria-expanded={!!open[key]}
			onclick={(e) => toggle(key, e.currentTarget)}
		>
			{@render lead?.()}
			<span data-title class="min-w-0 flex-1 truncate text-surface-100">{title}</span>
			{@render tag()}
			{@render chevron(!!open[key])}
		</button>
		{#if open[key] && (cut[key] || points?.length)}
			<div class="px-3 pt-0.5 pb-2.5 text-xs text-surface-200">
				{#if cut[key]}<p class="text-sm text-surface-100">{title}</p>{/if}
				{#if points?.length}<ul class="mt-1 list-disc space-y-0.5 pl-5 marker:text-surface-500">{#each points as point (point)}<li>{point}</li>{/each}</ul>{/if}
			</div>
		{/if}
	</li>
{/snippet}

<section aria-label="Updates and known issues" class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800 {cls}">
	<div class="flex flex-row items-center gap-2 bg-black/10 px-3 py-2">
		{#if heading}
			<span class="font-bold">Updates</span>
			{#if freshCount}<span class="rounded-full bg-accent-700 px-1.5 text-[10px] font-bold text-white">{freshCount} new</span>{/if}
		{/if}
		<span class={heading ? 'ml-auto' : 'flex-1 [&>div]:w-full'}>
			<Segmented
				value={tab}
				options={[
					{ value: 'updates', label: "What's new" },
					{ value: 'issues', label: 'Issues & Plans' }
				]}
				onselect={(v) => (tab = v)}
				label="Updates or known issues"
				size="h-7 flex-1 px-2 text-xs whitespace-nowrap"
			/>
		</span>
	</div>
	<div class="scroll-muted min-h-0 flex-1 divide-y divide-neutral-950 overflow-y-auto">
		{#if tab === 'updates'}
			<ul class="flex flex-col divide-y divide-neutral-950">
				{#each shown as u, i (i)}
					{#snippet lead()}
						<span class="flex w-[3.6rem] shrink-0 items-center gap-1 text-xs text-surface-500 tabular-nums">
							{day(u.date)}{#if isFresh(u.date)}<span class="size-1.5 rounded-full bg-accent-400" aria-label="New since your last visit"></span>{/if}
						</span>
					{/snippet}
					{#snippet tag()}{@render badge(u.kind, KIND[u.kind], 'w-[4.5rem]')}{/snippet}
					{@render line(`u${i}`, u.title, u.points, tag, lead)}
				{/each}
			</ul>
			{#if UPDATES.length > SHORT}
				<button
					type="button"
					class="flex w-full flex-row items-center justify-center gap-1.5 px-3 py-2 text-xs text-surface-400 hover:text-surface-100"
					aria-expanded={all}
					onclick={() => (all = !all)}
				>
					{all ? 'Show fewer' : `Show all ${UPDATES.length}`}{@render chevron(all)}
				</button>
			{/if}
		{:else}
			<ul class="flex flex-col divide-y divide-neutral-950">
				{#each ISSUES as issue, i (issue.title)}
					{#snippet tag()}{@render badge(issue.status, STATUS[issue.status], 'w-[6.5rem]')}{/snippet}
					{@render line(`i${i}`, issue.title, issue.points, tag)}
				{/each}
			</ul>
		{/if}
	</div>
	<div class="flex flex-col gap-1 px-3 py-2 text-xs text-surface-400">
		<span>Found a bug or want something?</span>
		<div class="flex flex-row gap-3">
			<button type="button" class="text-accent-300 underline hover:text-accent-200" aria-haspopup="dialog" onclick={() => (reporting = true)}>Report it</button>
			<a class="text-surface-400 underline hover:text-surface-100" href={ISSUES_URL} target="_blank" rel="noopener">All reports ↗</a>
		</div>
	</div>
</section>
{#if reporting}<ReportDialog onclose={() => (reporting = false)} />{/if}
