# Shared simulations in Postgres

New shares, their ten-minute rate limits and usage stats use the Neon database connected with the STATS prefix. URLs, payload validation, compression and 30-day expiry are unchanged. Reads do not extend expiry. Random ID collisions never overwrite an existing build.

Old links are tried in Redis only when no Postgres row exists. A valid Redis record is copied into Postgres with the same ID and original expiry, so subsequent opens use only Postgres. An unavailable Redis returns a temporary storage error, not an expired-link response. This recovery path stops on 2026-12-02 UTC, after all pre-cutover links expire. Redis is never used to create links, apply sharing rate limits, collect stats, or read the stats dashboard.

Postgres expiry is enforced on every open. Expired rows are physically removed during daily stats maintenance and bounded cleanup on share creation. Traffic triggers maintenance; without traffic the records remain inaccessible until cleanup next runs. Creating a share never renews the expiry of another share.
