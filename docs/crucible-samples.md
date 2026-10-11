# Crucible samples (Season 4, Chromanium's Powerful Afterimage)

Paradise state per character, read from in-game screenshots, joined with the character's Crucible runs in
LOA Logs' encounters.db. Crucible runs only save reliably with LOA Logs' manual-save hotkey (the exit transit
soft-resets the fight without saving). The boss name depends on the Crucible level (table below).

Gear slots: Censer, Whistle, Mask, Glass, Bell, Mirror. Resonance grade per slot in parentheses.

| Character | Class | iLvl | Paradise power | Censer | Whistle | Mask | Glass | Bell | Mirror | Resonance | Stones | Expected rank | Runs (encounter id: duration, DPS) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Ignishan | Guardianknight | 1750 | 21,587,545 | 17 (B) | 16 (S) | 16 (C) | 16 (B) | 14 (S) | 12 (B) | Diamond III | 10/35 | Top 8% | 5898: 18.35s, 60.45m · 5899: 18.23s, 60.45m |
| Brushann | Artist | 1750 | 19,858,881 | 15 (A) | 18 (SS) | 15 (B) | 12 (B) | 12 (B) | 12 (A) | Diamond III | — | Top 14% | 5746 (Sep 30, tier IV): 29.3s · 5900 (Oct 11, tier V): 22.7s |
| Kamehameshaan | Soulfist | 1740 | 20,846,465 | 18 (B) | 15 (C) | 15 (C) | 15 (C) | 12 (C) | 12 (B) | Diamond III | 25/35 | Top 15% | 5896: 16.73s, 68.01m · 5897: 17.46s, 64.01m |

## Crucible levels (Season 4)

| Lv | Boss | Lv | Boss |
|---|---|---|---|
| 1 | Black Mountain Demon | 9 | Calventus's Shadow |
| 2 | Saldone's Shadow | 10 | Lumerus's Shadow |
| 3 | Maneth's Shadow | 11 | Ur'nil's Powerful Afterimage |
| 4 | Scientist Mari's Shadow | 12? | Chromanium's Powerful Afterimage |
| 5 | Archbishop Wilhelm's Shadow | 13? | Nacrasena's Powerful Afterimage |
| 6 | Ur'nil's Shadow | 14? | Calventus's Powerful Afterimage |
| 7 | Chromanium's Shadow | 15? | Lumerus Eternal Afterimage |
| 8 | Nacrasena's Shadow | | |

12–15 are guessed from Season 3 unlock order (one week apart), unconfirmed. Exclude `Abyssal Afterimage`
(Kazeros raid boss) from any "Afterimage" match.

## Paradise proc skills in the logs

Skill id `70 T SS`: T = tier (name numeral = T+1, e.g. 7044x = "V"), SS = skill.
- Season 4 set: 41 Fox Fire, 42 Extermination, 43 Thunder Charge, 44 Starlight Barrage, 45 Bladesong,
  46 Sunlight Fragrance. Season 3 set: 31 Shadowcleaver, 32 Broadwave, 33 Greenward, 34 Sandroll,
  35 Thunderforge, 36 Frostcarver. Earlier ids 01–26 are single procs from older seasons.
- All procs in one run share one tier, independent of per-slot gear level (Ignishan and Kamehameshaan are V
  with slots 12–18). Hypothesis: tier = Resonance rank. Supported: all three known Diamond III characters log V; Brushann went IV (Sep 30) → V (Oct 11).
