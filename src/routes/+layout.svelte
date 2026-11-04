<script lang="ts">
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import { onDestroy, onMount } from 'svelte';
	import { installTouchTips } from '$lib/touch-tips';
	import { loadSavedCharacter } from '$lib/saved-character';
	import MovedNotice from '$lib/MovedNotice.svelte';
	import { KOFI_URL } from '$lib/site-news';
	import '../app.css';
	// The Latin Geist file the stylesheet uses: preloaded so text isn't held back until the CSS has been parsed.
	import geistLatin from '@fontsource-variable/geist/files/geist-latin-wght-normal.woff2?url';

	let { children } = $props();
	onMount(installTouchTips);
	let loadHint = $state(false);
	let hintTimer: ReturnType<typeof setTimeout>;
	onDestroy(() => clearTimeout(hintTimer));
	function openTab(event: MouseEvent, href: string) {
		if (href !== '/sim' || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || loadSavedCharacter()) return;
		event.preventDefault();
		loadHint = true;
		clearTimeout(hintTimer);
		hintTimer = setTimeout(() => loadHint = false, 3_000);
	}

	const tabs = [
		{ href: '/', label: 'Characters', active: (p: string) => p === '/' },
		{ href: '/sim', label: 'Simulator', active: (p: string) => p.startsWith('/sim') || p.startsWith('/character') || p.startsWith('/s/') }
	];
</script>

<svelte:head>
	<link rel="preload" href={geistLatin} as="font" type="font/woff2" crossorigin="anonymous" />
	{#if !dev}
		<script
			type="module"
			src="https://static.cloudflareinsights.com/beacon.min.js"
			data-cf-beacon={JSON.stringify({ token: 'ccfe8bf703714dd887f885a93e1dfe0d' })}
		></script>
	{/if}
</svelte:head>

<div class="flex min-h-screen flex-col">
	<!-- Fixed height: the phone CP bar docks right under it (top-12). -->
	<header class="sticky top-0 z-50 h-12 bg-neutral-900/80 shadow-sm shadow-neutral-800 backdrop-blur">
		<nav class="mx-auto flex h-full max-w-[1680px] items-stretch gap-1 px-4 text-sm font-semibold">
			<a href="/" class="mr-4 flex items-center text-base whitespace-nowrap hover:opacity-80">loa-sim</a>
			{#each tabs as t (t.href)}
				{@const on = t.active(page.url.pathname)}
				<a
					href={t.href}
					onclick={(event) => openTab(event, t.href)}
					class="flex items-center border-b-2 px-3 transition {on ? 'border-accent-500 text-surface-50' : 'border-transparent text-surface-300 hover:text-surface-50'}"
					aria-current={on ? 'page' : undefined}
				>
					{t.label}
				</a>
			{/each}
		</nav>
	</header>
	<div role="status" aria-live="polite" aria-atomic="true" class="pointer-events-none fixed top-14 left-1/2 z-[60] -translate-x-1/2">
		{#if loadHint}<p class="whitespace-nowrap rounded-sm border border-neutral-700 bg-surface-900 px-4 py-2 text-sm text-surface-200 shadow-lg shadow-black/30">Load a character first to simulate !</p>{/if}
	</div>

	<MovedNotice />

	<main class="mx-auto w-full max-w-[1680px] flex-1 px-4 py-6">
		{@render children()}
	</main>

	<footer class="border-t border-neutral-800 bg-neutral-950">
		<div class="mx-auto flex max-w-[1680px] flex-col gap-4 px-4 py-6 text-xs text-surface-400 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex flex-col gap-1.5">
				<span class="text-sm">
					Made with <span class="text-red-400">♥</span> by <b class="text-surface-100">Soulshan@Inanna</b>.<br />
					Come find me at the
					<a class="text-[#7289da] hover:underline" href="https://lostark.bible/discord" target="_blank" rel="noopener">ramen shop Discord</a>.
				</span>
				<span>
					<a class="underline hover:text-surface-100" href="/reports">Reports</a> ·
					Character data from <a class="underline hover:text-surface-100" href="https://lostark.bible" target="_blank" rel="noopener">lostark.bible</a>. Not affiliated with Smilegate or Amazon Games. Game data and icons © Smilegate RPG.
				</span>
			</div>
			<a
				class="flex shrink-0 items-center gap-3 self-start rounded-sm border border-[#ff5e5b]/50 bg-[#ff5e5b]/25 py-2 pr-4 pl-3 text-[#ffb3b1] transition hover:bg-[#ff5e5b]/35 sm:self-auto"
				href={KOFI_URL}
				target="_blank"
				rel="noopener"
			>
				<svg class="size-6 shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 6h14v7a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zm14 1.5h1.5a2.75 2.75 0 0 1 0 5.5H17v-1.8h1.5a.95.95 0 0 0 0-1.9H17zM9.9 9.2c-.9-.9-2.4-.3-2.4 1 0 1.3 2.4 3 2.4 3s2.4-1.7 2.4-3c0-1.3-1.5-1.9-2.4-1z" /></svg>
				<span class="flex flex-col leading-tight">
					<span class="text-sm font-bold">Support me on Ko-fi !</span>
					<span class="text-[11px] text-surface-300">Help loa-sim get its own domain :)</span>
				</span>
			</a>
		</div>
	</footer>
</div>
