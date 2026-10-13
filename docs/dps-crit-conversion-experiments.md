# Crit conversion and reconstruction experiments

Calculation-only follow-up, 2026-10-13. UI polish is deferred.

## Verified mechanics and implementation

Read the installed meter's numeric `Ability.json` table at runtime and inspected its interpretation of the
`blocky_thorn` feature. Soulshan's saved `ark_passive_data` for encounter 5886 records Blunt Thorn level 2.
The numeric parameters are:

| Level | Direct crit cap | Overcap → evolution ratio | Maximum converted evolution bonus |
|---|---:|---:|---:|
| 1 | 80% | 1.25× | 45 percentage points |
| 2 | 80% | 1.5× | 60 percentage points |

The implementation accepts caller-supplied numeric values rather than distributing the ability table or a
default rule catalog. No meter source implementation is copied.

Converted evolution bonus = min(maximum bonus, max(uncapped crit rate − threshold, 0) × ratio).
That bonus **adds inside the existing evolution-damage bucket**; it is not a separate multiplicative bucket.
The replay context's `evolutionDamage` excludes the conversion bonus to avoid double counting it.

Replay now evaluates direct crit chance and the conversion independently. At level 2, increasing crit from
110% to 111% leaves direct crit chance at 80%, but adds 1.5 percentage points of evolution damage. At 120%
crit the conversion is saturated; further crit has no direct/conversion gain in this model. Removing crit
can cross either boundary. Hyper Awakening stays fixed for these changes.

Tests cover both numeric parameter sets, invalid inputs, threshold crossings, saturation, negative changes,
existing additive evolution totals, simultaneous evolution changes, actual crit flags, and Hyper Awakening.
The replay engine consumes these rules when explicit context is supplied. The current UI does not infer or
automatically apply a Blunt Thorn context from observed crit counts.

## Can the saved marginals reveal the missing context?

No. A constructive regression test fits two different **synthetic** hit-context mixtures to encounter 5886's
actual +1 pp crit and +1 pp evolution-damage marginal values. Each mixture has an unsaturated group and a
saturated group at 130% uncapped crit; its unconverted evolution bucket and group weight are solved to match
both observed marginals. These are mathematical counterexamples, not reconstructed stats for the run.

| Hypothesis | Unsaturated group crit | +1 pp crit | +1 pp evolution | +10 pp crit | +20 pp crit |
|---|---:|---:|---:|---:|---:|
| A | 100% | ≈0.14965% | ≈0.45330% | ≈1.4965% | ≈2.9930% |
| B | 119% | ≈0.14965% | ≈0.45330% | ≈0.14965% | ≈0.14965% |

Both match the same two saved marginal measurements. Their larger-upgrade predictions differ by up to 20×
because the unsaturated group in B reaches its conversion cap after just one point. Fitting aggregate values
therefore cannot justify a recovered per-hit crit baseline, even when it matches more than one stat value.

The existing marginal estimate now carries calculation-limit metadata for larger crit changes, negative crit
changes, large main-stat/Weapon-Power changes, and snapshot-based base-attack conversions. UI presentation of
that metadata can be refined later; the prototype already labels its large-change results approximate.

## Additional saved-data check

Checked `entity.support_ap`, `support_brand`, `support_identity` and `support_hyper` on the real run. Their
values are fractions around 0–1 (buff coverage), not the casting support's actual attack-power/brand totals.
They do not supply the missing support addend. The database does retain build spec and Ark Passive selections,
but not the complete inspected stat context on every hit.

## Next calculation work

Reconstruct context only from identifiable inputs: a matching inspected build, versioned runtime ability/buff
definitions, the logged active buff IDs, and known party stats. Track unknown sources explicitly. Continue
using meter marginals for small upgrades; do not extrapolate them into an asserted exact large-change model.
Validate the context reconstruction against matching recent logs before promoting replay into upgrade ranking.
