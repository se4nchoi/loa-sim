<script lang="ts">
	import { gold, setHoningBook, setMaterialBound, setMaterialPrice } from './gold-costs.svelte';
	import { btn } from './sim/ui';
	let { characterKey }: { characterKey: string } = $props();
	function configure(e: SubmitEvent, kind: 'weapon' | 'armor') {
		e.preventDefault();
		const data = new FormData(e.currentTarget as HTMLFormElement);
		const rate = Number(data.get('bonus')) * 100;
		const from = Number(data.get('from')), to = Number(data.get('to'));
		if (from > to) {
			const last = (e.currentTarget as HTMLFormElement).querySelector<HTMLInputElement>('[name="to"]');
			last?.setCustomValidity('The last level must be at least the first level.'); last?.reportValidity(); return;
		}
		const id = `honing-book:aegir:${kind}`;
		setMaterialPrice(id, Number(data.get('price')));
		setMaterialBound(characterKey, id, Number(data.get('bound')));
		setHoningBook(kind, { id, name: `Aegir ${kind} honing book`, rate, from, to });
	}
</script>

<details class="rounded-xs border border-surface-700 p-2">
	<summary class="cursor-pointer text-sm font-semibold">Pre-Serca honing books</summary>
	<p class="my-2 text-xs text-surface-400">Enter the success bonus and eligible target levels printed on your Aegir book. Bound books are used first; market books are bought only when the compared strategy saves gold. Include character-bound and roster-bound books available to this character, and update shared stock after spending it.</p>
	{#each ['weapon', 'armor'] as const as kind}
		{@const book = gold.honingBooks[`aegir:${kind}`]}
		{@const id = `honing-book:aegir:${kind}`}
		<form onsubmit={(e) => configure(e, kind)} oninput={(e) => e.currentTarget.querySelector<HTMLInputElement>('[name="to"]')?.setCustomValidity('')} class="mt-3 space-y-2 border-t border-surface-700 pt-2">
			<h3 class="text-sm font-semibold capitalize">{kind} book {book ? '· enabled' : '· off'}</h3>
			<div class="grid grid-cols-3 gap-2 text-xs">
				<label>Success +%<input name="bonus" required type="number" min="0.01" max="100" step="0.01" value={book ? book.rate / 100 : ''} class="mt-1 h-8 w-full rounded-xs border border-surface-600 bg-surface-800 px-2" /></label>
				<label>First target +<input name="from" required type="number" min="1" max="25" step="1" value={book?.from ?? ''} class="mt-1 h-8 w-full rounded-xs border border-surface-600 bg-surface-800 px-2" /></label>
				<label>Last target +<input name="to" required type="number" min="1" max="25" step="1" oninput={(e) => e.currentTarget.setCustomValidity('')} value={book?.to ?? ''} class="mt-1 h-8 w-full rounded-xs border border-surface-600 bg-surface-800 px-2" /></label>
			</div>
			<div class="grid grid-cols-2 gap-2 text-xs">
				<label>Gold per market book<input name="price" required type="number" min="0" step="0.01" value={gold.prices[id] ?? 0} class="mt-1 h-8 w-full rounded-xs border border-surface-600 bg-surface-800 px-2" /></label>
				<label>Bound books available<input name="bound" required type="number" min="0" step="1" value={gold.bound[characterKey]?.[id] ?? 0} class="mt-1 h-8 w-full rounded-xs border border-surface-600 bg-surface-800 px-2" /></label>
			</div>
			<div class="flex gap-2"><button type="submit" class={btn}>Apply book settings</button><button type="button" class={btn} disabled={!book} onclick={() => setHoningBook(kind, null)}>Turn off</button></div>
		</form>
	{/each}
</details>
