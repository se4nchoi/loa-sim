<script lang="ts">
	import { goto } from '$app/navigation';

	let region = $state('NA');
	let name = $state('');
</script>

<svelte:head><title>Upgrade Planner demo</title></svelte:head>

<div class="mx-auto flex max-w-xl flex-col gap-4 py-10">
	<h1 class="text-3xl font-bold">Upgrade Planner</h1>
	<p class="text-surface-300">
		A "Next Upgrades" panel for lostark.bible character pages: what to improve next (gems, astrogems, cores,
		ability stones, accessories, karma) and how much Combat Power each step adds.
	</p>
	<form
		class="flex flex-row gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			if (name.trim()) goto(`/character/${region}/${encodeURIComponent(name.trim())}`);
		}}
	>
		<select bind:value={region} aria-label="Region" class="rounded-xs border border-surface-700 bg-surface-900 px-2 py-1">
			<option>NA</option>
			<option>CE</option>
		</select>
		<input
			bind:value={name}
			placeholder="Character name"
			aria-label="Character name"
			class="flex-1 rounded-xs border border-surface-700 bg-surface-900 px-3 py-1 focus:border-accent-500 focus:outline-none"
		/>
		<button class="rounded-xs bg-accent-700 px-4 py-1 font-semibold hover:bg-accent-600" type="submit">Open</button>
	</form>
	<a class="text-sm text-surface-300 underline" href="/demo">Or open the offline sample (no network)</a>
</div>
