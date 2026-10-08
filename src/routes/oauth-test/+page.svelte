<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { completeSignIn } from '$lib/bible-oauth';
	import { authorizationUrl, exchangeCallback, inspectEndpoint } from '$lib/oauth-test';
	import { btn, selectClass } from '$lib/upgrade-planner/sim/ui';

	let token = $state<string | null>(null);
	let redirectUri = $state('');
	let error = $state('');
	let busy = $state(false);
	let results = $state<{ endpoint: string; status: number; json: string }[]>([]);
	let character = $state('');
	let region = $state('NA');
	let page = $state(1);
	let bosses = $state('');

	async function request(endpoint: string) {
		if (!token) return;
		const response = await inspectEndpoint(token, endpoint);
		results = [{ endpoint, status: response.status, json: JSON.stringify(response.body, null, 2) }, ...results];
		if (response.status === 401) token = null;
	}
	async function run(action: () => Promise<void>) {
		busy = true;
		error = '';
		try { await action(); } catch (e) { error = e instanceof Error ? e.message : String(e); }
		finally { busy = false; }
	}
	onMount(() => {
		redirectUri = `${location.origin}${location.pathname}`;
		void run(async () => {
			// In development this is also the app's sign-in callback (the registered dev redirect URI).
			if (await completeSignIn(new URL(location.href))) return void goto('/');
			token = await exchangeCallback(new URL(location.href));
			if (token) {
				await request('/api/oauth/user');
				if (token) await request('/api/oauth/rosters');
			}
		});
	});
	function logs() {
		const query = new URLSearchParams({ region, page: String(Math.max(1, Math.floor(page) || 1)) });
		for (const boss of bosses.split(',').map((s) => s.trim()).filter(Boolean)) query.append('bosses', boss);
		return request(`/api/oauth/logs/${encodeURIComponent(character.trim())}?${query}`);
	}
</script>

<div class="mx-auto flex max-w-4xl flex-col gap-5">
	<h1 class="text-xl font-semibold">lostark.bible API test</h1>
	<p class="text-sm text-surface-400">Development client · Redirect URI: <code>{redirectUri}</code></p>
	<div class="flex flex-wrap gap-2">
		{#if !token}
			<button class={btn} disabled={busy} onclick={() => run(async () => { location.assign(await authorizationUrl(redirectUri)); })}>Connect lostark.bible</button>
		{:else}
			<button class={btn} disabled={busy} onclick={() => run(() => request('/api/oauth/user'))}>Fetch user</button>
			<button class={btn} disabled={busy} onclick={() => run(() => request('/api/oauth/rosters'))}>Fetch rosters</button>
			<button class={btn} disabled={busy} onclick={() => { token = null; results = []; }}>Clear session</button>
		{/if}
	</div>
	{#if token}
		<form class="flex flex-wrap items-end gap-3" onsubmit={(e) => { e.preventDefault(); void run(logs); }}>
			<label class="flex flex-col gap-1 text-sm">Character<input class={selectClass(false)} bind:value={character} required /></label>
			<label class="flex flex-col gap-1 text-sm">Region<select class={selectClass(false)} bind:value={region}><option>NA</option><option>CE</option></select></label>
			<label class="flex flex-col gap-1 text-sm">Page<input class={`${selectClass(false)} w-20`} type="number" min="1" step="1" bind:value={page} required /></label>
			<label class="flex flex-col gap-1 text-sm">Bosses (comma separated)<input class={selectClass(false)} bind:value={bosses} /></label>
			<button class={btn} disabled={busy}>Fetch logs</button>
		</form>
	{/if}
	{#if busy}<p class="text-sm text-surface-400">Loading…</p>{/if}
	{#if error}<p role="alert" class="text-sm text-red-400">{error}</p>{/if}
	{#each results as result}
		<section class="overflow-hidden rounded border border-surface-700">
			<h2 class="bg-surface-900 p-3 text-sm font-semibold">{result.status} · {result.endpoint}</h2>
			<pre class="max-h-[36rem] overflow-auto p-3 text-xs">{result.json}</pre>
		</section>
	{/each}
</div>
