# Shared simulations in Postgres

New shares and their ten-minute rate limits use the Neon database connected with the STATS prefix. Usage stats moved to Cloudflare D1 on 2026-11-16 (see `private-stats.md`). URLs, payload validation, compression and 30-day expiry are unchanged. Reads do not extend expiry. Random ID collisions never overwrite an existing build.

Old links are tried in Redis only when no Postgres row exists. A valid Redis record is copied into Postgres with the same ID and original expiry, so subsequent opens use only Postgres. An unavailable Redis returns a temporary storage error, not an expired-link response. This recovery path stops on 2026-12-02 UTC, after all pre-cutover links expire. Redis is never used to create links, apply sharing rate limits, collect stats, or read the stats dashboard.

Postgres expiry is enforced on every open. Expired rows and limit buckets are physically removed, up to 100 at a time, whenever a share is created. Until then they remain in the table but are never served. Creating a share never renews the expiry of another share.
