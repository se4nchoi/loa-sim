<script lang="ts">
	import type {Loadout} from './types';
	import type {SimState} from './simulate';
	import {btn} from './sim/ui';
	let {characterKey,loadout,state:simState}: {characterKey:string;loadout:Loadout;state:SimState} = $props();
	let busy = $state(false);
	let link = $state('');
	let sharedInput = $state('');
	let note = $state('');
	let failure = $state('');
	const input = $derived(JSON.stringify({version:1,id:'share',name:'Proposed upgrades',characterKey,savedAt:0,loadout,state:simState}));
	const currentLink = $derived(input === sharedInput ? link : '');
	async function copy(url: string) {
		try { await navigator.clipboard.writeText(url); note = 'Link copied · expires in 30 days'; }
		catch { note = 'Copy the link below · expires in 30 days'; }
	}
	async function share() {
		if (currentLink) { await copy(currentLink); return; }
		busy = true; failure = ''; note = '';
		const snapshot = input;
		try {
			const response = await fetch('/api/share', {method:'POST',headers:{'content-type':'application/json'},body:snapshot});
			const body = await response.json();
			if (!response.ok) throw new Error(body.message ?? 'Could not share this simulation.');
			if (typeof body.path !== 'string' || !body.path.startsWith('/s/')) throw new Error('Invalid share link.');
			link = new URL(body.path, location.origin).href;
			sharedInput = snapshot;
			await copy(link);
		} catch (e) { failure = e instanceof Error ? e.message : 'Could not share this simulation.'; }
		finally { busy = false; }
	}
</script>

<div class="mt-2 space-y-1">
	<button type="button" class="{btn} w-full gap-1.5" disabled={busy || !characterKey} onclick={share} title="Share this build with your changes. Link expires in 30 days.">
		<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10.5 6-4m-6 7 6 4"/></svg>
		{busy ? 'Creating link…' : currentLink ? 'Copy share link' : 'Share simulation'}
	</button>
	<p class="text-xs text-surface-400">Link expires in 30 days</p>
	{#if currentLink}
		<input class="w-full min-w-0 rounded-xs border border-surface-600 bg-surface-950 px-2 py-1 text-xs text-surface-200" aria-label="Simulation share link" value={currentLink} readonly onclick={(event) => event.currentTarget.select()} />
		<p role="status" class="text-xs text-surface-300">{note}</p>
	{/if}
	{#if failure}<p role="alert" class="text-xs text-red-300">{failure}</p>{/if}
</div>