- Slot → proc (confirmed from tooltips): Censer 41, Whistle 42, Mask 43, Glass 44, Bell 45, Mirror 46.
- Tooltip confirms tier source: Brushann's Censer shows "Resonance Rank: Diamond III A" → `[Fox Fire V]`
  (rank → tier, letter = that slot's radar grade).

## Item tooltips

Brushann, Censer: +15, Ancient, quality 100. Basic effect: Intelligence +1,603,125, Fox Fire Damage +10%,
Atk. Speed +40%. Fox Fire V: max 11,664,000 magic damage, cooldown 6.4s. Restoration effects by level:
1 Specialty meter recovery (S), 2 Vitality +600, 3 Specialty recovery on kill (M), 4 Phy/Mag Def. Pierce +8%,
5 Vitality +600, 6 crit chance to ignore some Defense, 7 Def. Pierce +8%, 8 Vitality +800, 9 ignores part of
Boss Defense, 10 Def. Pierce +12%, 11 Vigor +400, 12 crit chance to ignore Defense, 13 Def. Pierce +12%,
14 Vigor +600, 15 ignores foe's Defense.

Brushann, all six (all Ancient, Diamond III; logged per-cast damage from run 5900 ÷ tooltip max):

| Slot | Lv | Quality | Intelligence | Res | Proc (id) | Tooltip max | Per cast ÷ max |
|---|---|---|---|---|---|---|---|
| Censer | 15 | 100 | 1,603,125 | A | Fox Fire (41) | 11,664,000 | 4.03 |
| Whistle | 18 | 53 | 1,246,875 | SS | Extermination (42) | 22,968,000 | 4.40 |
| Mask | 15 | 88 | 1,732,500 | B | Thunder Charge (43) | 12,729,600 | 3.61 |
| Glass | 12 | 97 | 1,742,344 | B | Starlight Barrage (44) | 11,232,000 | 2.49 |
| Bell | 12 | 87 | 1,565,625 | B | Bladesong (45) | 15,724,800 phys | 3.75 |
| Mirror | 12 | 73 | 1,290,938 | A | Sunlight Fragrance (46) | 16,329,600 | 3.98 |

Ignishan, all six (all Ancient, Diamond III, Strength):

| Slot | Lv | Quality | Strength | Res | Tooltip max |
|---|---|---|---|---|---|
| Censer | 17 | 55 | 1,328,907 | B | 11,232,000 |
| Whistle | 16 | 6 | 886,875 | S | 22,176,000 |
| Mask | 16 | 84 | 1,383,750 | C | 12,240,000 |
| Glass | 16 | 88 | 1,575,000 | B | 11,232,000 |
| Bell | 14 | 99 | 1,594,219 | S | 16,934,400 |
| Mirror | 12 | 72 | 1,425,000 | B | 15,724,800 |

Brushann's Censer is "Splendid" and has an extra line (Fox Fire Damage +10%); Ignishan's plain Censer doesn't.

### Formulas (exact on all 12 items)

- **Main stat = base × (80 + quality) / 160.** Linear in quality (0.5× at Q0 → 1.125× at Q100, 0.625%/pt).
  Independent of gear level.
- **Base = 1,500,000 × {0.90, 0.95, 1.00, 1.05, 1.10}**, unrelated to level, slot or Resonance letter (random
  roll). Ignishan: Censer 1.05, Whistle 1.10, Mask 0.90, Glass 1.00, Bell 0.95, Mirror 1.00. Brushann: Censer
  0.95, Whistle 1.00, Mask 1.10, Glass 1.05, Bell 1.00, Mirror 0.90.
- **Proc tooltip max = proc base × letter factor**, letter factor C 1.25, B 1.30, A 1.35, S 1.40, SS 1.45 (all
  five cross-character pairs exact). Independent of level and quality. Proc base (B = 1.30 → ÷1.3): Fox Fire
  8,640,000, Starlight Barrage 8,640,000, Thunder Charge 9,792,000, Bladesong 12,096,000, Sunlight Fragrance
  12,096,000, Extermination 15,840,000. (Diamond III, tier V; other ranks unmeasured.)

### Shanladin (Paladin, Silver II, power 1,514,545, Top 46%)

| Slot | Grade | Lv | Quality | Strength | Res | Base (roll) | Proc |
|---|---|---|---|---|---|---|---|
| Censer | Legendary | 8 | 88 | 192,937 | C | 175,000 × 1.05 | inactive (needs Lv 9) |
| Whistle | Relic | 8 | 26 | 364,375 | B | 500,000 × 1.10 | inactive |
| Mask | Legendary | 8 | 41 | 119,110 | C | 175,000 × 0.90 | inactive |
| Glass | Legendary | 9 | 80 | 175,000 | C | 175,000 × 1.00 | Starlight Barrage II, max 1,260,000 |
| Bell | Legendary | 9 | 62 | 147,547 | C | 175,000 × 0.95 | Bladesong II, max 1,764,000 |
| Mirror | Legendary | 8 | 95 | 191,407 | C | 175,000 × 1.00 | inactive |

- Grade bases: Legendary 175,000, Relic 500,000, Ancient 1,500,000; same ±10% roll set and quality factor.
- Proc tier = Resonance rank confirmed (Silver II → tier II; ranks Bronze I … Diamond V). Procs only activate at
  Restore Lv 9 (tooltip), matching run 5831 logging only 44 and 45.
- Tier II proc max at C = 7/60 of the tier V base (Starlight 1,008,000 vs 8,640,000; Bladesong 1,411,200 vs
  12,096,000). Tier vs grade (Legendary) not yet separated.

### Paradise power (open)

Shanladin: Σ Str 1,190,376, Σ levels 50 → 1,514,545.

Swap tests (Shanladin, one item at a time):
- Censer: Legendary +8 Q88 Str 192,937 → Epic +8 Q66 Str 57,488 (base 60,000 × 1.05). ΔStr −135,449, power
  1,514,545 → 1,400,703 (Δ −113,842): 0.8405 power per main stat. Linear would leave ~514k from other sources.
- Grade bases so far: Epic 60,000, Legendary 175,000, Relic 500,000, Ancient 1,500,000.

Ignishan: Σ Str 8,193,751, Σ levels 91 → 21,587,545. Brushann: Σ Int 9,181,407, Σ levels 84 → 19,858,881.
Less main stat but more power, so it is not main stat alone; levels (restoration Weapon Power, Crit, Additional
Damage, …) must count. Needs more characters to fit.

- Procs were 36–52% of damage in the Season 4 Chromanium runs above.

Notes
- Stored DPS = damage / whole seconds (1,088,162,157 / 18 = 60,453,453), and damage is the boss's fixed HP, so
  clear time is the real metric.

Swap tests, continued (Shanladin):
- Censer Epic +8 Q66 (57,488) → Epic +8 Q75 (61,032, base 60,000 × 1.05): ΔStr +3,544, power 1,400,703 →
  1,404,008 (Δ +3,305): 0.933 per stat.
- From start (1,514,545): Bell Legendary +9 Q62 (147,547) → Relic +9 Q0 (237,500, base 500,000 × 0.95): ΔStr
  +89,953, power → 1,571,833 (Δ +57,288): 0.637 per stat. Same proc max (Bladesong II C 1,764,000) on both, so
  proc damage doesn't depend on grade.
- Marginal power per stat falls as stat rises (0.93 → 0.84 → 0.64). No function of total main stat fits all four
  readings (best power-law/offset fits miss by 1.5–5k); a per-item concave score (≈ c·x^0.48 summed) gets within
  ~900 but isn't exact. Grade or quality may add their own terms. Power is reversible (back to 1,514,545).

Swap tests, round 3 (Shanladin, baseline = Relic Bell Q0 equipped, power 1,571,833):
- Whistle Relic Q26 → Legendary Q55 (162,422 = 175,000 × 1.10 × 135/160): 1,476,940. → Legendary Q88 (202,125): 1,501,178.
- Bell Relic Q0 → Epic Q12 (32,775 = 60,000 × 0.95 × 92/160): 1,399,969. → Epic Q95: 1,430,449.
- Censer Legendary Q88 → Epic Q20 / Q66 / Q75: 1,441,099 / 1,457,991 / 1,461,296.
- Secondary stats also scale with grade (Whistle Combat HP Recovery: Legendary +8,000, Relic +10,000).

### Paradise power formula (fits all 11 Shanladin readings to ±1)

**Power = K + Σ over the six items of score(grade, quality).** Main stat, base roll and slot don't enter: two Epic
Censers and an Epic Bell with different rolls all give exactly 367.22 per quality point, and the Censer swap
deltas are identical with either Bell equipped (slots are additive).

| Grade | score (relative to Epic Q0) | per quality point | Q0 | Q100 |
|---|---|---|---|---|
| Epic | 367.22·q | 367.22 | 0 | 36,722 |
| Legendary | 73,448 + 734.44·q | 734.44 (= 2× Epic) | 73,448 | 146,892 |
| Relic | 176,271 + 1,248.63·q | 1,248.63 (≈ 3.4× Epic) | 176,271 | 301,134 |
| Ancient | ? | ? | | |

- Any higher grade beats any quality of the grade below (Legendary Q0 > Epic Q100; Relic Q0 > Legendary Q100).
- K = 669,766 for Shanladin (levels 8/8/8/9/9/8, Silver II). K holds everything a swap can't change: slot levels
  (level is per slot, shared by every item in it), Resonance, and anything from the character. Unknown split.
- Fitted from: Censer E66/E75 (k_E), Censer L88→E66 (c_L), Bell R0→E12 (c_R), Whistle R26→L55 (k_R); k_L = 2·k_E
  assumed. Predicted without fitting: Whistle L88, Bell E95, Censer E20, Censer E66/E75 on the Relic-Bell
  baseline, Legendary-Bell start. Relic slope rests on one swap.
- Ancient score and the level/Resonance part of K still need measuring (Ignishan/Brushann: Ancient only).
