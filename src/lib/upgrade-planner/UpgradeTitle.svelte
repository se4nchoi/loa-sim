<!-- An upgrade's name: optional subject line ("Earring 2"), title, and an accessory roll change in roll colors. -->
<script lang="ts">
	import { ROLL_COLORS, statNameColor } from './sim/ui';
	import type { Upgrade } from './upgrades';

	let { u, compact = false, class: cls = '' }: { u: Upgrade; /** Whole accessories as just their rolls (High-High-Mid). */ compact?: boolean; class?: string } = $props();

	const color = (r: string) => ROLL_COLORS[r as keyof typeof ROLL_COLORS] ?? undefined;
	const label = (r: string) => (r in ROLL_COLORS ? r[0].toUpperCase() + r.slice(1) : r);
	const accent = $derived.by(() => {
		if (u.category === 'gem') {
			const target = Number(u.key.split(':')[2]) + 1;
			return target >= 10 ? '#e8d6b4' : target >= 8 ? '#ef6b57' : target >= 7 ? '#ff8a2a' : '#b780ff';
		}
		if (u.category === 'astrogem') {
			return statNameColor(u.title);
		}
		if (u.category === 'core') return /\bOrder\b/i.test(u.title) ? '#f5d35b' : '#65a5ff';
		if (u.key.startsWith('bracer:')) {
			const grade = u.key.split(':')[1];
			return grade === 'ancient' ? '#e8d6b4' : grade === 'relic' ? '#ff8a2a' : grade === 'legendary' ? '#f5bd48' : '#b780ff';
		}
		if (u.category === 'quality') {
			const target = Number(u.key.split(':')[2]);
			return target === 100 ? '#e6bd39' : target >= 90 ? '#b780ff' : target >= 70 ? '#65a5ff' : '#54c9bb';
		}
		if (u.category === 'karma') return u.key.includes('enlightenment') ? '#66c9ed' : u.key.includes('leap') ? '#9be59b' : '#f5bd48';
		return ({ honing: u.key.startsWith('advanced:') ? '#66c9ed' : '#f5bd48', gem: '#b780ff', core: '#65a5ff', astrogem: '#66c9ed', engraving: '#ff8a2a', accessory: undefined, skin: undefined } as const)[u.category];
	});
	const title = $derived(u.category === 'karma'
		? (compact ? u.title.replace(/^(Evolution|Enlightenment|Leap)\s+/i, '') : u.title).replace(/\bkarma\b/g, 'Karma')
		: u.title);
	const shownTargetAt = $derived(title.lastIndexOf('→'));
</script>

<span class="flex min-w-0 flex-col {cls}" title={compact && u.category === 'karma' ? `${u.subject ?? ''} ${u.title}`.trim() : undefined}>
	{#if u.subject && u.category !== 'skin'}<span class="text-xs text-surface-400">{compact && u.category === 'karma' ? u.subject.replace(/^(Evolution|Enlightenment|Leap)\s+/i, '') : u.subject}</span>{/if}
	{#if u.category === 'skin'}
		{@const bonus = Number(u.key.split(':')[2])}
		<span class="text-sm font-semibold">{u.subject} → {u.title.split(' +')[0]} <span style:color={bonus === 2 ? '#ff8a2a' : bonus === 1 ? '#b780ff' : '#65a5ff'}>+{bonus}%</span></span>
	{:else if u.lines && compact}
		<!-- A whole accessory, short: its rolls in order, in the roll colors (X = no third line). -->
		<span class="text-sm font-semibold" title={u.lines.map((line) => `${line.name} ${label(line.tier)}`).join(' · ')}>
			{#each [...u.lines, ...(u.lines.length < 3 ? [null] : [])] as line, i (i)}{#if i}<span class="text-surface-500">-</span>{/if}{#if line}<span style:color={color(line.tier)}>{label(line.tier)}</span>{:else}<span class="text-surface-500">X</span>{/if}{/each}
		</span>
	{:else if u.lines}
		<!-- A whole accessory: each line with its roll, in the roll colors. -->
		<span class="flex flex-col text-sm leading-snug text-surface-100">
			{#each u.lines as line (line.name)}
				<span>{line.name} <b style:color={color(line.tier)} class="font-semibold">{label(line.tier)}</b></span>
			{/each}
			{#if u.lines.length < 3}<span class="text-surface-500">None</span>{/if}
		</span>
	{:else}
	<span class="text-sm text-surface-100">
		{#if shownTargetAt >= 0}
			{#if u.category === 'astrogem'}
				{@const levelAt = title.indexOf(' Lv.')}
				<span class="text-surface-100">{title.slice(0, levelAt)}</span>{title.slice(levelAt, shownTargetAt + 1)}
			{:else}<span>{title.slice(0, shownTargetAt + 1)}</span>{/if}
			<span class="ml-1 font-semibold" style:color={accent}>{title.slice(shownTargetAt + 1).trim()}</span>
		{:else if u.key.startsWith('bracer:') && title.startsWith('Equip ')}<span class="text-surface-100">Equip</span>{' '}<span style:color={accent}>{title.slice(6)}</span>
		{:else}<span style:color={accent}>{title}</span>{/if}{#if u.roll}
			<span class="ml-1 whitespace-nowrap font-semibold">
				<span style:color={color(u.roll.from)}>{label(u.roll.from)}</span>
				<span class="text-surface-400">→</span>
				<span style:color={color(u.roll.to)}>{label(u.roll.to)}</span>
			</span>{/if}{#if u.count > 1}<span class="ml-1 text-xs text-surface-400" title={`You have ${u.count} of these; the gain shown is for one`}>×{u.count}</span>{/if}
	</span>
	{/if}
</span>
