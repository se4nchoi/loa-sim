<script lang="ts">
	import type {Loadout} from './types';
	import type {SimState} from './simulate';
	import {btnAccent} from './sim/ui';
	import type {SharedDps} from './shared-dps';
	import {raidGateOf} from '$lib/logs/raids';
	/** dps: in DPS mode, the picked run goes along, so the link opens on the same meter. */
	let {characterKey,loadout,state:simState,dps}: {characterKey:string;loadout:Loadout;state:SimState;dps?:SharedDps} = $props();
	const runName = $derived(dps ? raidGateOf(dps.run.boss)?.label ?? dps.run.boss : '');
	let busy = $state(false);
	let link = $state('');
	let sharedInput = $state('');
	let note = $state('');
	let copied = $state(false);
	let failure = $state('');
	const input = $derived(JSON.stringify({version:1,id:'share',name:'Proposed upgrades',characterKey,savedAt:0,loadout,state:simState,...(dps ? {dps} : {})}));
	const currentLink = $derived(input === sharedInput ? link : '');
	async function copy(url: string) {
		copied = false;
		try { await navigator.clipboard.writeText(url); copied = true; note = 'Link copied'; }
		catch { note = 'Copy the link below'; }
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
	<!-- A DPS link carries log data: said plainly before it's made, not in the fine print. -->
	{#if dps}
		<div class="rounded-xs border border-amber-400/50 bg-amber-500/10 px-2 py-1.5 text-xs text-amber-100">
			<p class="font-semibold">Includes your log data: {runName} run</p>
			<p class="mt-0.5 text-amber-100/80">Your skill damage, gear and the fight's outcome. No other players.</p>
		</div>
	{/if}
	<button type="button" class="{btnAccent} w-full gap-1.5 disabled:opacity-40" disabled={busy || !characterKey} onclick={share} title="Share this build with your changes. Link expires in 30 days.">
		<svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m9 10.5 6-4m-6 7 6 4"/></svg>
		{busy ? 'Creating link…' : currentLink ? 'Copy share link' : dps ? 'Share DPS simulation' : 'Share simulation'}
	</button>
	<p class="text-xs text-surface-400">Link expires in 30 days</p>
	{#if currentLink}
		<input class="w-full min-w-0 rounded-xs border border-surface-600 bg-surface-950 px-2 py-1 text-xs text-surface-200" aria-label="Simulation share link" value={currentLink} readonly onclick={(event) => event.currentTarget.select()} />
		<p role="status" class="flex items-center gap-1 text-xs {copied ? 'text-green-400' : 'text-surface-300'}">
			{#if copied}<svg class="size-3.5 shrink-0" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m3 8 3 3 7-7" /></svg>{/if}
			{note}
		</p>
	{/if}
	{#if failure}<p role="alert" class="text-xs text-red-300">{failure}</p>{/if}
</div>
