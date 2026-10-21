<script lang="ts">
	// Private usage stats (see $lib/server/stats). The key goes in a request header, never the URL; a password
	// manager can fill it. Nothing is kept in this browser.
	import { btn, selectClass } from '$lib/upgrade-planner/sim/ui';
	import type { StatsReport } from '$lib/server/stats';

	const EVENTS: [string, string][] = [
		['lookup', 'Character loads'], ['lookup_fail', 'Failed loads'], ['sim_open', 'Simulator opens'],
		['build_saved', 'Builds saved'], ['share_created', 'Shares created'], ['share_opened', 'Shares opened']
	];

	let key = $state('');
	let days = $state('30');
	let report = $state<StatsReport | null>(null);
	let error = $state('');
	let busy = $state(false);

	async function load(e?: SubmitEvent) {
		e?.preventDefault();
		busy = true;
		error = '';
		try {
			const res = await fetch(`/api/stats?days=${days}`, { headers: { authorization: `Bearer ${key}` }, cache: 'no-store' });
			if (res.status === 404) throw new Error('Wrong key, or STATS_KEY is not set on the server.');
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `Failed (${res.status})`);
			report = await res.json();
		} catch (err) {
			report = null;
			error = err instanceof Error ? err.message : String(err);
		} finally {
			busy = false;
		}
	}

	const breakdown = (prefix: string) =>
		Object.entries(report?.totals ?? {})
			.filter(([k]) => k.startsWith(prefix))
			.map(([k, n]) => [k.slice(prefix.length), n] as const)
			.sort((a, b) => b[1] - a[1]);
	const fmt = (n: number | undefined) => (n ?? 0).toLocaleString();
</script>

<svelte:head>
	<title>Stats · loa-sim</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<div class="mx-auto max-w-5xl space-y-6 text-sm">
	<form class="flex flex-wrap items-center gap-2" onsubmit={load}>
		<input type="text" name="username" value="loa-sim stats" autocomplete="username" hidden />
		<input type="password" bind:value={key} placeholder="Stats key" autocomplete="current-password" required
			class="w-64 rounded border border-surface-700 bg-surface-900 px-2 py-1" />
		<select bind:value={days} class={selectClass(false)} onchange={() => report && load()}>
			<option value="7">Last 7 days</option>
			<option value="30">Last 30 days</option>
			<option value="90">Last 90 days</option>
			<option value="all">All time</option>
		</select>
		<button type="submit" class={btn} disabled={busy}>{busy ? 'Loading…' : 'Show'}</button>
	</form>

	{#if error}<p role="alert" class="text-red-400">{error}</p>{/if}

	{#if report}
		<p class="text-surface-300">{report.from} – {report.to} (UTC days)</p>
		<div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
			<div class="rounded border border-surface-800 p-3">
				<div class="text-surface-300">Distinct characters</div>
				<div class="text-2xl font-semibold">{fmt(report.distinctCharacters)}</div>
			</div>
			{#each EVENTS as [k, label] (k)}
				<div class="rounded border border-surface-800 p-3">
					<div class="text-surface-300">{label}</div>
					<div class="text-2xl font-semibold">{fmt(report.totals[k])}</div>
				</div>
			{/each}
		</div>

		<div class="grid gap-6 sm:grid-cols-2">
			{#each [['Loads by region', 'lookup:'], ['Loads by class', 'class:']] as [title, prefix] (prefix)}
				<div>
					<h2 class="mb-2 font-semibold">{title}</h2>
					<table class="w-full">
						<tbody>
							{#each breakdown(prefix) as [name, n] (name)}
								<tr class="border-b border-surface-800"><td class="py-1">{name}</td><td class="text-right tabular-nums">{fmt(n)}</td></tr>
							{:else}
								<tr><td class="py-1 text-surface-400">None yet</td></tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/each}
		</div>

		<div class="overflow-x-auto">
			<h2 class="mb-2 font-semibold">By day</h2>
			<table class="w-full whitespace-nowrap">
				<thead class="text-surface-300">
					<tr>
						<th class="py-1 pr-4 text-left font-normal">Day</th>
						<th class="px-2 text-right font-normal">Characters</th>
						{#each EVENTS as [k, label] (k)}<th class="px-2 text-right font-normal">{label}</th>{/each}
					</tr>
				</thead>
				<tbody>
					{#each report.days as d (d.date)}
						<tr class="border-b border-surface-800 tabular-nums">
							<td class="py-1 pr-4">{d.date}</td>
							<td class="px-2 text-right">{fmt(d.distinctCharacters)}</td>
							{#each EVENTS as [k] (k)}<td class="px-2 text-right">{fmt(d.counts[k])}</td>{/each}
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	{/if}
</div>
