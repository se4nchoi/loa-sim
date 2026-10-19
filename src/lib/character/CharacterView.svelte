<script lang="ts">
	import { Simulator } from '$lib/upgrade-planner';
	import { untrack } from 'svelte';
	import { initSimState, type SimState } from '$lib/upgrade-planner/simulate';
	import SavedSimulations from '$lib/upgrade-planner/SavedSimulations.svelte';
	import { className } from '$lib/upgrade-planner/class-names';
	import type { CpDistribution } from '$lib/upgrade-planner/cp-distribution';
	import type { LoadoutKind } from '$lib/bible-data';
	import type { Snapshot } from '$lib/snapshot-history';
	import MenuPicker from '$lib/upgrade-planner/sim/MenuPicker.svelte';
	import type { Loadout } from '$lib/upgrade-planner/types';

	let {
		dpsMode = false,
		initialBuild,
		sharedBuild = false,
		name,
		region,
		subtitle,
		itemLevel,
		loadout,
		cpDistribution = null,
		loadouts,
		loadoutKind,
		estimatedFrom,
		onloadout,
		older = [],
		snapshotId,
		onsnapshot,
		onerase,
		onreload
	}: {
		dpsMode?: boolean;
		initialBuild?: import('$lib/upgrade-planner/saved-simulations').SavedSimulation;
		sharedBuild?: boolean;
		name: string;
		region: string;
		/** Lines under the name (guild, snapshot time). */
		subtitle?: string | string[];
		itemLevel?: number | null;
		loadout: Loadout | null;
		cpDistribution?: CpDistribution | null;
		/** bible's estimated raid loadout and latest raid snapshot, to switch between when both exist. */
		loadouts?: Partial<Record<LoadoutKind, Loadout>>;
		loadoutKind?: LoadoutKind;
		/** Set when the estimate was kept from an earlier load (bible no longer lists it): when bible last had it. */
		estimatedFrom?: number;
		onloadout?: (kind: LoadoutKind) => void;
		/** Earlier snapshots kept in this browser (not one of `loadouts`), newest first. */
		older?: Snapshot[];
		/** The kept snapshot being simulated, if any. */
		snapshotId?: string;
		onsnapshot?: (id: string) => void;
		/** Erases a kept snapshot (its × in the menu). */
		onerase?: (id: string) => void;
		/** Reloads the character from lostark.bible; resolves whether that brought a snapshot this browser didn't have. */
		onreload?: () => Promise<boolean>;
	} = $props();

	let edited = $state(false);
 let simulation = $state<SimState | null>(untrack(() => initialBuild ? structuredClone($state.snapshot(initialBuild.state)) : loadout ? initSimState(loadout) : null));
	$effect.pre(() => { simulation = loadout ? initSimState(loadout) : null; });
	let reloading = $state(false);
	let reloadNote = $state<{ text: string; tone: 'ok' | 'info' | 'error' } | null>(null);
	let noteTimer: ReturnType<typeof setTimeout> | undefined;
	async function reload() {
		if (!onreload || reloading) return;
		if (edited && !confirm('Reload from lostark.bible and discard your simulated changes?')) return;
		reloading = true;
		reloadNote = null;
		clearTimeout(noteTimer);
		try {
			reloadNote = (await onreload())
				? { text: 'New snapshot loaded', tone: 'ok' }
				: { text: "No new snapshot loaded. If you expected one, check that your lostark.bible snapshot shows what you want.", tone: 'info' };
		} catch (e) {
			reloadNote = { text: e instanceof Error ? e.message : String(e), tone: 'error' };
		} finally {
			reloading = false;
			noteTimer = setTimeout(() => (reloadNote = null), 12000);
		}
	}

	const LOADOUT_LABELS: Record<LoadoutKind, { label: string; title: string }> = {
		estimated: { label: 'Bible best gear seen', title: "lostark.bible's estimate: the best raid gear it has seen across snapshots (e.g. gems a snapshot caught unequipped)" },
		current: { label: 'Latest bible snapshot', title: 'Exactly what lostark.bible saw the last time you entered a raid' }
	};
	const loadoutOptions = $derived(
		(['estimated', 'current'] as const)
			.filter((k) => loadouts?.[k])
			.map((k) => {
				const kept = k === 'estimated' && estimatedFrom;
				const day = kept ? new Date(estimatedFrom).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
				return {
					value: k,
					label: `${LOADOUT_LABELS[k].label}${kept ? ` (${day})` : ''} · ${loadouts![k]!.combatPower?.score.toFixed(2) ?? '?'}`,
					title: kept
						? `${LOADOUT_LABELS[k].title}. Kept from your load on ${day}: lostark.bible no longer lists it (it rebuilds the estimate after new raid snapshots).`
						: LOADOUT_LABELS[k].title
				};
			})
	);

	// With earlier snapshots kept, one menu lists bible's two loadouts and those, so the player can go back to the one
	// that has their gear (bible only keeps the latest). Each row: what it is, its date, and its CP in a column.
	/** MM-DD, like the Updates card. */
	const shortDay = (t: number) => {
		const d = new Date(t);
		return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
	};
	const menu = $derived.by(() => {
		const rows = [
			...(['estimated', 'current'] as const)
				.filter((k) => loadouts?.[k])
				.map((k) => {
					const l = loadouts![k]!;
					const kept = k === 'estimated' ? estimatedFrom : undefined;
					return { value: k as string, id: undefined as string | undefined, name: LOADOUT_LABELS[k].label, at: kept ?? l.lastUpdated, score: l.combatPower?.score, support: l.combatPower?.id === 2, title: loadoutOptions.find((o) => o.value === k)?.title };
				}),
			...older.map((s) => ({
				value: `snap:${s.id}`,
				id: s.id as string | undefined,
				name: s.kind === 'estimated' ? 'Saved best gear seen' : 'Saved raid snapshot',
				at: s.takenAt as number | undefined,
				score: s.loadout.combatPower?.score,
				support: s.loadout.combatPower?.id === 2,
				title: `An earlier ${s.kind === 'estimated' ? 'lostark.bible estimate' : 'raid snapshot'}, kept in this browser from a past load (lostark.bible only lists the latest).`
			}))
		];
		const best = Math.max(...rows.map((r) => r.score ?? 0));
		// Marked only when there's something to compare it with.
		const top = rows.length > 1 ? rows.findIndex((r) => best > 0 && r.score === best) : -1;
		// The highest CP first, marked; the rest in their order (bible's two, then kept ones newest first).
		const ordered = top > 0 ? [rows[top], ...rows.filter((_, i) => i !== top)] : rows;
		return ordered.map((r, i) => ({
			value: r.value,
			label: r.name,
			note: r.at ? shortDay(r.at) : '',
			detail: { label: r.score?.toFixed(2) ?? '?', color: r.support ? 'var(--color-green-400)' : 'var(--color-red-400)' },
			marker: i === 0 && top >= 0 ? 'var(--color-accent-400)' : '',
			onremove: r.id && onerase ? () => onerase(r.id!) : undefined,
			// bible's two are whatever its page lists now: they change when bible re-snapshots and can't be erased here.
			locked: r.id ? undefined : "From lostark.bible's page as it is now: it updates when bible takes a new snapshot, and can't be erased here",
			removeLabel: `Erase the ${r.name.toLowerCase()} from ${r.at ? shortDay(r.at) : 'earlier'}`,
			title: i === 0 && top >= 0 ? `${r.title ?? ''} Highest Combat Power of these.`.trim() : r.title
		}));
	});
	/** With nothing saved yet, a greyed hint row says where saved snapshots will appear. */
	const menuOptions = $derived(
		older.length
			? menu
			: [...menu, { value: 'hint', label: 'Older snapshots show up here as you reload this character', disabled: true, muted: true, marker: '' }]
	);
	const menuValue = $derived(snapshotId ? `snap:${snapshotId}` : (loadoutKind ?? ''));
	/**
	 * Switching rebuilds the whole simulator for the new loadout, which takes a moment on phones. The menu closes and
	 * the button shows the choice first; the switch starts once that has been drawn.
	 */
	let pending = $state<string | null>(null);
	function pickMenu(v: string) {
		pending = v;
		requestAnimationFrame(() =>
			setTimeout(() => {
				pending = null;
				if (v.startsWith('snap:')) onsnapshot?.(v.slice(5));
				else onloadout?.(v as LoadoutKind);
			})
		);
	}
	const shownPick = $derived(menu.find((o) => o.value === (pending ?? menuValue)));

	const ilvl = $derived(itemLevel ?? loadout?.itemLevel ?? null);
	const lines = $derived((Array.isArray(subtitle) ? subtitle : [subtitle]).filter((l): l is string => !!l));
