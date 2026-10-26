<!--
	Simulator page header strip: chips for the loaded characters in the Characters tab's order, and the CP / DPS switch.
	Characters that aren't loaded yet are loaded from the Characters tab.
-->
<script lang="ts">
	import { ordered, readOrder } from '$lib/character-order';
	import { cachedRoster, hiddenRosterKeys } from '$lib/bible-oauth';
	import { characterKey, listSavedCharacters, type SavedCharacter } from '$lib/saved-character';
	import ModeSwitch from '$lib/upgrade-planner/sim/ModeSwitch.svelte';
	import { classIconUrl } from '$lib/upgrade-planner/class-icons';
	import { hasStoredRuns } from '$lib/logs/runs-store.svelte';

	let { current, dpsMode = false, onmode }: {
		/** Key of the character on screen ("na/soulshan"). */
		current: string;
		/** In DPS mode now: kept for a character with runs in this browser. */
		dpsMode?: boolean;
		onmode: (mode: 'cp' | 'dps') => void;
	} = $props();

	// Read from this browser's storage; recomputed when the shown character changes.
	const lists = $derived.by(() => {
		void current;
		const saved = ordered(listSavedCharacters(), readOrder('characters'));
		const byKey = new Map(saved.map((c) => [characterKey(c), c]));
		const hidden = new Set(hiddenRosterKeys());
		const roster = ordered((cachedRoster()?.roster ?? []).filter((c) => !hidden.has(characterKey(c))), readOrder('roster'));
		const rosterKeys = new Set((cachedRoster()?.roster ?? []).map((c) => characterKey(c)));
		// Chips follow the Characters tab: roster order (hidden left out), then searched characters; loaded ones only.
		return { chips: [...roster.flatMap((c) => byKey.get(characterKey(c)) ?? []), ...saved.filter((c) => !rosterKeys.has(characterKey(c)))] };
	});

	// DPS mode carries over only to a character with runs in this browser; one without opens in CP, not on an import prompt.
	const openUrl = (key: string) => `/sim?c=${encodeURIComponent(key)}${dpsMode && hasStoredRuns(key) ? '&mode=dps' : ''}`;

	const cpOf = (c: SavedCharacter) => c.loadout?.combatPower;
</script>

<div class="mb-4 flex flex-col gap-2">
	<!-- One row: character chips scroll sideways, the CP / DPS switch stays put (own row on phones). -->
	<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
		{#if lists.chips.length > 1}
			<!-- No visible scrollbar (it would make the row taller than the switch); the mouse wheel scrolls sideways. -->
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
		<div class="shrink-0 self-end sm:ml-auto"><ModeSwitch {dpsMode} {onmode} /></div>
	</div>
</div>
