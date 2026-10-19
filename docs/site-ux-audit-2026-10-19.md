# Site UX audit and DPS logic check (10-19-26)

Status: 1, 3, 12 and 14 done (10-19); 2 decided against; the rest open. Walked Characters, Simulator (with Next Upgrades and the budget), and the DPS tab on branch
`dps-sim/v0` (after the market-price merge), at desktop and phone width, with Soulshan refreshed from bible
(1784.17, CP 6797.64) and 87 real clears imported from the 10-18 `encounters.db` copy. Then checked the DPS model
against those clears. Items are ordered by harm within each section. Suggested first batch: 1, 2, 3, 14, 12.

## Bugs

1. **Ark Grid "+1 Lv" and "+1P" previews read +0.00% on a full grid.** Every option row ("Atk. Power Lv. 43 · +1 Lv
   ≈ +0.00%") and every core "+1P" shows zero for Soulshan. Likely cause: `probe` in `sim/SimArkGrid.svelte` adds a
   pretend fifth astrogem to the first core; when the core's Willpower is already used (17/17, 15/15), that astrogem
   doesn't fit and isn't counted. So the preview is blank for exactly the players who have finished their grid.
   Score the extra level on an existing astrogem instead.
2. **(Decided against: players know the bracer isn't in global yet, and it stays ranked.)** **The KR-preview bracer tops both rankings.** "Bracer · Equip Epic +0" is #1 by CP (+1.49%) and #1 by gold
   ("Free" in Simulator, "0 gold" and "0 / 1% DPS" on the DPS tab). The free first bracer is a KR rule; NA/EU players
   can't act on it. Leave KR-preview upgrades out of the rankings unless a "Show KR preview" toggle is on. The
   Simulator's Next Upgrades also doesn't show the "KR preview" tag the DPS tab shows.
   Done for 1: the probe astrogem now costs no Willpower. Done for 3: `formatDateTime` (10-19-26 11:41) on the
   snapshot line, the share page and the material-price times.
3. **The snapshot time follows the browser's language.** Simulator header: "Snapshot loaded 2026. 10. 19. 오전
   11:41:37" on a Korean-language browser, while the site writes dates as 10-18-26 everywhere else. Use `formatDate`
   plus a 24-hour time.
4. **Missing space on the Characters list:** "6797.64· loaded just now".

## Across the site

5. **CP is red everywhere.** The Characters list, the Simulator's Simulated CP and the DPS header all show a
   damage dealer's CP in red, next to deltas where red means a loss ("6797.64 +0.00%"). Keep totals neutral and colour
   only the change (green up, red down); show dealer/support with a small label instead.
6. **The DPS tab's name varies.** Tab: "DPS". Simulator link: "Analyze in DPS Sim →". `SimulatorPage` with
   `dpsMode`: "DPS Sim Experimental". The home page is titled "Combat Power Simulator" and doesn't mention DPS at all.
   Pick "DPS" and add one line about it on the home page.
7. **Unlabelled numbers.** The big "1784.17" under the character name (item level? CP?), the quality bars (98,
   100) beside each gear piece, and the budget's "Current inventory" row of seven bare zeros. Add the word or a
   tooltip to each.
8. **"/ 1%" doesn't say of what.** Simulator: "4.44m / 1%" means per 1% CP; DPS tab: per 1% DPS. Write "/ 1% CP"
   and "/ 1% DPS".
9. **Budget footnotes seem to contradict each other.** "Bound materials are used first" and "Saved bound material
   inventory is not deducted" sit together. Say what happens in one sentence, e.g. "Uses your bound materials first;
   the saved inventory itself isn't changed."
10. **Two stacked dropdowns in the Simulator header** ("Snapshot on 10-18 6797.64" and "Current simulation") don't
    say how they differ. Label them "Starting gear" and "Plan".
11. **Small touch target:** the DPS tab's "Simulator" link is 28 px tall on a phone; the touch-size rule there covers
    buttons, selects and inputs but not links.

## DPS tab

12. **Say how much of the sample has stat values.** Only 9 of the 87 clears have the meter's stat values (the rest
    were recorded in LOA Logs' low performance mode); for Serca it's 2 of 14. Crit Rate and the gear's buckets rest on
    those few. Show "Stat values in 2 of 14 clears", and a one-line tip to turn off low performance mode.
    Done: under the raid scope.
13. **Warn when the gear behind the numbers differs from the plan.** The buckets come from clears where the meter
    recorded CP 6523, while the plan being scored is 6797.64 (4% higher). The page doesn't mention it.
14. **Necklaces get no estimate.** The Simulator's #3 upgrade (Necklace High-High-High, +1.07% CP) is "DPS not
    estimated" because Outgoing Damage isn't in the model (`COVERED` in `dps-stats.ts`); any line outside it drops the
    whole upgrade. Value the known lines and show the rest as a note ("≥ +0.4%, Outgoing Damage not valued") instead of
    nothing.
   Done: `statDeltasAtLeast` values the covered lines when Outgoing Damage is only added or raised, shown as "≥" with
   a note and without the DPS/CP rank badge (a floor can't be ranked fairly). Losing Outgoing Damage still gets no
   figure. For Soulshan's necklace that floor is only ≥ +0.16%, since most of its gain is the Outgoing Damage step.

The DPS tab otherwise fits a 375 px screen with no sideways scrolling, and the 10-18 review items are all in.

## Logic check: crit rate or crit damage?

How the model values them (`dps-model.ts`): crit damage at one value per build, from the meter's recent values;
crit rate at each clear's own recorded value, because it swings by fight. Checked against the 9 clears with values:

| Stat (DPS % per +1) | Lowest | Median | Highest |
|---|---:|---:|---:|
| Crit Damage | 0.347 | 0.354 | 0.363 |
| Crit Rate | 0.091 | 0.203 | 0.546 |
| Additional Damage | 0.668 | 0.668 | 0.669 |
| Evolution Damage | 0.445 | 0.457 | 0.466 |

Both choices hold up: crit damage really is steady, and crit rate really isn't. Additional damage reads back as a
49.7% bucket total, in line with the 48.8% noted earlier.

So "does this character benefit more from crit rate or crit damage?" has **a different answer per raid** (one
clear each, so treat as indicative):

| Fight | +1% Crit Rate | vs +1% Crit Damage |
|---|---:|---:|
| Witch of Agony (Serca NM) | 0.55 | 1.55× |
| Arcenos (Level 3) | 0.52 | 1.47× |
| Corvus Tul Rak (Serca NM) | 0.41 | 1.15× |
| Death Incarnate Kazeros (Hard) | 0.20 | 0.57× |
| Abyss Lord Kazeros (Hard) | 0.15 | 0.42× |
| Deskaluda | 0.15 | 0.41× |
| Igrexion | 0.12 | 0.34× |

Blunt Thorn was active in all 87 clears. Crit over 80% turns into evolution damage until that bonus is maxed (60
points at level 2), so crit rate is worth a lot when a fight's crit buffs put Soulshan between the cap and the
maximum, and little once past it. That fits the spread above but isn't proven by it.

What the site does with this today: **nothing shows it.** The model can already compute what +1 of each stat is worth
(`modelMarginals`), but it's only used in tests. Upgrades that include Crit Rate do use the per-raid value, so rings
reorder by raid, but the player never sees the comparison itself.

Proposed: a **"What your stats are worth"** card on the DPS tab for the selected raids: +1% Crit Rate, +1% Crit
Damage, +1% Additional Damage, +1% Atk. Power, +1,000 main stat, +1,000 Weapon Power, each as DPS % with the clear
count, and one plain sentence ("Here, +1% Crit Rate is worth 1.5× +1% Crit Damage"). Show Crit Rate as "not
measured" for raids with no valued clear.

Limits to state with it:
- The values are for small changes. Crit rate has cliffs (the 80% cap and the conversion maximum), so a big crit
  swing, like re-rolling a bracelet's Crit stat, can't be read straight off the per-1% value.
- Crit Rate and Crit Damage changed together are multiplied as independent parts; the cross term is left out. That's
  negligible for accessory-sized changes.
- One clear per raid is thin; the card should show the count, and get better as more clears are logged with stat
  values.