</script>

<svelte:head>
	<title>{name} ({region}) | loa-sim</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="mb-4 flex flex-col gap-1">
	<div class="flex flex-row gap-1 text-xs">
		<span class="rounded-xs bg-surface-900 px-2 py-0.5">{region === 'NA' ? 'North America' : region}</span>
		{#if loadout}<span class="rounded-xs bg-surface-900 px-2 py-0.5">{className(loadout.classId)}</span>{/if}
	</div>
	<h1 class="text-3xl font-bold">{name}</h1>
	{#if ilvl}<span class="text-xl font-semibold text-surface-200 tabular-nums"><span class="mr-1.5 text-xs font-normal text-surface-400">Item Level</span>{ilvl.toFixed(2)}</span>{/if}
	{#each lines as line (line)}<span class="text-sm text-surface-300">{line}</span>{/each}
	<a class="w-fit text-xs text-surface-300 underline hover:text-surface-50" href={`https://lostark.bible/character/${region}/${encodeURIComponent(name)}`} target="_blank" rel="noopener">
		View on lostark.bible
	</a>
	<!-- Always shown, so players find saved snapshots before they have any. -->
	{#if menu.length && onsnapshot && onloadout}
		<span class="mt-2 text-xs text-surface-400">Starting gear</span>
		<div class="grid w-full max-w-[27.125rem] grid-cols-[minmax(0,1fr)_2rem] max-lg:grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-1.5">
			<MenuPicker value={pending ?? menuValue} options={menuOptions} onpick={pickMenu} label="Loadout to simulate" full fitMenu mobileDetails>
				{#snippet trigger()}
					<!-- Same words for every choice ("Snapshot on 10-11 6620.18"), so picking one never resizes the button; the
					     menu has the full names. -->
					<span class="flex min-w-0 flex-row items-baseline gap-1.5 overflow-hidden text-xs max-sm:text-base" title={shownPick?.label}>
						<span class="shrink-0">Snapshot{shownPick?.note ? ' on' : ''}</span>
						{#if shownPick?.note}<span class="shrink-0 text-surface-300 tabular-nums">{shownPick.note}</span>{/if}
						{#if shownPick}<span class="shrink-0 font-semibold tabular-nums" style:color={shownPick.detail.color}>{shownPick.detail.label}</span>{/if}
					</span>
				{/snippet}
			</MenuPicker>
			{#if onreload}
				<button
					type="button"
					class="flex size-8 max-lg:size-11 shrink-0 items-center justify-center rounded-xs border border-surface-600 bg-surface-800/80 text-surface-200 transition hover:border-accent-500 hover:bg-surface-700/80 hover:text-surface-50 disabled:opacity-50"
					onclick={reload}
					disabled={reloading}
					title="Reload from lostark.bible"
					aria-label="Reload from lostark.bible"
				>
					<span class={reloading ? 'animate-spin' : ''}>↻</span>
				</button>
			{/if}
		</div>
		{#if reloadNote}
			<p role="status" class="text-xs {reloadNote.tone === 'ok' ? 'text-green-400' : reloadNote.tone === 'error' ? 'text-red-400' : 'text-amber-300/90'}">{reloadNote.text}</p>
		{/if}
	{/if}
	{#if loadout && simulation}
		<span class="mt-2 text-xs text-surface-400">Plan</span>
		<div class="grid w-full max-w-[27.125rem] grid-cols-[minmax(0,1fr)_2rem] max-lg:grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-1.5">
			<SavedSimulations workspaceKey={initialBuild ? `${region}/${name}:build:${initialBuild.id}`.toLowerCase() : undefined} initialId={initialBuild?.id} characterKey={`${region}/${name}`.toLowerCase()} {loadout} state={simulation} onrestore={(state) => simulation = state} />
		</div>
	{/if}
</div>

{#if !loadout}
	<p class="text-surface-300">This character has no Ark Passive loadout with combat power data yet.</p>
{:else}
	<!-- While a snapshot switch resolves, the simulator dims under a spinner, so the cards changing (another loadout can
	     have more gems, different cores) reads as loading rather than a jolt. -->
	<div class="relative" aria-busy={pending !== null}>
		{#if pending !== null}
			<div class="absolute inset-0 z-30 bg-surface-950/60" role="status" aria-live="polite">
				<div class="sticky top-[40vh] flex justify-center">
					<span class="flex items-center gap-2 rounded-xs border border-surface-600 bg-surface-900 px-3 py-2 text-sm text-surface-100 shadow-lg shadow-black/50">
						<svg class="size-4 animate-spin text-accent-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-opacity="0.25" stroke-width="3" />
							<path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
						</svg>
						Loading snapshot…
					</span>
				</div>
			</div>
		{/if}
		{#if simulation}<Simulator {dpsMode} restoreInitial={sharedBuild} initialState={initialBuild?.state} workspaceKey={initialBuild ? `${region}/${name}:build:${initialBuild.id}`.toLowerCase() : undefined} bind:sim={simulation} bind:edited {loadout} {cpDistribution} characterName={name} characterKey={`${region}/${name}`.toLowerCase()} />{/if}
	</div>
{/if}
