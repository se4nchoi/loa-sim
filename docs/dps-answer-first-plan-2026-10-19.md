# DPS tab: answer-first layout (plan, 10-19-26)

Status: planned, not started. The DPS tab (`/dps`, `DpsWorkspace.svelte`, branch `dps-sim/v0`) now has everything the
data supports (replay per clear, cooldown gems "up to", stat worth, skills table, upgrades side column, details dialog),
but it shows all of it at once. It reads as a data dump: the player has to work out the decision. This plan turns it
into an answer with the evidence one click away.

## Layout, top to bottom

1. **Raid line, not image cards**: "Serca · Nightmare · 14 clears · 1.03b average DPS · Change raid". The cards,
   gates, clears and Order filters move behind "Change raid".
2. **Top pick card** (accent border): "Your best next upgrade · Weapon honing +24 → +25 · +0.95% DPS · ≈ +9.7m ·
   about 8.0m gold", one line of why ("Same gain in all 14 clears. Most DPS per gold among priced upgrades."), a
   confidence chip and "Why this?" (opens the existing details dialog).
3. **Two alternatives**, side by side: "Also worth it" (biggest DPS gain that isn't the top pick) and "Cheapest step"
   (lowest cost with a meaningful gain). Each: name, gain, one line (range or cost).
4. **What we noticed**: at most three plain sentences, each ending in an action, e.g.
   - "Here, +1% Crit Rate is worth 1.3× +1% Crit Damage. Prefer crit rate lines."
   - "Gluttony sat ready 53% of the fight. Pressing it more would beat any gem for it."
   - "Stat values come from 2 of 14 clears. Turn off low performance mode for steadier numbers."
5. **Folded evidence**: "All upgrades (30)", "Your skills in these clears", "What each stat is worth". The current
   list, skills table and stat table, collapsed.

The "How this is evaluated" section stays, closed by default once seen.

## Rules

- **Top pick**: best DPS per gold among priced upgrades; when too few are priced (market import is off by default),
  the biggest DPS gain. Estimated upgrades only, never "up to" or "≥" figures.
- **Also worth it**: the biggest DPS gain other than the top pick. **Cheapest step**: lowest gold cost with a gain of
  at least ~0.1% DPS; hidden when nothing is priced.
- **Confidence chip**, from data the tab already has:
  - High: same gain in every clear and valued from stat values (honing, Weapon Power, Additional Damage lines).
  - Varies by clear: gems (skill share) and Crit Rate (per raid); show the range.
  - Rough: cooldown gems ("up to") and Outgoing Damage floors ("≥").
- **Insights**: pick up to three, in this order of value: crit rate vs crit damage when the ratio is ≥ 1.15 or
  ≤ 0.87; a gemmed skill that sat ready ≥ 40% of the fight; stat values in fewer than half the clears; gear CP 2%+
  away from the logged clears. Skip the rest.

## Open question

Should the KR-preview bracer be allowed to win the top pick? It's free and +1.2% DPS for Soulshan, so it would take the
card for an NA player who can't get it yet. Options: keep it out of the cards but in the full list, or let it win.

## Where things stand (10-19)

- `dps-sim/v0` holds all DPS tab work, the market-price merge (import off unless `PUBLIC_MARKET_PRICES=1`), the site
  audit fixes and the pre-publish steps (Beta labels, release note, phone message).
- `main` has the engraving audit (PR #10, 35972e6) that `dps-sim/v0` doesn't have yet: merge `main` into it before its
  own PR.
- Mockup of this layout was shown in the 10-19 session; numbers above are Soulshan's Serca clears.
- On the shared lab PC memory is short: run tests with `npx vitest run --no-file-parallelism`, and stop the dev server
  if `svelte-check` runs out of memory.
