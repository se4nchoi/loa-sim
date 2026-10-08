<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { bibleToken, completeSignIn, fetchRoster, signOut, startSignIn, type RosterCharacter } from '$lib/bible-oauth';
	import { REGIONS, bibleDataUrl, parseCharacterInput, parsePastedData, type Region } from '$lib/bible-data';
	import { preferredRegion, saveRegion } from '$lib/region-preference';
	import { characterKey, listSavedCharacters, removeSavedCharacter, saveCharacter, type SavedCharacter } from '$lib/saved-character';
	import { classIconUrl } from '$lib/upgrade-planner/class-icons';
	import { className } from '$lib/upgrade-planner/class-names';
	import { onMount } from 'svelte';

	let region = $state<Region>('NA');
	let input = $state('');
	let pasted = $state('');
	let error = $state<string | null>(null);
	let showPaste = $state(false);
	let saved = $state<SavedCharacter[]>([]);

	// lostark.bible sign-in: the roster to pick from. Loading goes through our server (bible's data has no CORS).
	let signedIn = $state(false);
	let roster = $state<RosterCharacter[] | null>(null);
	let rosterError = $state<string | null>(null);
	// Roster characters the player hid (keys), so long rosters stay short. Per browser.
	const HIDDEN_KEY = 'loa-sim:roster-hidden';
	let hidden = $state<string[]>([]);
	let showHidden = $state(false);
	function setHidden(key: string, hide: boolean) {
		hidden = hide ? [...hidden, key] : hidden.filter((k) => k !== key);
		try {
			localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
		} catch {
			/* storage blocked: hiding lasts until reload */
		}
	}
	/** Character being loaded ("na/name"), for the button's busy state. */
	let loading = $state<string | null>(null);

	async function refreshRoster() {
		rosterError = null;
		try {
			roster = await fetchRoster();
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			if (message === 'signed-out') signedIn = false;
			else rosterError = `Couldn't load your roster: ${message}`;
		}
	}

	onMount(async () => {
		saved = listSavedCharacters();
		try {
			hidden = JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
		} catch {
			hidden = [];
		}
		region = preferredRegion(page.url.searchParams.get('region'));
		saveRegion(region);
		input = page.url.searchParams.get('name') ?? '';
		try {
			await completeSignIn(new URL(location.href)); // the production callback lands here
		} catch (e) {
			rosterError = e instanceof Error ? e.message : String(e);
		}
		signedIn = !!bibleToken();
		if (signedIn) await refreshRoster();
	});

	const target = $derived(parseCharacterInput(input, region));
	const savedByKey = $derived(new Map(saved.map((c) => [characterKey(c), c])));
	const rosterKeys = $derived(new Set((roster ?? []).map((c) => characterKey(c))));
	/** Characters loaded by name (or pasted) that aren't on the synced roster. */
	const typed = $derived(saved.filter((c) => !rosterKeys.has(characterKey(c))));
	const hiddenSet = $derived(new Set(hidden));
	const shownRoster = $derived((roster ?? []).filter((c) => showHidden || !hiddenSet.has(characterKey(c))));
	const hiddenCount = $derived((roster ?? []).filter((c) => hiddenSet.has(characterKey(c))).length);
	const openUrl = (c: { region: string; name: string }) => `/sim?c=${encodeURIComponent(characterKey(c))}`;

	/** Loads a character's current bible snapshot via our server, saves it here and opens the simulator. */
	async function load(r: string, name: string) {
		loading = characterKey({ region: r, name });
		error = null;
		try {
			const res = await fetch(`/api/character/${encodeURIComponent(r)}/${encodeURIComponent(name)}`);
			const body = await res.json().catch(() => null);
			if (!res.ok) throw new Error(body?.message ?? `Loading failed (${res.status})`);
			if (!body?.loadout) throw new Error(`${name} (${r}) wasn't found on lostark.bible, or has no Ark Passive loadout with Combat Power yet.`);
			saveCharacter(body);
			saveRegion(r);
			goto(openUrl(body));
		} catch (e) {
			// Fall back to pasting the data for this character.
			region = r as Region;
			input = name;
			error = e instanceof Error ? e.message : String(e);
			showPaste = true;
			loading = null;
		}
	}

	function tryPaste(text: string) {
		error = null;
		if (!text.trim()) return;
		if (!target) {
			error = 'Enter the character name above first.';
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
			goto(openUrl(data));
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
		return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
	};
	const field = 'h-10 rounded-xs border border-surface-600 bg-surface-800 px-3 text-surface-100 focus:border-accent-500 focus:outline-none';
	const primary = 'rounded-xs bg-accent-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50';
	const secondary = 'rounded-xs border border-surface-600 px-2.5 py-1.5 text-sm text-surface-200 hover:bg-surface-800 disabled:opacity-50';
</script>

<svelte:head><title>loa-sim · Combat Power Simulator</title></svelte:head>

<!-- One compact character row: class emblem, name, item level · CP, then its actions. -->
{#snippet row(c: { region: string; name: string }, classId: string | undefined, ilvl: number | undefined, cp: { score: number; support: boolean } | undefined, note: string | undefined, dismiss: { label: string; icon: string; run: () => void } | null)}
	{@const key = characterKey(c)}
	{@const have = savedByKey.get(key)}
	<div class="flex flex-row items-center gap-3 px-3 py-2">
		{#if classIconUrl(classId)}
			<img src={classIconUrl(classId)} alt={className(classId!)} title={className(classId!)} class="size-9 shrink-0" />
		{:else}
			<span class="size-9 shrink-0 rounded-full bg-surface-800"></span>
		{/if}
		<a href={have ? openUrl(c) : undefined} class="flex min-w-0 flex-1 flex-col {have ? 'hover:text-accent-200' : ''}">
			<span class="truncate font-semibold">{c.name} {#if c.region !== 'NA'}<span class="text-xs font-normal text-surface-400">{c.region}</span>{/if}</span>
			<span class="truncate text-xs text-surface-400 tabular-nums">
				{#if ilvl}{ilvl.toFixed(2).replace(/\.00$/, '')}{/if}{#if cp}{ilvl ? ' · ' : ''}<span class={cp.support ? 'text-green-400' : 'text-red-400'}>{cp.score.toFixed(2)}</span>{/if}{#if note}<span class="text-surface-500"> · {note}</span>{/if}
			</span>
		</a>
		{#if have}
			<a href={openUrl(c)} class={primary}>Open</a>
			<button type="button" class={secondary} disabled={loading !== null} onclick={() => load(c.region, c.name)} title="Load the latest lostark.bible snapshot">
				{loading === key ? '…' : '↻'}
			</button>
		{:else}
			<button type="button" class={primary} disabled={loading !== null} onclick={() => load(c.region, c.name)}>{loading === key ? 'Loading…' : 'Load'}</button>
		{/if}
		{#if dismiss}
			<button type="button" class="w-5 text-surface-500 hover:text-surface-100" onclick={dismiss.run} aria-label={`${dismiss.label} ${c.name}`} title={dismiss.label}>{dismiss.icon}</button>
		{/if}
	</div>
{/snippet}

<div class="mx-auto flex max-w-2xl flex-col gap-4 py-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl font-bold">Combat Power Simulator</h1>
		<p class="text-sm text-surface-300">Load a character, change its gear, and see what each change does to Combat Power.</p>
	</div>

	<!-- Search: load any character straight into the simulator. -->
	<form
		class="flex flex-row gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			if (target) load(target.region, target.name);
		}}
	>
		<select bind:value={region} onchange={(e) => saveRegion(e.currentTarget.value)} aria-label="Region" class={field}>
			{#each REGIONS as r (r)}<option>{r}</option>{/each}
		</select>
		<input bind:value={input} placeholder="Character name or bible link" aria-label="Character name or lostark.bible link" class="{field} min-w-0 flex-1" autocomplete="off" />
		<button type="submit" class="{primary} px-4" disabled={!target || loading !== null}>
			{loading && target && loading === characterKey(target) ? 'Loading…' : 'Load'}
		</button>
	</form>
	{#if input && !target}<span class="-mt-2 text-sm text-red-400">Enter a character name, or a lostark.bible/character/… link.</span>{/if}
	{#if error}
		<p class="-mt-2 text-sm text-red-400">{error}</p>
	{/if}

	<!-- Roster: synced from lostark.bible. -->
	<section class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
		<div class="flex flex-row items-center gap-2 bg-black/10 px-3 py-2">
			<img src="/bible/artist_cry.png" alt="" class="size-6" />
			<span class="font-bold">Roster</span>
			<span class="text-xs text-surface-500">from lostark.bible</span>
			{#if signedIn}
				<button type="button" class="ml-auto text-xs text-surface-400 underline hover:text-surface-100" onclick={() => ((signedIn = false), (roster = null), signOut())}>Sign out</button>
			{/if}
		</div>
		{#if !signedIn}
			<div class="flex flex-row flex-wrap items-center gap-3 px-3 py-3">
				<button type="button" class={primary} onclick={startSignIn}>Sign in with lostark.bible</button>
				<span class="text-xs text-surface-400">Lists your characters to load in one click.</span>
			</div>
		{:else if roster === null && !rosterError}
			<p class="px-3 py-3 text-sm text-surface-400">Loading your roster…</p>
		{:else if roster?.length === 0}
			<p class="px-3 py-3 text-sm text-surface-400">No characters on your linked rosters yet.</p>
		{:else if roster}
			{#each shownRoster as c (characterKey(c))}
				{@const have = savedByKey.get(characterKey(c))}
				{@const isHidden = hiddenSet.has(characterKey(c))}
				{@render row(
					c,
					c.classId ?? have?.loadout?.classId,
					c.ilvl ?? have?.header?.ilvl,
					c.cp ?? (have?.loadout?.combatPower ? { score: have.loadout.combatPower.score, support: have.loadout.combatPower.id === 2 } : undefined),
					isHidden ? 'hidden' : have ? `loaded ${ago(have.savedAt)}` : undefined,
					isHidden
						? { label: 'Show', icon: '↺', run: () => setHidden(characterKey(c), false) }
						: { label: 'Hide', icon: '✕', run: () => setHidden(characterKey(c), true) }
				)}
			{/each}
			{#if hiddenCount}
				<button type="button" class="px-3 py-2 text-left text-xs text-surface-400 hover:text-surface-100" onclick={() => (showHidden = !showHidden)}>
					{showHidden ? 'Done' : `${hiddenCount} hidden · show`}
				</button>
			{/if}
		{/if}
		{#if rosterError}<p class="px-3 py-3 text-sm text-red-400">{rosterError}</p>{/if}
	</section>

	<!-- Characters loaded by name (or pasted), not on the roster. -->
	{#if typed.length}
		<section class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
			<div class="bg-black/10 px-3 py-2 font-bold">Characters</div>
			{#each typed as c (characterKey(c))}
				{@render row(
					c,
					c.loadout?.classId,
					c.header?.ilvl,
					c.loadout?.combatPower ? { score: c.loadout.combatPower.score, support: c.loadout.combatPower.id === 2 } : undefined,
					`loaded ${ago(c.savedAt)}`,
					{ label: 'Remove', icon: '✕', run: () => remove(c) }
				)}
			{/each}
		</section>
	{/if}

	<details class="rounded-xs bg-surface-900 px-3 py-2 text-sm text-surface-300 shadow-sm shadow-neutral-800">
		<summary class="cursor-pointer font-semibold text-surface-100">How to use</summary>
		<ul class="mt-2 list-disc space-y-1 pl-5">
			<li>Load a character by name, or sign in and pick one from your roster.</li>
			<li>Change honing, accessories, gems, engravings, ark grid, bracelet and karma; Combat Power updates as you go.</li>
			<li>Data comes from lostark.bible. For current gear: set it up in game, go to character select, then press ↻.</li>
			<li>Characters with an estimated raid loadout on lostark.bible open with it (best raid gear seen); switch to the latest snapshot on the simulator page.</li>
			<li>Everything you load stays in this browser only.</li>
		</ul>
	</details>

	<details bind:open={showPaste} class="rounded-xs bg-surface-900 px-3 py-2 text-sm text-surface-300 shadow-sm shadow-neutral-800">
		<summary class="cursor-pointer font-semibold text-surface-100">Paste data instead</summary>
		<div class="mt-2 flex flex-col gap-2">
			{#if target}
				<span>
					Open <a class="text-accent-300 underline" href={bibleDataUrl(target.region, target.name)} target="_blank" rel="noopener">{target.name}'s data ↗</a>,
					select all (<kbd>Ctrl</kbd>+<kbd>A</kbd>), copy, and paste it here.
				</span>
			{:else}
				<span class="text-surface-400">Type the character name above to get its data link.</span>
			{/if}
			<textarea
				bind:value={pasted}
				oninput={() => tryPaste(pasted)}
				rows="3"
				placeholder={'Paste here, starting with {"type":"data"…'}
				aria-label="Pasted lostark.bible data"
				class="rounded-xs border border-surface-600 bg-surface-800 px-3 py-2 font-mono text-xs text-surface-100 focus:border-accent-500 focus:outline-none"
			></textarea>
		</div>
	</details>

	<a class="w-fit text-xs text-surface-400 underline hover:text-surface-100" href="/demo">Or try the sample character (Soulshan, NA)</a>
</div>
