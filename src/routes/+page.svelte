<script lang="ts">
	import SortableCharacters from '$lib/SortableCharacters.svelte';
	import ReorderRow from '$lib/ReorderRow.svelte';
 import { ordered, readOrder, writeOrder, mergeVisibleOrder, type CharacterSection } from '$lib/character-order';
 import { savedSimulations, pinSimulation, simulationCP, type SavedSimulation } from '$lib/upgrade-planner/saved-simulations';
 import { page } from '$app/state';
	import { ROSTER_TTL_MS, bibleToken, cachedRoster, completeSignIn, fetchRoster, hiddenRosterKeys, saveHiddenRosterKeys, signOut, startSignIn, type RosterCharacter } from '$lib/bible-oauth';
	import { REGIONS, bibleDataUrl, parseCharacterInput, parsePastedData, type Region } from '$lib/bible-data';
	import { preferredRegion, saveRegion } from '$lib/region-preference';
	import { characterKey, listSavedCharacters, removeSavedCharacter, saveCharacter, type SavedCharacter } from '$lib/saved-character';
	import { classIconUrl } from '$lib/upgrade-planner/class-icons';
	import { className } from '$lib/upgrade-planner/class-names';
	import { loadCharacter } from '$lib/load-character';
	import { onMount } from 'svelte';
	import SiteNews from '$lib/SiteNews.svelte';
	import SiteNewsStrip from '$lib/SiteNewsStrip.svelte';

	let orders = $state<Record<CharacterSection, string[]>>({roster: [], characters: []});
 let builds = $state<SavedSimulation[]>([]);
 function changeOrder(section: CharacterSection, ids: string[]) {
  try { writeOrder(section, ids); orders[section] = ids; } catch (e) { error = (e as Error).message; }
 }
 function reorder(section: CharacterSection, ids: string[]) {
  const all = section === 'roster' ? ordered(roster ?? [], orders.roster) : ordered(saved.filter(c => !rosterKeys.has(characterKey(c))), orders.characters);
  changeOrder(section, mergeVisibleOrder(all.map(characterKey), ids));
 }
 function unpin(id: string) {
  try { pinSimulation(id, false); builds = savedSimulations().filter(s => s.pinned); }
  catch (e) { error = (e as Error).message; }
 }
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
	// Roster characters the player hid, so long rosters stay short.
	let hidden = $state<string[]>([]);
	let showHidden = $state(false);
	function setHidden(key: string, hide: boolean) {
		hidden = hide ? [...hidden, key] : hidden.filter((k) => k !== key);
		saveHiddenRosterKeys(hidden);
	}
	/** Character being loaded ("na/name"), for the button's busy state. */
	let loading = $state<string | null>(null);

	let rosterAt = $state<number | null>(null);
	/** Until sign-in is checked (and, when signed in, the roster is in), rows are reserved with skeletons instead of
	 *  showing saved characters that may belong to the roster: they'd jump from Characters up into Roster. */
	let booting = $state(true);
	const ROWS_KEY = 'loa-sim:roster-rows';
	/** How many roster rows showed last time, so the skeleton reserves about the same height. */
	let skeletonRows = $state(3);
	let refreshing = $state(false);
	async function refreshRoster() {
		rosterError = null;
		refreshing = true;
		try {
			roster = await fetchRoster();
			rosterAt = Date.now();
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e);
			if (message === 'signed-out') signedIn = false;
			else rosterError = `Couldn't load your roster: ${message}`;
		} finally {
			refreshing = false;
		}
	}

	onMount(async () => {
		saved = listSavedCharacters();
		orders = {roster: readOrder('roster'), characters: readOrder('characters')};
		builds = savedSimulations().filter(s => s.pinned);
		hidden = hiddenRosterKeys();
		region = preferredRegion(page.url.searchParams.get('region'));
		saveRegion(region);
		input = page.url.searchParams.get('name') ?? '';
		try {
			const rows = localStorage.getItem(ROWS_KEY);
			if (rows !== null) skeletonRows = Math.min(12, Math.max(1, Number(rows) || 1));
		} catch {
			/* default */
		}
		try {
			await completeSignIn(new URL(location.href)); // the production callback lands here
		} catch (e) {
			rosterError = e instanceof Error ? e.message : String(e);
		}
		signedIn = !!bibleToken();
		booting = false;
		if (!signedIn) {
			// Signed out: next time the skeleton is one row, about the sign-in button's height.
			try {
				localStorage.setItem(ROWS_KEY, '1');
			} catch {
				/* not remembered */
			}
			return;
		}
		// Show the roster saved last time right away; fetch it again only when it's old (or on ↻).
		const cached = cachedRoster();
		if (cached) ((roster = cached.roster), (rosterAt = cached.at));
		if (!cached || Date.now() - cached.at > ROSTER_TTL_MS) await refreshRoster();
	});

	const target = $derived(parseCharacterInput(input, region));
	const savedByKey = $derived(new Map(saved.map((c) => [characterKey(c), c])));
	const rosterKeys = $derived(new Set((roster ?? []).map((c) => characterKey(c))));
	/** Characters loaded by name (or pasted) that aren't on the synced roster. */
	const typed = $derived(ordered(saved.filter((c) => !rosterKeys.has(characterKey(c))), orders.characters));
	const hiddenSet = $derived(new Set(hidden));
	const shownRoster = $derived(ordered(roster ?? [], orders.roster).filter((c) => showHidden || !hiddenSet.has(characterKey(c))));
	const hiddenCount = $derived((roster ?? []).filter((c) => hiddenSet.has(characterKey(c))).length);
	const rosterPending = $derived(booting || (signedIn && roster === null && !rosterError));
	// Remember the roster's height (rows plus the "hidden · show" line) for next time's skeleton.
	$effect(() => {
		if (!roster) return;
		const rows = shownRoster.length + (hiddenCount ? 1 : 0);
		try {
			localStorage.setItem(ROWS_KEY, String(rows));
		} catch {
			/* not remembered */
		}
	});
	/** A character being loaded by name that has no row yet: it gets a skeleton row where it will appear. */
	const loadingNew = $derived(!!loading && !savedByKey.has(loading) && !rosterKeys.has(loading));
	const openUrl = (c: { region: string; name: string }) => `/sim?c=${encodeURIComponent(characterKey(c))}`;

	/** Character just loaded or reloaded, for a brief ✓ on its button. */
	let refreshed = $state<string | null>(null);
	let refreshedTimer: ReturnType<typeof setTimeout>;
	/** Last character loaded from the search box, for the "Loaded … · Open" line under it. */
	let searched = $state<{ region: string; name: string } | null>(null);

	function loaded(key: string) {
		saved = listSavedCharacters();
		refreshed = key;
		clearTimeout(refreshedTimer);
		refreshedTimer = setTimeout(() => (refreshed = null), 1500);
	}

	/** Loads a character's current bible snapshot via our server and saves it here; the page stays on Characters. */
	async function load(r: string, name: string, fromSearch = false) {
		const key = characterKey({ region: r, name });
		loading = key;
		error = null;
		searched = null;
		try {
			const body = await loadCharacter(r, name);
			loading = null;
			loaded(key);
			if (fromSearch) ((searched = { region: body.region, name: body.name }), (input = ''));
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
			loaded(characterKey(data));
			searched = { region: data.region, name: data.name };
			((pasted = ''), (input = ''), (showPaste = false));
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
		return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
	};
	const field = 'h-10 rounded-xs border border-surface-600 bg-surface-800 px-3 text-surface-100 hover:border-surface-400 focus:border-accent-500 focus:outline-none';
	const primary = 'rounded-xs bg-accent-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent-600 disabled:opacity-50';
	const secondary = 'rounded-xs border border-surface-600 px-2.5 py-1.5 text-sm text-surface-200 hover:bg-surface-800 disabled:opacity-50';
</script>

<svelte:head>
	<title>loa-sim · Lost Ark Combat Power Simulator</title>
	<meta name="description" content="Lost Ark Combat Power simulator for NA and EUC. Load your character from lostark.bible, change honing, gems, accessories, engravings, ark grid and more, and see the CP change. Next Upgrades ranks your best upgrades by CP or by gold." />
	<link rel="canonical" href="https://loa-sim.vercel.app/" />
	<meta name="google-site-verification" content="AkbK2dowunRF4576qIMFXciNLrINRR_7sBLEcygkbMo" />
	<meta property="og:type" content="website" />
	<meta property="og:site_name" content="loa-sim" />
	<meta property="og:title" content="loa-sim · Lost Ark Combat Power Simulator" />
	<meta property="og:description" content="Lost Ark Combat Power simulator for NA and EUC. Load your character from lostark.bible, change honing, gems, accessories, engravings, ark grid and more, and see the CP change. Next Upgrades ranks your best upgrades by CP or by gold." />
	<meta property="og:url" content="https://loa-sim.vercel.app/" />
	<meta property="og:image" content="https://loa-sim.vercel.app/og.png" />
	<meta property="og:image:width" content="1675" />
	<meta property="og:image:height" content="905" />
	<meta property="og:image:alt" content="loa-sim: equipment honing, gems and Next Upgrades ranked by gold per 1% CP" />
	<meta name="twitter:card" content="summary_large_image" />
	<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"loa-sim","alternateName":["loa sim","Lost Ark Combat Power Simulator"],"url":"https://loa-sim.vercel.app/"},{"@type":"WebApplication","name":"loa-sim","url":"https://loa-sim.vercel.app/","applicationCategory":"GameApplication","operatingSystem":"Any","description":"Lost Ark Combat Power simulator for NA and EUC characters.","offers":{"@type":"Offer","price":"0","priceCurrency":"USD"}}]}</script>
