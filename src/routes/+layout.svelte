<script lang="ts">
	import { dev } from '$app/environment';
	import { page } from '$app/state';
	import { injectAnalytics } from '@vercel/analytics/sveltekit';
	import '../app.css';

	injectAnalytics({ mode: dev ? 'development' : 'production' });

	let { children } = $props();

	const tabs = [
		{ href: '/', label: 'Characters', active: (p: string) => p === '/' },
		{ href: '/sim', label: 'Simulator', active: (p: string) => p.startsWith('/sim') || p.startsWith('/character') }
	];
</script>

<div class="flex min-h-screen flex-col">
	<!-- Fixed height: the phone CP bar docks right under it (top-12). -->
	<header class="sticky top-0 z-50 h-12 bg-neutral-900/80 shadow-sm shadow-neutral-800 backdrop-blur">
		<nav class="mx-auto flex h-full max-w-[1680px] items-stretch gap-1 px-4 text-sm font-semibold">
			<a href="/" class="mr-4 flex items-center text-base whitespace-nowrap hover:opacity-80">loa-sim</a>
			{#each tabs as t (t.href)}
				{@const on = t.active(page.url.pathname)}
				<a
					href={t.href}
					class="flex items-center border-b-2 px-3 transition {on ? 'border-accent-500 text-surface-50' : 'border-transparent text-surface-300 hover:text-surface-50'}"
					aria-current={on ? 'page' : undefined}
				>
					{t.label}
				</a>
			{/each}
		</nav>
	</header>

	<main class="mx-auto w-full max-w-[1680px] flex-1 px-4 py-6">
		{@render children()}
	</main>

	<footer class="border-t border-neutral-800 bg-neutral-950">
		<div class="mx-auto flex max-w-[1680px] flex-col gap-1 px-4 py-5 text-xs text-surface-400 sm:flex-row sm:items-center sm:justify-between">
			<span>
				Made with <span class="text-red-400">♥</span> by <b class="text-surface-200">Soulshan@Inanna</b>.
				Got feedback? Join the
				<a class="text-[#7289da] hover:underline" href="https://lostark.bible/discord" target="_blank" rel="noopener">ramen shop Discord</a>.
			</span>
			<span>
				Character data from <a class="underline hover:text-surface-100" href="https://lostark.bible" target="_blank" rel="noopener">lostark.bible</a>. Not affiliated with Smilegate or Amazon Games. Game data and icons © Smilegate RPG.
			</span>
		</div>
	</footer>
</div>
