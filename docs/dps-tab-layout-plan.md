# DPS tab — desktop layout and next steps (plan, 10-14-26)

Status: step 1 (the layout) built 10-14-26: three columns from 1280px (why panel sticky), raids beside the list from 1024px with why under it, stacked on phones. Category tabs over the list keep each row's overall DPS rank. Steps 2–4 not started.

## Layout: desktop first, three columns like the Simulator

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ Shanzkii  Breaker · gear: raid snapshot 10-13 ▾ [Edit]   CP 4,332 → 4,371 (+0.9%)    │
│                                                          DPS in Serca  +1.6%         │
├───────────────────┬──────────────────────────────────────────┬───────────────────────┤
│ 1 · RAID          │ 2 · BEST DPS UPGRADES FOR SERCA  [Hard]  │ 3 · WHY (selected)    │
│ ┌───────────────┐ │ From 4 clears, all gates · 10-04 – 10-12 │ (sticky)              │
│ │▓ Serca  Hard ✓│ │ [All] [Gear] [Accessories] [Gems] [Engr] │ Raid Captain →        │
│ │  4 clears     │ │ ─────────────────────────────────────────│   Super Charge        │
│ └───────────────┘ │ #  Upgrade                    DPS    CP  │                       │
│ ┌───────────────┐ │ 1  Raid Captain → Super Ch.  +2.1% −1.2% │ Charge skills deal    │
│ │  Cathedral L3 │ │ 2  Bracer · Epic             +1.38 +1.74 │ 61% of your damage... │
│ └───────────────┘ │ 3  Earring 1 · high lines    +0.96 +1.16 │                       │
│ ┌───────────────┐ │ 4  Weapon +16 → +17          +0.90 +1.14 │ Super Charge   +x%    │
│ │  Armoche Hard │ │ 5  Eye of the Storm gem 9    +0.74 +0.79 │ Lose RC        −y%    │
│ └───────────────┘ │    Show all 16                           │                       │
│ Guardian raids ▾  │                                          │ ▸ In other raids      │
│                   │                                          │ ▸ Run by run · how    │
│ YOUR DATA         │                                          │   it's calculated     │
│ ● Gear check: ok  │                                          │                       │
│ ● 1/4 clears with │                                          │                       │
│   stat values     │                                          │                       │
│ Gates: All G1 G2  │                                          │                       │
│ Clear: All ▾      │                                          │                       │
└───────────────────┴──────────────────────────────────────────┴───────────────────────┘
          (example numbers; the Raid Captain row is the planned engraving-swap feature)
```

- Left (~16rem): raid cards stacked vertically, newest first; Guardian raids / solo in a dropdown below. Then "Your data": gear check, how many clears have the meter's stat values, gate chips, single-clear picker, re-import.
- Middle (flexible): the ranked list for the chosen raid, under a banner naming the raid and difficulty. Tabs by category instead of one long list. Later a "gold per 1% DPS" column.
- Right (~22rem, sticky): explanation of the selected row; "In other raids" and "Run by run / how it's calculated" stay folded.
- Top bar: CP before → after (Simulator plan) and DPS before → after in the chosen raid.
- Phones: the same three blocks stack in order (raid, list, why); raid cards become a horizontal strip as they are now.

## Decisions so far

- Data comes only from the player's own `encounters.db`, imported into this browser (no external log storage).
- Gear buckets (attack, additional, evolution, crit damage) come from the build's newest clears with the meter's stat values and apply to every raid; crit rate is per raid. Measuring crit from hits was rejected (2–10× off the meter). See `dps-workspace-flow.md`.
- Simulate the gear the player actually raids in. The gear check compares each clear's recorded engravings with the loaded gear and offers the matching bible loadout / kept snapshot. Bracelets aren't in logs, so bracelet swaps can't be detected.
- Engravings are not assumed optimal. An engraving swap is offered as an upgrade row ("Raid Captain → Super Charge: +X% DPS, −Y% CP, 0 gold") so the trade-off between gatekeeping CP and raid DPS is visible.

## Open question: raid images

Cards currently load lostark.bible's raid headers (`https://lostark.bible/i/headers/<raid>.jpg`, verified for kazeros, serca, cathedral, armoche, mordum, aegir, behemoth, echidna, thaemine, valtan, vykas, hanumatan) and fall back to a color. Copying them into `static/` needs permission: ask bible's developer, or use official Smilegate / Amazon raid art with the existing © notice.

## Next steps, in order

1. Build the three-column desktop layout (UI only, no new math).
2. Engraving swaps:
   - Decode the meter's `raidCaptainEfficiency` (present in every run, e.g. Shanzkii Serca G2 11.1B → 13.7B without Raid Captain equipped; Soulshan's runs have Raid Captain equipped to compare). Also `standingStrikerEfficiency`, `supersonicBreakthroughEfficiency`, `bluntThornEfficiency`.
   - Super Charge: charge-skill share of damage per raid (needs which skills are charge skills, possibly from the meter's `Skill.json`) × the engraving's numbers.
   - Anything that can't be verified against logs stays out of the list.
3. Gold: the same cost basis as Next Upgrades → "gold per 1% DPS".
4. Later: Next Upgrades in the Simulator switches to this model; cooldown gems stop counting extra casts as free.