</svelte:head>

<!-- A placeholder row, the same height as a character row. -->
{#snippet skeleton()}
	<div class="flex flex-row items-center gap-3 px-3 py-2" aria-hidden="true">
		<span class="size-9 shrink-0 animate-pulse rounded-full bg-surface-800"></span>
		<span class="flex min-w-0 flex-1 flex-col gap-1.5">
			<span class="h-4 w-32 max-w-full animate-pulse rounded-xs bg-surface-800"></span>
			<span class="h-3 w-44 max-w-full animate-pulse rounded-xs bg-surface-800/70"></span>
		</span>
		<span class="h-8 w-16 shrink-0 animate-pulse rounded-xs bg-surface-800"></span>
	</div>
{/snippet}

<!-- One compact character row: class emblem, name, item level · CP, then its actions. -->
{#snippet row(c: { region: string; name: string }, classId: string | undefined, ilvl: number | undefined, cp: { score: number; support: boolean } | undefined, note: string | undefined, dismiss: { label: string; icon: 'hide' | 'show' | 'remove'; run: () => void } | null, muted = false)}
	{@const key = characterKey(c)}
	{@const have = savedByKey.get(key)}
 <ReorderRow label={c.name}>
 <div class="flex flex-row items-center gap-3 px-3 py-2 {muted ? 'bg-black/20 [&>:not(:last-child)]:opacity-40' : ''}">
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
			<button type="button" class={secondary} disabled={loading !== null} onclick={() => load(c.region, c.name)} title="Reload the latest lostark.bible snapshot">
				{loading === key ? '…' : refreshed === key ? '✓' : '↻'}
			</button>
		{:else}
			<button type="button" class={primary} disabled={loading !== null} onclick={() => load(c.region, c.name)}>{loading === key ? 'Loading…' : 'Load'}</button>
		{/if}
		{#if dismiss}
			<button type="button" class="flex w-5 justify-center text-surface-500 hover:text-surface-100" onclick={dismiss.run} aria-label={`${dismiss.label} ${c.name}`} title={dismiss.label}>
				{#if dismiss.icon === 'remove'}✕{:else}
					<svg viewBox="0 0 24 24" class="size-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
						<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
						<circle cx="12" cy="12" r="3" />
						{#if dismiss.icon === 'hide'}<path d="M3 3l18 18" />{/if}
					</svg>
				{/if}
			</button>
		{/if}
 </div>
 {#if !muted}
  {#each builds.filter(s => s.characterKey === key) as build (build.id)}
   {@const score = simulationCP(build)}
   <div class="mb-2 ml-3 mr-3 flex min-w-0 items-center gap-2 border-l border-accent-400/30 pl-3 text-xs">
    <a class="flex min-w-0 items-center gap-2 py-1 hover:text-accent-200" href={`/sim?c=${encodeURIComponent(key)}&build=${encodeURIComponent(build.id)}`}>
     <span class="truncate">{build.name}</span><span class="tabular-nums {build.loadout.combatPower?.id === 2 ? 'text-green-400' : 'text-red-400'}">{score.toFixed(2)}</span>
    </a>
    <button type="button" class="flex size-8 shrink-0 items-center justify-center rounded-xs text-lg text-surface-400 hover:bg-surface-800 hover:text-surface-100" aria-label={`Unpin ${build.name}`} title="Unpin build" onclick={() => unpin(build.id)}>×</button>
   </div>
  {/each}
 {/if}
 </ReorderRow>
{/snippet}

<!-- Desktop: the characters column with Updates as a side card (like the simulator's CP card); phones get a folded
     Updates card above the Roster instead. -->
<div class="mx-auto grid max-w-2xl gap-4 lg:max-w-[calc(42rem+320px+1rem)] lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
<!-- Intro and search on the first row; Updates starts level with the Roster card on the second. -->
<div class="flex min-w-0 flex-col gap-4 pt-6">
	<div class="flex flex-col gap-1">
		<h1 class="text-2xl font-bold">Combat Power Simulator</h1>
		<p class="text-sm text-surface-300">Load a character, change its gear, and see what each change does to Combat Power.</p>
		<ul class="list-disc pl-5 text-xs text-surface-400">
			<li>Uses only what lostark.bible already shows publicly for a character.</li>
			<li>Characters, your roster and edits stay in your browser. Sharing creates a public build link that expires in 30 days.</li>
		</ul>
	</div>

	<!-- Search: load any character into the list below. -->
	<form
		class="flex flex-row gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			if (target) load(target.region, target.name, true);
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
	{:else if searched}
		<p class="-mt-2 text-sm text-surface-300">
			✓ Loaded {searched.name}{#if searched.region !== 'NA'} ({searched.region}){/if} ·
			<a href={openUrl(searched)} class="text-accent-300 underline hover:text-accent-200">Open in simulator</a>
		</p>
	{/if}
</div>
<div class="flex min-w-0 flex-col gap-4 pb-6 lg:col-start-1">
	<SiteNewsStrip />
	<!-- Roster: synced from lostark.bible. -->
	<section class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
		<div class="flex min-h-11 flex-row items-center gap-2 bg-black/10 px-3 py-2">
			<img src="/bible/artist_cry.webp" alt="" width="24" height="24" class="size-6" />
			<span class="font-bold">Roster</span>
			<span class="text-xs text-surface-500">from lostark.bible</span>
			{#if signedIn}
				<button
					type="button"
					class="ml-auto text-xs text-surface-400 hover:text-surface-100 disabled:opacity-50"
					disabled={refreshing}
					onclick={refreshRoster}
					title="Fetch your roster from lostark.bible again"
				>
					{refreshing ? 'Refreshing…' : `↻${rosterAt ? ` ${ago(rosterAt)}` : ''}`}
				</button>
				<button type="button" class="text-xs text-surface-400 underline hover:text-surface-100" onclick={() => ((signedIn = false), (roster = null), signOut())}>Sign out</button>
			{/if}
		</div>
		{#if rosterPending}
			<div role="status" aria-label="Loading your roster" class="flex flex-col divide-y divide-neutral-950">
				{#each { length: skeletonRows } as _, i (i)}{@render skeleton()}{/each}
			</div>
		{:else if !signedIn}
			<div class="flex flex-row flex-wrap items-center gap-3 px-3 py-3">
				<button type="button" class={primary} onclick={startSignIn}>Sign in with lostark.bible</button>
				<span class="text-xs text-surface-400">Lists your characters to load in one click.</span>
			</div>
		{:else if roster?.length === 0}
			<p class="px-3 py-3 text-sm text-surface-400">No characters on your linked rosters yet.</p>
		{:else if roster}
			<SortableCharacters characters={shownRoster} group="roster" onorder={ids => reorder('roster', ids)}>
 {#snippet children(c)}
				{@const have = savedByKey.get(characterKey(c))}
				{@const isHidden = hiddenSet.has(characterKey(c))}
				{@render row(
					c,
					c.classId ?? have?.loadout?.classId,
					c.ilvl ?? have?.header?.ilvl,
					c.cp ?? (have?.loadout?.combatPower ? { score: have.loadout.combatPower.score, support: have.loadout.combatPower.id === 2 } : undefined),
					isHidden ? 'hidden' : have ? `loaded ${ago(have.savedAt)}` : undefined,
					isHidden
						? { label: 'Show', icon: 'show', run: () => setHidden(characterKey(c), false) }
						: { label: 'Hide', icon: 'hide', run: () => setHidden(characterKey(c), true) },
					isHidden
				)}
			{/snippet}
 </SortableCharacters>
 <div class="flex min-h-10 items-center justify-between gap-3 px-3 py-2">
			{#if hiddenCount}
				<button type="button" class="text-left text-xs {showHidden ? 'font-semibold text-accent-300 hover:text-accent-200' : 'text-surface-400 hover:text-surface-100'}" onclick={() => (showHidden = !showHidden)}>
					{showHidden ? '✓ Confirm' : `${hiddenCount} hidden · show`}
				</button>
			{/if}
 {#if orders.roster.length}<button type="button" class="ml-auto text-xs text-surface-300 underline decoration-surface-600 underline-offset-4 hover:text-surface-100" onclick={() => changeOrder('roster', [])}>Reset order</button>{/if}
 </div>
		{/if}
		{#if rosterError}<p class="px-3 py-3 text-sm text-red-400">{rosterError}</p>{/if}
	</section>

	<!-- Characters loaded by name (or pasted), not on the roster. -->
	{#if !rosterPending && (typed.length || loadingNew)}
		<section class="flex flex-col divide-y divide-neutral-950 rounded-xs bg-surface-900 shadow-sm shadow-neutral-800">
			<div class="bg-black/10 px-3 py-2 font-bold">Characters</div>
			{#if loadingNew}{@render skeleton()}{/if}
			<SortableCharacters characters={typed} group="characters" onorder={ids => reorder('characters', ids)}>
 {#snippet children(c)}
				{@render row(
					c,
					c.loadout?.classId,
					c.header?.ilvl,
					c.loadout?.combatPower ? { score: c.loadout.combatPower.score, support: c.loadout.combatPower.id === 2 } : undefined,
					`loaded ${ago(c.savedAt)}`,
					{ label: 'Remove', icon: 'remove', run: () => remove(c) }
				)}
 {/snippet}
 </SortableCharacters>
 {#if orders.characters.length}<div class="flex justify-end px-3 py-2"><button type="button" class="text-xs text-surface-300 underline decoration-surface-600 underline-offset-4 hover:text-surface-100" onclick={() => changeOrder('characters', [])}>Reset order</button></div>{/if}
		</section>
	{/if}

	<details class="rounded-xs bg-surface-900 px-3 py-2 text-sm text-surface-300 shadow-sm shadow-neutral-800">
		<summary class="cursor-pointer font-semibold text-surface-100 hover:text-accent-200">How to use</summary>
		<ul class="mt-2 list-disc space-y-1 pl-5">
			<li>Load a character by name, or sign in and pick one from your roster.</li>
			<li>Change honing, accessories, gems, engravings, ark grid, bracelet and karma; Combat Power updates as you go.</li>
			<li>
				Data comes from lostark.bible, as of its last snapshot. To refresh it:
				<ol class="mt-1 list-decimal space-y-0.5 pl-5">
					<li>In game, equip the gear you want to simulate.</li>
					<li>Go to character select or switch characters, so lostark.bible picks up the change.</li>
					<li>Check the character's lostark.bible page shows the new gear.</li>
					<li>Press ↻ on the character here. A character loaded in the last 5 minutes comes back unchanged; wait a few minutes and press it again.</li>
				</ol>
			</li>
			<li>Characters with an estimated raid loadout on lostark.bible open with it (best raid gear seen); switch to the latest snapshot on the simulator page.</li>
		</ul>
	</details>

	<details bind:open={showPaste} class="rounded-xs bg-surface-900 px-3 py-2 text-sm text-surface-300 shadow-sm shadow-neutral-800">
		<summary class="cursor-pointer font-semibold text-surface-100 hover:text-accent-200">Load not working?</summary>
		<div class="mt-2 flex flex-col gap-2">
			<span class="font-semibold text-surface-100">Manual load</span>
			{#if target}
				<span>
					Open <a class="text-accent-300 underline hover:text-accent-200" href={bibleDataUrl(target.region, target.name)} target="_blank" rel="noopener">{target.name}'s data ↗</a>,
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

</div>
<aside class="flex max-h-[calc(100vh-5rem)] flex-col max-lg:hidden lg:sticky lg:top-16 lg:col-start-2 lg:row-start-2" aria-label="Updates">
	<SiteNews class="min-h-0" />
</aside>
</div>
