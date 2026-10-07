<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		REGIONS,
		bibleCharacterUrl,
		bibleDataUrl,
		parseCharacterInput,
		parsePastedData,
		type Region
	} from '$lib/bible-data';
	import { loadSavedCharacter, saveCharacter, type SavedCharacter } from '$lib/saved-character';
	import { onMount } from 'svelte';

	let region = $state<Region>('NA');
	let input = $state('');
	let pasted = $state('');
	let error = $state<string | null>(null);
	let saved = $state<SavedCharacter | null>(null);

	onMount(() => {
		saved = loadSavedCharacter();
		const r = page.url.searchParams.get('region')?.toUpperCase();
		if (r && (REGIONS as readonly string[]).includes(r)) region = r as Region;
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
			goto('/sim');
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	const ago = (t: number) => {
		const m = Math.round((Date.now() - t) / 60000);
		return m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
	};
	const step = 'flex size-6 shrink-0 items-center justify-center rounded-full bg-accent-700 text-xs font-bold';
	const field = 'rounded-xs border border-surface-700 bg-surface-950 px-2 py-1 text-surface-100 focus:border-accent-500 focus:outline-none';
</script>

<svelte:head><title>Combat Power Simulator</title></svelte:head>

<div class="mx-auto flex max-w-2xl flex-col gap-4 py-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-3xl font-bold">Combat Power Simulator</h1>
		<p class="text-surface-300">
			Load your NA or CE character, then change honing, accessory lines, gems, engravings, ark grid and karma to see
			what each change does to your Combat Power.
		</p>
	</div>

	{#if saved}
		<a
			href="/sim"
			class="flex flex-row items-center justify-between rounded-xs bg-surface-900 px-3 py-2 shadow-sm shadow-neutral-800 hover:bg-surface-800"
		>
			<span>Continue with <b>{saved.name}</b> <span class="text-sm text-surface-400">({saved.region}, loaded {ago(saved.savedAt)})</span></span>
			<span class="text-accent-300">Open →</span>
		</a>
	{/if}

	<div class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
		<div class="bg-black/10 px-3 py-2 font-bold">Load your character</div>

		<section class="flex flex-row gap-3 p-3">
			<span class={step}>1</span>
			<div class="flex min-w-0 flex-1 flex-col gap-2">
				<label for="char" class="font-semibold">Your character</label>
				<div class="flex flex-row gap-2">
					<select bind:value={region} aria-label="Region" class={field}>
						{#each REGIONS as r (r)}<option>{r}</option>{/each}
					</select>
					<input id="char" bind:value={input} placeholder="Character name or lostark.bible link" class="{field} min-w-0 flex-1" autocomplete="off" />
				</div>
				{#if input && !target}<span class="text-sm text-red-400">Enter a character name, or a lostark.bible/character/… link.</span>{/if}
			</div>
		</section>

		<section class="flex flex-row gap-3 p-3">
			<span class={step}>2</span>
			<div class="flex min-w-0 flex-1 flex-col gap-1 text-sm">
				<span class="text-base font-semibold">Update your snapshot (optional)</span>
				<span class="text-surface-300">
					lostark.bible shows your gear as of the last snapshot the game sent. To capture your current gear: set it up in
					game, go to <b>character select</b> (or switch characters), then press refresh on your lostark.bible page.
				</span>
				{#if target}
					<a class="w-fit text-accent-300 underline" href={bibleCharacterUrl(target.region, target.name)} target="_blank" rel="noopener">
						Open {target.name} on lostark.bible ↗
					</a>
				{/if}
			</div>
		</section>

		<section class="flex flex-row gap-3 p-3">
			<span class={step}>3</span>
			<div class="flex min-w-0 flex-1 flex-col gap-2 text-sm">
				<span class="text-base font-semibold">Copy your data and paste it here</span>
				{#if target}
					<a
						class="w-fit rounded-xs bg-accent-700 px-3 py-1 font-semibold text-white hover:bg-accent-600"
						href={bibleDataUrl(target.region, target.name)}
						target="_blank"
						rel="noopener"
					>
						Open {target.name}'s data ↗
					</a>
					<span class="text-surface-300">
						A page of text opens. Select all of it (<kbd>Ctrl</kbd>+<kbd>A</kbd>, or long-press → Select all on mobile),
						copy, and paste it below.
					</span>
				{:else}
					<span class="text-surface-400">Fill in step 1 to get your data link.</span>
				{/if}
				<textarea
					bind:value={pasted}
					oninput={() => tryLoad(pasted)}
					rows="4"
					placeholder={'Paste here, starting with {"type":"data"…'}
					aria-label="Pasted lostark.bible data"
					class="{field} font-mono text-xs"
				></textarea>
				{#if error}<span class="text-red-400">{error}</span>{/if}
				<span class="text-xs text-surface-400">
					Your data stays in your browser; nothing is uploaded. It's the same data lostark.bible shows on your page.
				</span>
			</div>
		</section>
	</div>

	<a class="w-fit text-sm text-surface-300 underline" href="/demo">Just looking? Try a sample character</a>
</div>
