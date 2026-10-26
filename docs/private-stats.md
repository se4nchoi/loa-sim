# Private stats dashboard

Open `/stats` directly and enter the existing `STATS_KEY`. There is no Stats navigation link or public reporting endpoint. The key remains in page memory, is sent only in the authorization header, and is not saved by the application. Authenticated responses remain private and uncached. CSV export is not included.

- Activity: loaded-character estimates, action totals, daily chart, class/region breakdowns, failed loads and share requests.
- Exploration: recommendation/choice/budget sample totals, price coverage, bound-material use, cost assumptions, unpriced reasons and recommendation choices.
- Recorded joint cells: single-step offers by ceiling, complete budgets by cost/CP gain, and recommended versus applied categories. Pooled tables keep model and cost assumptions separate. These describe observations, not unique people or purchases.
- Saved plans: CP/item-level distributions, plan shape, changed systems, strongest standalone system, weapon/gem targets and crossed milestones.
- Daily tables follow the selected view. A searchable counter inspector shows up to 100 matching recorded fields at a time, including cohort fields not otherwise charted.

All production values come from the existing authenticated stats endpoint. Missing samples show empty states; nothing is backfilled or synthesized. New metrics accumulate only from their deployment onward. The event definitions and limitations are in `stats-insights.md`.
