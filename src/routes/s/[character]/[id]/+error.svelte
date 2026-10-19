<script lang="ts">
	import {page} from '$app/state';
</script>
<svelte:head><title>Shared simulation unavailable | loa-sim</title><meta name="robots" content="noindex,nofollow" /></svelte:head>
<h1 class="text-xl font-semibold">Shared simulation unavailable</h1>
<p class="mt-3 text-surface-300">{page.error?.message}</p>
<a href="/" class="mt-4 inline-block text-accent-300 underline">Open your characters</a>
