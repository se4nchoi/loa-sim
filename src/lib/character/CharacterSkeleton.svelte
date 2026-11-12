<!-- Stands in for CharacterView while a character loads from lostark.bible: the same header and card grid, so the
     page doesn't jump when the data arrives. -->
<script lang="ts">
	/** `picker`: the page will also show the snapshot picker row (the simulator page does). */
	let { name, region, picker = false }: { name: string; region: string; picker?: boolean } = $props();
	const card = 'animate-pulse rounded-xs bg-surface-900 shadow-sm shadow-neutral-800';
	const bar = 'animate-pulse rounded-xs bg-surface-800';
</script>

<svelte:head>
	<title>{name} ({region}) | loa-sim</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div role="status" aria-busy="true">
	<div class="mb-4 flex flex-col gap-1">
		<div class="flex flex-row gap-1 text-xs">
			<span class="rounded-xs bg-surface-900 px-2 py-0.5">{region === 'NA' ? 'North America' : region}</span>
			<span class="{bar} h-5 w-20"></span>
		</div>
		<h1 class="text-3xl font-bold">{name}</h1>
		<span class="{bar} h-7 w-24"></span>
		<span class="text-sm text-surface-300">Loading from lostark.bible…</span>
		<a class="w-fit text-xs text-surface-300 underline hover:text-surface-50" href={`https://lostark.bible/character/${region}/${encodeURIComponent(name)}`} target="_blank" rel="noopener">
			View on lostark.bible
		</a>
		{#if picker}<span class="{bar} mt-1 h-8 w-full max-w-[27.125rem] max-lg:h-11"></span>{/if}
		<span class="{bar} mt-2 h-8 w-full max-w-[27.125rem] max-lg:h-11"></span>
	</div>

	<div class="grid grid-cols-[1fr_320px] items-start gap-2 max-lg:grid-cols-1" aria-hidden="true">
		<div class="flex min-w-0 flex-col gap-2">
			<div class="grid grid-cols-2 items-start gap-2 max-xl:grid-cols-1">
				<div class="flex flex-col gap-2">
					<div class="{card} h-96"></div>
					<div class="{card} h-64"></div>
				</div>
				<div class="flex flex-col gap-2">
					<div class="{card} h-72"></div>
					<div class="{card} h-88"></div>
				</div>
			</div>
			<div class="{card} h-80"></div>
		</div>
		<div class="flex flex-col gap-2 max-lg:hidden">
			<div class="{card} h-44"></div>
			<div class="{card} h-96"></div>
		</div>
	</div>
</div>
