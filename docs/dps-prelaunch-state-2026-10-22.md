# DPS pre-launch state — 2026-10-22

Working branch: `dps-sim/v0`. The existing DPS work remains experimental; these changes have not been deployed.

## API permissions and integration

- zyr explicitly approved calling LOA Buddy's API through our server. The agreed shape remains a fixed catalog of
  honing materials and relic engraving books, with a 10-minute cache. The import panel credits and links to
  [loa-buddy](https://loa-buddy.pages.dev/market), even before an import. Imports are enabled by default;
  `PUBLIC_MARKET_PRICES=0` disables both the button and proxy. Endpoint/schema stability is not guaranteed.
- Mathi supplied `https://loadout.mathi.moe/v3/loadouts/by-hash/<digest>` for raid-clear loadouts and confirmed
  caching on his server and Cloudflare. `/api/snapshot/<version>/<digest>` now uses it instead of the bible page's
  `__data.json`. The adapter translates numeric slots, stats, gem effects, engravings, karma, passives and Ark Grid.
  Failed or unsupported responses are not stored as successful snapshots. Hash caches and request coalescing remain.

## Verified

- After integrating the newer remote work, 660 tests across 74 files pass. Svelte/TypeScript: no errors or warnings. Production build passes (existing large
  chunk warning remains).
- Production-preview `/api/market`: HTTP 200 and 60 normalized quotes each for NA East and EU Central. Unsupported
  region: HTTP 400. Both successful responses have the expected 10-minute CDN cache policy.
- Production-preview `/api/snapshot`: HTTP 200, 13 items, 6 cores, CP 6620.18 for Mathi's supplied hash
  `v3/36a26708fae48f6b0a05ce80d57fe5e0fb530383a3c8377f5382995a23feeac4`.
- The adapter's fixture matches all fields consumed by the simulator against that same clear's independently
  decoded bible snapshot. Integration tests carry its actual order cores, honing, gem skills and stone levels
  into simulator state. This verifies the adapter; it does not prove a full historical CP reconstruction.

## DPS behavior already present

- CP/DPS switch on `/sim`; one selected attempt at a time (clears or failed pulls); historical setup lookup;
  recorded/simulated skill meter. The newer remote work also adds configured combat totals, an independent relative
  stat engine, and personal checkpoint windows; see `dps-failed-pull-feasibility-2026-10-21.md`.
- Next Upgrades ranks by the same meter, with Most DPS and Per gold. `/dps` redirects to `/sim?mode=dps`.
- Stat changes, damage gems, cooldown-gem estimates using recorded cooldown availability, and supported Order core
  effects are modeled. Souleater is the only class with explicit skill-group mappings.
- Belgardin Vambraces use the global name, and limit breaks use untradeable drops with no gold charge.

## Next development and testing

1. Derive damage buckets automatically from gear. The independent engine now accepts explicitly configured combat
   totals; these still need automatic reconstruction and validation against measured meter values.
2. Explain crit provenance and validate configured caps and conversion across classes, builds and checkpoint windows.
3. Check additional classes/builds on real clears, add verified-class indicators and patch-date warnings.
4. Keep partial model coverage visible: engravings, karma, Paradise, chaos cores and astrogem option edits remain
   unvalued; cooldown changes estimate throughput rather than replaying a new legal rotation.
5. Exercise browser flows with fresh imports and old saved data, clear/snapshot switching, upgrade Apply and Undo,
   price import/manual edits/undo, and upstream failure. HTTP/unit checks do not cover the full browser workflow.
