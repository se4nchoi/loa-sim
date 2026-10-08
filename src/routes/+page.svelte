<script lang="ts">
	import { goto } from '$app/navigation';
	import { className } from '$lib/upgrade-planner/class-names';
	import { page } from '$app/state';
	import {
		REGIONS,
		bibleCharacterUrl,
		bibleDataUrl,
		parseCharacterInput,
		parsePastedData,
		type Region
	} from '$lib/bible-data';
	import { characterKey, listSavedCharacters, removeSavedCharacter, saveCharacter, type SavedCharacter } from '$lib/saved-character';
	import { onMount } from 'svelte';
	import { preferredRegion, saveRegion } from '$lib/region-preference';

	let region = $state<Region>('NA');
	let input = $state('');
	let pasted = $state('');
	let error = $state<string | null>(null);
	let saved = $state<SavedCharacter[]>([]);

	onMount(() => {
		saved = listSavedCharacters();
		region = preferredRegion(page.url.searchParams.get('region'));
		saveRegion(region);
		input = page.url.searchParams.get('name') ?? '';
	});

	const target = $derived(parseCharacterInput(input, region));

	function tryLoad(text: string) {
		error = null;
		if (!text.trim()) return;
		if (!target) {
			error = 'Enter your character name (or lostark.bible link) in step 1 first.';
			return;
		}
		try {
			const data = parsePastedData(text, target.name, target.region);
			if (!data.loadout) {
				error = `${target.name} has no Ark Passive loadout with Combat Power on lostark.bible yet.`;
				return;
			}
			saveCharacter(data);
			saveRegion(data.region);
			goto(`/sim?c=${encodeURIComponent(characterKey(data))}`);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	function remove(c: SavedCharacter) {
		removeSavedCharacter(characterKey(c));
		saved = listSavedCharacters();
	}

	const ago = (t: number) => {
		const m = Math.round((Date.now() - t) / 60000);
		return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
	};
	const step = 'flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-700 text-xs font-bold';
	const field = 'h-10 rounded-xs border border-surface-600 bg-surface-800 px-3 text-surface-100 focus:border-accent-500 focus:outline-none';
</script>

<svelte:head><title>loa-sim · Combat Power Simulator</title></svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-4 py-6">
	<div class="flex flex-col gap-2">
		<h1 class="text-3xl font-bold">Combat Power Simulator</h1>
		<p class="text-surface-300">
			Change honing, accessories, gems, engravings, ark grid, bracelet and karma and see what each change does to your
			Combat Power.
		</p>
		<ul class="list-disc pl-5 text-sm text-surface-400">
			<li>Uses lostark.bible's current snapshot of your character.</li>
			<li>Nothing is stored anywhere except your own browser.</li>
		</ul>
	</div>

	{#if saved.length}
		<div class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
			<div class="bg-black/10 px-4 py-2 font-bold">Your characters</div>
			{#each saved as c (characterKey(c))}
				<div class="flex flex-row items-center gap-3 px-4 py-2">
					<a href={`/sim?c=${encodeURIComponent(characterKey(c))}`} class="flex min-w-0 flex-1 flex-col hover:text-accent-200">
						<span class="font-semibold">{c.name} <span class="text-xs font-normal text-surface-400">{c.region}</span></span>
						<span class="text-xs text-surface-400">
							{#if c.loadout?.classId}{className(c.loadout.classId)} · {/if}{#if c.header?.ilvl}Item Level {c.header.ilvl.toFixed(2)} · {/if}loaded {ago(c.savedAt)}
						</span>
					</a>
					<a href={`/sim?c=${encodeURIComponent(characterKey(c))}`} class="rounded-xs bg-accent-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-600">Continue</a>
					<a href={`/?region=${c.region}&name=${encodeURIComponent(c.name)}`} class="text-xs text-surface-300 underline hover:text-surface-50">Reload</a>
					<button type="button" class="text-xs text-surface-500 hover:text-red-300" onclick={() => remove(c)} aria-label={`Remove ${c.name}`}>Remove</button>
				</div>
			{/each}
		</div>
	{/if}

	<div class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
		<div class="bg-black/10 px-4 py-2 font-bold">{saved.length ? 'Load another character' : 'Load your character'}</div>

		<section class="flex flex-row gap-3 p-4">
			<span class={step}>1</span>
			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<label for="char" class="font-semibold">Your character</label>
				<div class="flex flex-row gap-2">
					<select bind:value={region} onchange={(e) => saveRegion(e.currentTarget.value)} aria-label="Region" class={field}>
						{#each REGIONS as r (r)}<option>{r}</option>{/each}
					</select>
					<input id="char" bind:value={input} placeholder="Character name or lostark.bible link" class="{field} min-w-0 flex-1" autocomplete="off" />
				</div>
				{#if input && !target}
					<span class="text-sm text-red-400">Enter a character name, or a lostark.bible/character/… link.</span>
				{:else if target && target.name !== input.trim()}
					<span class="text-xs text-surface-400">Looking up <b class="text-surface-200">{target.name}</b> ({target.region})</span>
				{/if}
			</div>
		</section>

		<section class="flex flex-row gap-3 p-4">
			<span class={step}>2</span>
			<div class="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
				<span class="text-base font-semibold">Update your snapshot <span class="text-sm font-normal text-surface-400">(optional)</span></span>
				<ul class="list-disc space-y-0.5 pl-5 text-surface-300">
					<li>Set up the gear you want in game.</li>
					<li>Go to <b>character select</b> (or switch characters); that sends a fresh snapshot.</li>
					<li>Press refresh on your lostark.bible page.</li>
				</ul>
				{#if target}
					<a class="mt-1 w-fit text-accent-300 underline" href={bibleCharacterUrl(target.region, target.name)} target="_blank" rel="noopener">
						Open {target.name} on lostark.bible ↗
					</a>
				{/if}
			</div>
		</section>

		<section class="flex flex-row gap-3 p-4">
			<span class={step}>3</span>
			<div class="flex min-w-0 flex-1 flex-col gap-2 text-sm">
				<span class="text-base font-semibold">Copy your data and paste it here</span>
				{#if target}
					<a
						class="w-fit rounded-xs bg-accent-700 px-3 py-1.5 font-semibold text-white hover:bg-accent-600"
						href={bibleDataUrl(target.region, target.name)}
						target="_blank"
						rel="noopener"
					>
						Open {target.name}'s data ↗
					</a>
					<ul class="list-disc space-y-0.5 pl-5 text-surface-300">
						<li>A page of text opens.</li>
						<li>Select all of it (<kbd>Ctrl</kbd>+<kbd>A</kbd>, or long-press → Select all on mobile) and copy.</li>
						<li>Paste it below.</li>
					</ul>
				{:else}
					<span class="text-surface-400">Fill in step 1 to get your data link.</span>
				{/if}
				<textarea
					bind:value={pasted}
					oninput={() => tryLoad(pasted)}
					rows="4"
					placeholder={'Paste here, starting with {"type":"data"…'}
					aria-label="Pasted lostark.bible data"
					class="rounded-xs border border-surface-600 bg-surface-800 px-3 py-2 font-mono text-xs text-surface-100 focus:border-accent-500 focus:outline-none"
				></textarea>
				{#if error}<span class="text-red-400">{error}</span>{/if}
			</div>
		</section>
	</div>

	<a class="w-fit text-sm text-surface-300 underline hover:text-surface-50" href="/demo">Or try the sample character (Soulshan, NA)</a>
</div>
