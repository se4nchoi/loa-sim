# External DPS methods consulted — October 14, 2026

## LOALAB (lo4.app / 로아랩)

Confirmed public tools: [crit calculator](https://lo4.app/tools/blunt-thorn), [Supersonic Breakthrough calculator](https://lo4.app/tools/supersonic-breakthrough), and [Ark Grid gem upgrade efficiency](https://lo4.app/tools/gem-upgrades). Crit settings expose party synergy and build context. The speed tool separates speed sources; the live gem page describes comparing CP growth and expected replacement costs. I did not verify a published full rotation-DPS algorithm or engine source for LOALAB. These UI inputs do not establish a cast-scheduling formula.

Application to loa-sim (our design conclusion): use explicit per-skill crit context, additive bucket totals and speed-passive caps for fixed-rotation damage. Separate speed's damage-passive effects from its potential timing effects to prevent duplicate gains.

## Lopec KR

[Published update history](https://lopec.kr/) describes standard skill shares for efficiency calculations and a March 19, 2026 cooldown weighting change from 100% to 90%. It also records class-specific speed corrections. The [indexed developer upgrade guide](https://dev.lopec.kr/character/specupGuide/%EC%84%B8%EA%B3%84%EC%A0%9C%ED%8C%A8%EC%A4%91) says cooldown gems are excluded by default because score logic struggles with real damage gain; higher-level gems receive heuristic priority. The full present-day cooldown equation was not established. Live character-detail attempts returned 404 despite public ranking entries, so that guide explanation is indexed evidence, not a verified current production tooltip.

Application to loa-sim (our design conclusion): skill damage shares should come from the selected player's runs. No universal cooldown weighting should replace their observed waiting, burst and phase constraints. Lopec score growth is not evidence of an equal raid DPS increase. It is useful comparison material for covered gear-effect calculations, not validation of our counterfactual timeline.

## Additional relevant reference: lostarksim.com (separate project)

Its [methodology](https://lostarksim.com/methodology/) documents an event-driven priority scheduler, cooldown/charge recovery, action locks and hit timing. It distinguishes speed-adjustable motion from fixed delays. [Limitations](https://lostarksim.com/limitations/) say simulation currently centers on Arcana and omits boss phases, forced downtime and actual party-buff timing. A [public Rust engine](https://github.com/acapzed/lostark-simulator-engine) is linked from its own About page. This was found during research and is not LOALAB or Lopec.

Application to loa-sim (our design conclusion): event scheduling is the closest architectural reference for the proposed Shanzkii timing experiment. Our experiment must add the selected log's phase/downtime constraints and preserve the declared rotation/resource assumptions. Its published Arcana support does not establish a usable Brawl King implementation.

## Decision for the DPS plan

Retain two separate calculations:

1. Fixed-rotation gear gain: change eligible hit damage under the selected raid/build context.
2. Timing scenario: rebuild legal cast/burst times under declared resource, cooldown and speed changes; evaluate new hit windows and any extra attacks before recorded encounter end.

Compute total target damage once from that resulting sequence. Keep the selected run duration fixed and report added casts, phase-constrained waiting, and coverage. Do not multiply an independent cooldown-gem throughput estimate on top of a timeline that already reschedules those casts.

Published methods inform our implementation design; none of these sources validates a precise Shanzkii raid DPS gain from a one-second meter-generation improvement. No external implementation was copied or incorporated during this consultation.
