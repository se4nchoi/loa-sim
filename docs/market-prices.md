# Market prices

The material-price dialog imports T4 honing materials, regular Hellfire books and relic engraving recipes from
[loa-buddy](https://loa-buddy.pages.dev/market). This is an unofficial community price feed,
not a live AGS market API. Requests go through `/api/market?region=nae|euc` to avoid browser CORS restrictions.

zyr approved this server-proxied use (permission shared on 2026-10-22). The import is on by default;
set `PUBLIC_MARKET_PRICES=0` to switch it off. With it off, the dialog hides the Load button and
`/api/market` answers 404. Typed prices work either way. The import panel credits and links to loa-buddy
before and after loading. The upstream endpoint and schema have no stability guarantee; failed or malformed
responses leave saved prices unchanged.

- NA characters use NA East; CE characters use EU Central. The upstream feed supports these two regions.
- Loading prices replaces returned items only. Missing items, enhanced books and bound inventory stay unchanged.
- Prices remain editable. Undo import restores previous prices while keeping manual edits made afterward.
- NA/EU material prices are stored separately. Legacy shared manual prices seed both regions once.
- Stones are returned per 100. Shard pouches contain 1,000/2,000/3,000 shards, verified against
  Maxroll's game item descriptions for 66130141/66130142/66130143. The cheapest per-shard pouch among
  the newest observations is used; calculation values retain full precision.
- Each quote retains its upstream observation timestamp, shown with its age in hours (amber after 24 hours).
- Imported fields flash purple for two seconds; reduced-motion users see a steady border instead.
- The browser reuses successful imports for 10 minutes, including after closing the dialog. Failed requests
  have a 30-second retry delay per region; the button shows the remaining seconds.
- The server requests a fixed allowlist, validates rows and ignores zero/negative/unavailable prices.
  It caches and coalesces requests for 10 minutes per region, with a 10-minute Vercel CDN cache.
  Upstream errors leave the browser's prices unchanged; no credentials are required.

Source endpoint: `https://marketdata-api.yrzhao1068589.workers.dev/v1/prices/latest`
(`POST {region_slug, item_slugs}`). Source catalog and bundle sizes were checked against
loa-buddy's published application on 2026-10-17.

Relic engraving recipes are imported as gold per book and used by Next Upgrades and Budget for
the remaining books in a step. Book prices are kept separately for NA East and EU Central, including
manual edits, clear/restore and import undo. Existing shared manual book prices seed both regions once.
Missing book quotes keep existing values. Crafting materials and auction-house listings
(gems, skins, accessories) are not imported.
