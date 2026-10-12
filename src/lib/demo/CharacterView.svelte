<script lang="ts">
	import { Simulator } from '$lib/upgrade-planner';
	import { className } from '$lib/upgrade-planner/class-names';
	import type { CpDistribution } from '$lib/upgrade-planner/cp-distribution';
	import type { LoadoutKind } from '$lib/bible-data';
	import type { Snapshot } from '$lib/snapshot-history';
	import MenuPicker from '$lib/upgrade-planner/sim/MenuPicker.svelte';
	import Segmented from '$lib/upgrade-planner/sim/Segmented.svelte';
	import type { Loadout } from '$lib/upgrade-planner/types';

	let {
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
		onsnapshot
	}: {
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
	} = $props();

	const LOADOUT_LABELS: Record<LoadoutKind, { label: string; title: string }> = {
		estimated: { label: 'Estimated raid loadout', title: "lostark.bible's estimate: the best raid gear it has seen (e.g. gems a snapshot caught unequipped)" },
		current: { label: 'Latest raid snapshot', title: 'Exactly what lostark.bible saw last time in a raid' }
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
	const shortDay = (t: number) => new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	const menu = $derived.by(() => {
		const rows = [
			...(['estimated', 'current'] as const)
				.filter((k) => loadouts?.[k])
				.map((k) => {
					const l = loadouts![k]!;
					const kept = k === 'estimated' ? estimatedFrom : undefined;
					return { value: k as string, name: LOADOUT_LABELS[k].label, at: kept ?? l.lastUpdated, score: l.combatPower?.score, support: l.combatPower?.id === 2, title: loadoutOptions.find((o) => o.value === k)?.title };
				}),
			...older.map((s) => ({
				value: `snap:${s.id}`,
				name: s.kind === 'estimated' ? 'Estimate' : 'Raid snapshot',
				at: s.takenAt as number | undefined,
				score: s.loadout.combatPower?.score,
				support: s.loadout.combatPower?.id === 2,
				title: `An earlier ${s.kind === 'estimated' ? 'lostark.bible estimate' : 'raid snapshot'}, kept in this browser from a past load (lostark.bible only lists the latest).`
			}))
		];
		const best = Math.max(...rows.map((r) => r.score ?? 0));
		const top = rows.findIndex((r) => best > 0 && r.score === best);
		// The highest CP first, marked; the rest in their order (bible's two, then kept ones newest first).
		const ordered = top > 0 ? [rows[top], ...rows.filter((_, i) => i !== top)] : rows;
		return ordered.map((r, i) => ({
			value: r.value,
			label: r.name,
			note: r.at ? shortDay(r.at) : '',
			detail: { label: r.score?.toFixed(2) ?? '?', color: r.support ? 'var(--color-green-400)' : 'var(--color-red-400)' },
			marker: i === 0 && top >= 0 ? 'var(--color-accent-400)' : '',
			title: i === 0 && top >= 0 ? `${r.title ?? ''} Highest Combat Power of these.`.trim() : r.title
		}));
	});
	const menuValue = $derived(snapshotId ? `snap:${snapshotId}` : (loadoutKind ?? ''));
	const picked = $derived(menu.find((o) => o.value === menuValue));
	function pickMenu(v: string) {
		if (v.startsWith('snap:')) onsnapshot?.(v.slice(5));
		else onloadout?.(v as LoadoutKind);
	}

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
	{#if ilvl}<span class="text-xl font-semibold text-surface-200 tabular-nums" title="Item Level">{ilvl.toFixed(2)}</span>{/if}
	{#each lines as line (line)}<span class="text-sm text-surface-300">{line}</span>{/each}
	{#if older.length && onsnapshot && onloadout}
		<div class="mt-1 w-fit max-w-full">
			<MenuPicker value={menuValue} options={menu} onpick={pickMenu} label="Loadout to simulate">
				{#snippet trigger()}
					<span class="flex min-w-0 flex-row items-baseline gap-1.5 text-xs">
						<span class="truncate">{picked?.label ?? 'Loadout'}</span>
						{#if picked?.note}<span class="shrink-0 text-surface-400">{picked.note}</span>{/if}
						{#if picked}<span class="shrink-0 font-semibold tabular-nums" style:color={picked.detail.color}>{picked.detail.label}</span>{/if}
					</span>
				{/snippet}
			</MenuPicker>
		</div>
	{:else if loadoutOptions.length > 1 && loadoutKind && onloadout}
		<div class="mt-1"><Segmented value={loadoutKind} options={loadoutOptions} onselect={onloadout} label="Loadout to simulate" size="h-8 px-3 text-xs" /></div>
	{/if}
	<a class="w-fit text-xs text-surface-300 underline hover:text-surface-50" href={`https://lostark.bible/character/${region}/${encodeURIComponent(name)}`} target="_blank" rel="noopener">
		View on lostark.bible
	</a>
</div>

{#if !loadout}
	<p class="text-surface-300">This character has no Ark Passive loadout with combat power data yet.</p>
{:else}
	<Simulator {loadout} {cpDistribution} characterName={name} characterKey={`${region}/${name}`.toLowerCase()} />
{/if}
