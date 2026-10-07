<!--
	Small inline marks used next to engraving levels, drawn to read like lopec.kr's engraving card:
	an orange relic diamond for relic book level, a cyan crystal for ability stone level.
-->
<script lang="ts">
	let { kind, size = 'size-3.5', dim = false }: { kind: 'relic' | 'stone'; size?: string; dim?: boolean } = $props();
</script>

{#if kind === 'relic'}
	<svg class="{size} shrink-0 {dim ? 'opacity-35 grayscale' : ''}" viewBox="0 0 16 16" aria-hidden="true">
		<defs>
			<linearGradient id="glyph-relic" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" stop-color="#ffb35c" />
				<stop offset="0.55" stop-color="#ff6a00" />
				<stop offset="1" stop-color="#b83a00" />
			</linearGradient>
		</defs>
		<path d="M8 1 15 8 8 15 1 8z" fill="url(#glyph-relic)" stroke="#5a1d00" stroke-width="1" />
		<path d="M8 4 12 8 8 12 4 8z" fill="#ffd9a8" opacity="0.35" />
	</svg>
{:else}
	<svg class="{size} shrink-0 {dim ? 'opacity-35 grayscale' : ''}" viewBox="0 0 12 18" aria-hidden="true">
		<defs>
			<linearGradient id="glyph-stone" x1="0" y1="0" x2="1" y2="1">
				<stop offset="0" stop-color="#d9fbff" />
				<stop offset="0.5" stop-color="#4fd6f2" />
				<stop offset="1" stop-color="#1786b8" />
			</linearGradient>
		</defs>
		<path d="M6 1 11 6 6 17 1 6z" fill="url(#glyph-stone)" stroke="#0b4f6e" stroke-width="0.8" />
		<path d="M1 6h10M6 1v16" stroke="#e8fdff" stroke-width="0.5" opacity="0.5" />
	</svg>
{/if}
