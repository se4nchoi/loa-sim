<!--
	Simulator page header strip: chips for the loaded characters in the Characters tab's order, and a dropdown of the whole character list
	(synced roster without hidden characters, then characters loaded by name). Picking a roster character that
	isn't loaded yet loads it from lostark.bible first.
-->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { cachedRoster, hiddenRosterKeys } from '$lib/bible-oauth';
	import { loadCharacter } from '$lib/load-character';
	import { characterKey, listSavedCharacters, type SavedCharacter } from '$lib/saved-character';
	import { classIconUrl } from '$lib/upgrade-planner/class-icons';

	let { current }: { /** Key of the character on screen ("na/soulshan"). */ current: string } = $props();

	let loading = $state<string | null>(null);
	let error = $state<string | null>(null);

	// Read from this browser's storage; recomputed when the shown character changes.
	const lists = $derived.by(() => {
		void current;
		const saved = listSavedCharacters();
		const byKey = new Map(saved.map((c) => [characterKey(c), c]));
		const hidden = new Set(hiddenRosterKeys());
		const roster = (cachedRoster()?.roster ?? []).filter((c) => !hidden.has(characterKey(c)));
		const rosterKeys = new Set((cachedRoster()?.roster ?? []).map((c) => characterKey(c)));
		return {
			byKey,
			// Chips follow the Characters tab: roster order (hidden left out), then searched characters; loaded ones only.
			chips: [...roster.flatMap((c) => byKey.get(characterKey(c)) ?? []), ...saved.filter((c) => !rosterKeys.has(characterKey(c)))],
			roster: roster.map((c) => ({ ...c, key: characterKey(c), loaded: byKey.has(characterKey(c)) })),
			typed: saved.filter((c) => !rosterKeys.has(characterKey(c)))
		};
	});

	const openUrl = (key: string) => `/sim?c=${encodeURIComponent(key)}`;

	async function pick(key: string) {
		error = null;
		if (!key || key === current) return;
		if (lists.byKey.has(key)) return void goto(openUrl(key));
		const c = lists.roster.find((r) => r.key === key);
		if (!c) return;
		loading = key;
		try {
			const data = await loadCharacter(c.region, c.name);
			await goto(openUrl(characterKey(data)));
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = null;
		}
	}

	const cpOf = (c: SavedCharacter) => c.loadout?.combatPower;
</script>

<div class="mb-4 flex flex-col gap-2">
	<!-- One row: character chips scroll sideways, the dropdown stays put (own row on phones). -->
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
		{#if lists.chips.length > 1}
			<!-- No visible scrollbar (it would make the row taller than the dropdown); the mouse wheel scrolls sideways. -->
			<div
				class="flex min-w-0 flex-1 flex-row items-center gap-2 overflow-x-auto [scrollbar-width:none]! [&::-webkit-scrollbar]:hidden!"
				aria-label="Your characters"
				onwheel={(e) => {
					const el = e.currentTarget;
					if (el.scrollWidth <= el.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
					el.scrollLeft += e.deltaY;
					e.preventDefault();
				}}
			>
			{#each lists.chips as c (characterKey(c))}
				{@const key = characterKey(c)}
				{@const cp = cpOf(c)}
				<a
					href={openUrl(key)}
					aria-current={key === current ? 'page' : undefined}
					class="flex h-9 shrink-0 flex-row items-center gap-2 rounded-xs border px-2 text-sm whitespace-nowrap {key === current
						? 'border-accent-400/40 bg-surface-800 text-surface-50'
						: 'border-surface-700 bg-surface-900 text-surface-200 hover:bg-surface-800'}"
				>
					{#if classIconUrl(c.loadout?.classId)}<img src={classIconUrl(c.loadout?.classId)} alt="" class="size-6" />{/if}
					<span class="font-semibold">{c.name}</span>
					{#if cp}<span class="text-xs tabular-nums {cp.id === 2 ? 'text-green-400' : 'text-red-400'}">{cp.score.toFixed(2)}</span>{/if}
				</a>
			{/each}
			</div>
		{/if}
		<select
			class="h-9 w-full shrink-0 rounded-xs sm:ml-auto sm:w-56 border border-surface-600 bg-surface-800 px-2 text-sm text-surface-100 hover:border-surface-400 focus:border-accent-500 focus:outline-none"
			aria-label="Switch character"
			value=""
			disabled={loading !== null}
			onchange={(e) => {
				const key = e.currentTarget.value;
				e.currentTarget.value = '';
				pick(key);
			}}
		>
			<option value="" disabled>{loading ? 'Loading…' : 'Switch character…'}</option>
			{#if lists.roster.length}
				<optgroup label="Roster">
					{#each lists.roster as c (c.key)}
						<option value={c.key} disabled={c.key === current}>
							{c.name}{c.ilvl ? ` · ${c.ilvl.toFixed(0)}` : ''}{c.loaded ? '' : ' (load)'}
						</option>
					{/each}
				</optgroup>
			{/if}
			{#if lists.typed.length}
				<optgroup label={lists.roster.length ? 'Other characters' : 'Characters'}>
					{#each lists.typed as c (characterKey(c))}
						<option value={characterKey(c)} disabled={characterKey(c) === current}>
							{c.name}{c.region !== 'NA' ? ` (${c.region})` : ''}{c.header?.ilvl ? ` · ${c.header.ilvl.toFixed(0)}` : ''}
						</option>
					{/each}
				</optgroup>
			{/if}
		</select>
	</div>
	{#if error}<p class="text-sm text-red-400">{error}</p>{/if}
</div>
