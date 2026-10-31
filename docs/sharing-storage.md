# Shared simulations in Postgres

New shares, their ten-minute rate limits and usage stats use the Neon database connected with the STATS prefix. URLs, payload validation, compression and 30-day expiry are unchanged. Reads do not extend expiry. Random ID collisions never overwrite an existing build.

Old links are tried in Redis only when no Postgres row exists. A valid Redis record is copied into Postgres with the same ID and original expiry, so subsequent opens use only Postgres. An unavailable Redis returns a temporary storage error, not an expired-link response. This recovery path stops on 2026-12-02 UTC, after all pre-cutover links expire. Redis is never used to create links, apply sharing rate limits, collect stats, or read the stats dashboard.

Postgres expiry is enforced on every open. Expired rows are physically removed during daily stats maintenance and bounded cleanup on share creation. Traffic triggers maintenance; without traffic the records remain inaccessible until cleanup next runs. Creating a share never renews the expiry of another share.

## Bulk migration

After Redis permits reads again, run `node --env-file=<private env file> scripts/migrate-redis-shares.mjs <new private backup.json>` from the repository. The Vite runtime validates snapshots using the app's existing parser. The tool scans only shared-build keys, saves the original compressed records, copies unexpired builds without overwriting IDs, and verifies every payload and original expiry. It never deletes or writes Redis records. A successful full verification sets `redis-shares-imported` in Postgres, disabling further legacy Redis reads. A quota error, invalid record or verification conflict leaves the marker unset; diagnose and retry with a new backup filename. The follow-up runtime change should be deployed after the migration completes.
