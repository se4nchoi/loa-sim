<!-- Report a bug or ask for a feature without a GitHub account: the site files it as a GitHub issue (/api/report).
     Opened from the Updates card. -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { sheetDrag } from '$lib/upgrade-planner/sim/sheet-drag';
	import { btn, btnAccent } from '$lib/upgrade-planner/sim/ui';
	import Segmented from '$lib/upgrade-planner/sim/Segmented.svelte';
	import { REPORT_KINDS, REPORT_LIMITS, REPORT_MIN, type ReportKind } from '$lib/report';
	import { NEW_ISSUE_URL } from '$lib/site-news';

	let { onclose }: { onclose: () => void } = $props();

	let dialog: HTMLDialogElement;
	let card = $state<HTMLDivElement>();
	onMount(() => {
		dialog.showModal();
		dialog.focus();
	});

	let kind = $state<ReportKind>('bug');
	let title = $state('');
	let body = $state('');
	let character = $state('');
	let contact = $state('');
	let website = $state('');
	let sending = $state(false);
	let error = $state<string | null>(null);
	/** Set once sent: the new issue's link. */
	let sentUrl = $state<string | null>(null);

	const ready = $derived(title.trim().length >= REPORT_MIN.title && body.trim().length >= REPORT_MIN.body);
	/** Why Send is off, once something has been typed. */
	const missing = $derived(
		!title.trim() && !body.trim() ? '' : title.trim().length < REPORT_MIN.title ? 'Add a title' : body.trim().length < REPORT_MIN.body ? 'Add a few more words to Details' : ''
	);
	const PLACEHOLDER: Record<ReportKind, { title: string; body: string }> = {
		bug: { title: 'Gem card runs off the screen on my phone', body: 'What happened, and what you expected instead. Steps to get there help a lot.' },
		feature: { title: 'Show CP per gold for bracelets', body: 'What you’d like, and how you’d use it.' },
		data: { title: 'Bracelet CP is off by ~10', body: 'Which number looks wrong, what you expected, and where the right one comes from (in game, lostark.bible, …).' }
	};

	async function send(e: SubmitEvent) {
		e.preventDefault();
		if (!ready || sending) return;
		sending = true;
		error = null;
		try {
			const res = await fetch('/api/report', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ kind, title, body, character, contact, website, page: page.url.pathname })
			});
			const out = await res.json().catch(() => null);
			if (!res.ok) throw new Error(out?.message ?? `Sending failed (${res.status})`);
			sentUrl = out?.url ?? null;
			if (!sentUrl) sentUrl = '';
		} catch (err) {
			error = err instanceof Error ? err.message : String(err);
		} finally {
			sending = false;
		}
	}

	const field = 'w-full rounded-xs border border-surface-600 bg-surface-800 px-3 py-2 text-sm text-surface-100 placeholder:text-surface-500 hover:border-surface-400 focus:border-accent-500 focus:outline-none';
	const label = 'flex flex-col gap-1 text-xs text-surface-400';
</script>

<dialog
	bind:this={dialog}
	tabindex="-1"
	{onclose}
	onclick={(e) => {
		e.stopPropagation();
		if (e.target === dialog) dialog.close();
	}}
	aria-label="Report a bug or request a feature"
	class="fixed top-[60px] m-0 max-h-none max-w-none bg-transparent p-0 text-surface-100 outline-none backdrop:bg-black/60 max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:w-full sm:left-1/2 sm:-translate-x-1/2"
>
	<div
		bind:this={card}
		class="flex max-h-[85dvh] w-[520px] max-w-[calc(100vw-1.5rem)] flex-col rounded-xs bg-surface-900 shadow-sm shadow-neutral-800 max-sm:w-full max-sm:max-w-none max-sm:animate-[sheet-up_320ms_cubic-bezier(0.22,1,0.36,1)] max-sm:rounded-t-xl max-sm:rounded-b-none"
	>
		<div
			class="flex shrink-0 flex-wrap items-start gap-3 border-b border-neutral-950 px-4 py-3 max-sm:gap-y-1"
			use:sheetDrag={{ sheet: () => card, close: () => dialog.close(), slideOut: true, enabled: () => matchMedia('(max-width: 639px)').matches }}
		>
			<span class="flex basis-full justify-center pb-1 sm:hidden"><span class="h-1.5 w-12 rounded-full bg-surface-500"></span></span>
			<div class="min-w-0 flex-1">
				<h2 class="font-semibold">Report a bug or request a feature</h2>
				<p class="mt-0.5 text-xs text-surface-400">No account needed. It's posted as a public GitHub issue.</p>
			</div>
			<button type="button" class={btn} onclick={() => dialog.close()} aria-label="Close report">Close</button>
		</div>

		{#if sentUrl !== null}
			<div class="flex flex-col items-start gap-3 p-4 text-sm">
				<p class="font-semibold text-green-400">Thanks, it's sent!</p>
				<p class="text-surface-300">It's now on the issue list, where you can follow it.</p>
				<div class="flex flex-row gap-2">
					{#if sentUrl}<a class={btnAccent} href={sentUrl} target="_blank" rel="noopener">View it ↗</a>{/if}
					<button type="button" class={btn} onclick={() => dialog.close()}>Done</button>
				</div>
			</div>
		{:else}
			<form class="flex min-h-0 flex-col gap-3 overflow-y-auto p-4" onsubmit={send}>
				<Segmented value={kind} options={REPORT_KINDS.map((k) => ({ value: k.value, label: k.label }))} onselect={(v) => (kind = v)} label="Kind of report" size="h-8 flex-1 px-2 text-xs whitespace-nowrap" />
				<label class={label}>
					Title
					<input bind:value={title} maxlength={REPORT_LIMITS.title} placeholder={PLACEHOLDER[kind].title} class={field} autocomplete="off" required />
				</label>
				<label class={label}>
					Details
					<textarea bind:value={body} maxlength={REPORT_LIMITS.body} rows="5" placeholder={PLACEHOLDER[kind].body} class="{field} resize-y" required></textarea>
				</label>
				<div class="grid grid-cols-2 gap-3 max-sm:grid-cols-1">
					<label class={label}>
						<span>Character <span class="text-surface-500">(optional)</span></span>
						<input bind:value={character} maxlength={REPORT_LIMITS.character} placeholder="NA / Soulshan" class={field} autocomplete="off" />
					</label>
					<label class={label}>
						<span>Contact <span class="text-surface-500">(optional, shown publicly)</span></span>
						<input bind:value={contact} maxlength={REPORT_LIMITS.contact} placeholder="Discord or Reddit name" class={field} autocomplete="off" />
					</label>
				</div>
				<!-- Spam trap: hidden from people, filled by bots. -->
				<input bind:value={website} name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="absolute -left-[9999px] size-px opacity-0" />
				<p class="text-xs text-surface-500">Your page and browser name are added so the bug can be reproduced. Please don't include personal info.</p>
				{#if error}
					<p class="text-sm text-red-400">
						{error}
						<a class="ml-1 text-accent-300 underline hover:text-accent-200" href={NEW_ISSUE_URL} target="_blank" rel="noopener">Open on GitHub ↗</a>
					</p>
				{/if}
				<div class="flex flex-row items-center justify-end gap-2">
					{#if missing}<span class="mr-auto text-xs text-amber-300">{missing}</span>{/if}
					<button type="button" class={btn} onclick={() => dialog.close()}>Cancel</button>
					<button type="submit" class="{btnAccent} disabled:opacity-50" disabled={!ready || sending}>{sending ? 'Sending…' : 'Send report'}</button>
				</div>
			</form>
		{/if}
	</div>
</dialog>
