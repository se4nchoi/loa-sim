<script lang="ts">
	import CharacterView from '$lib/demo/CharacterView.svelte';
	import soulshan from '$lib/upgrade-planner/fixtures/na-soulshan.json';
	import type { Loadout } from '$lib/upgrade-planner/types';
</script>

<CharacterView
	name="Soulshan"
	region="NA"
	subtitle="Offline snapshot (test fixture)"
	loadout={soulshan as unknown as Loadout}
/>
