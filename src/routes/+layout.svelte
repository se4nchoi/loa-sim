<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<header class="sticky top-0 z-50 bg-neutral-900/70 shadow-sm shadow-neutral-800 backdrop-blur">
	<nav class="mx-auto flex max-w-[1680px] items-center gap-6 px-4 py-3 text-sm font-semibold">
		<a href="/" class="text-base whitespace-nowrap">loa-eff</a>
	</nav>
</header>

<main class="mx-auto max-w-[1680px] px-4 py-6">
	{@render children()}
</main>
