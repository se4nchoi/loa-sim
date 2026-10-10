<script lang="ts">
 import { btnAccent } from './ui';
 let { value = $bindable(), label, changed = false, compact = false, pill = false, small = false, hideMax = false }: { value: number; label: string; changed?: boolean; compact?: boolean; pill?: boolean; small?: boolean; hideMax?: boolean } = $props();
 const clamp = (v: number) => Math.min(100, Math.max(0, Math.round(v)));
 let draft = $state(value);
 const commit = (next: number) => { draft = clamp(next); value = draft; };
 $effect(() => { draft = value; });
 // LOPEC QualityBar palette; keep the requested red 1–30 range and thresholds.
 const tone = $derived(draft === 0 ? '#888888'
  : draft <= 30 ? '#EF4444'
  : draft <= 69 ? '#14B8A6'
  : draft <= 89 ? '#2563EB'
  : draft <= 99 ? '#8B5CF6'
  : '#D2A50A');
</script>
{#snippet controls()}
<div class="flex min-w-0 items-center {compact ? 'flex-col gap-0' : 'gap-2'}" role="group" aria-label={label}>
 <input type="range" min="0" max="100" step="1" value={draft} oninput={(e) => commit(Number(e.currentTarget.value))} onchange={(e) => commit(Number(e.currentTarget.value))} aria-label={`${label} slider`} style:--quality-color={tone} style:--quality-fill={`${draft}%`} class="quality-slider min-w-0 cursor-pointer {compact ? 'w-full' : 'flex-1'}" />
 <div class="flex items-center {compact || small ? 'gap-1' : 'gap-2'}">
 <input type="number" min="0" max="100" step="1" value={draft} oninput={(e) => commit(Number(e.currentTarget.value) || 0)} aria-label={label} title={`Type ${label} (0–100)`} style:color={small ? '#ffffff' : tone} style:background-color={small ? tone : undefined} class="shrink-0 cursor-text text-center font-semibold tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none {small ? 'h-7 w-11 min-w-11 max-w-11 rounded-md border border-white/40 text-sm inset-shadow-sm hover:border-white/80 focus:border-white focus:outline-none focus:ring-1 focus:ring-white/70' : compact ? 'h-5 w-8 rounded-xs bg-transparent text-xs' : 'h-7 w-11 rounded-xs border bg-surface-950 px-1 text-sm'} {!small ? changed ? 'border-accent-500' : 'border-surface-700' : ''}" />
 <span class="flex w-2 shrink-0 items-center justify-center">{#if changed}<span class="size-1.5 rounded-full bg-accent-300" role="img" aria-label={`${label} changed`} title="Changed from current loadout"></span>{/if}</span>
 {#if !hideMax}
 <button type="button" class={compact ? 'inline-flex h-5 items-center justify-center rounded-xs border border-accent-700 bg-accent-700/30 px-1 text-[10px] font-semibold text-accent-100 hover:bg-accent-700/50' : `${btnAccent} px-2`} aria-label={`Max ${label}`} disabled={draft === 100} onclick={() => commit(100)}>Max</button>
 {/if}
 </div>
</div>
{/snippet}
{#if pill}
 <details class="relative">
  <summary aria-label={`Edit ${label}`} title={`Edit ${label}`} style:background-color={tone} class="quality-pill cursor-pointer list-none rounded-full px-1.5 text-[11px] leading-4 font-bold text-white tabular-nums {changed ? 'ring-1 ring-accent-300 ring-offset-1 ring-offset-surface-900' : ''}">{draft}</summary>
  <div class="absolute top-6 left-0 z-30 w-56 rounded-sm border border-surface-600 bg-surface-900 p-3 shadow-xl">
   <div class="mb-2 text-xs text-surface-300">{label}</div>
   {@render controls()}
  </div>
 </details>
{:else}
 {@render controls()}
{/if}
<style>
 .quality-pill::-webkit-details-marker { display: none; }
 .quality-slider { appearance: none; height: 14px; background: transparent; }
 .quality-slider::-webkit-slider-runnable-track { height: 3px; border-radius: 2px; background: linear-gradient(to right, var(--quality-color) var(--quality-fill), #444 var(--quality-fill)); }
 .quality-slider::-webkit-slider-thumb { appearance: none; width: 10px; height: 10px; margin-top: -3.5px; border-radius: 50%; background: var(--quality-color); }
 .quality-slider::-moz-range-track { height: 3px; border-radius: 2px; background: #444; }
 .quality-slider::-moz-range-progress { height: 3px; background: var(--quality-color); }
 .quality-slider::-moz-range-thumb { width: 10px; height: 10px; border: 0; border-radius: 50%; background: var(--quality-color); }
</style>
