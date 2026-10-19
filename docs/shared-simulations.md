# Shared simulations

The CP Simulator card's Share simulation button captures the full original loadout and current edits. The server validates the snapshot, computes the original result, compresses the entry, and stores it under an opaque Redis key. Links look like `/s/Soulshan/<8-character ID>`; the name must match the stored character. The region remains in the snapshot.

## Storage configuration

Connect the Upstash Redis database to the Vercel project's Production and Preview environments. Supported server-only credential pairs:

- `STORAGE_REST_API_URL` / `STORAGE_REST_API_TOKEN`
- `STORAGE_KV_REST_API_URL` / `STORAGE_KV_REST_API_TOKEN`
- `STORAGE_UPSTASH_REDIS_REST_API_URL` / `STORAGE_UPSTASH_REDIS_REST_API_TOKEN`
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`
- `KV_REST_API_URL` / `KV_REST_API_TOKEN`

The matching `REST_URL` / `REST_TOKEN` variants also work for these prefixes. Use the read/write REST token, not the read-only token or TCP `redis://` connection URL. No credentials belong in client-side/public variables. The server uses Upstash's JSON-array REST command API; no Redis SDK is required.

Redeploy after connecting the environment variables so the deployment receives them. For local testing, supply the pair in ignored `.env` (see `.env.example`) and restart the dev server. If credentials are absent, sharing returns a readable 503 error; existing browser saves still work.

## Lifetime and behavior

- Entries use atomic `SET … EX 2592000 NX`: 30 days from creation, no accidental overwrite on ID collision.
- Opening a link only performs GET and never refreshes expiry. The stored timestamp is checked as well as Redis TTL.
- Missing/expired links return HTTP 410 with a request for a new link; service failures return 503.
- Copying the same link again in the current card does not create another entry or extend its lifetime. Editing and sharing creates a new snapshot.
- A shared page starts with the sender's edits on every open. Subsequent experiments use a separate browser autosave namespace and never overwrite the recipient's saved live character. Named saving remains available.
- Original CP is retained for comparison if the current calculation model changes. The link freezes inputs, not the simulator's source code.
- Share input is limited to 128 KiB. Creation requires a same-origin request and is limited to 10 requests per client address per 10 minutes through an atomic, expiring Redis counter. Only an address hash is retained for that counter. This is an abuse speed bump, not authentication.
- The snapshot is public to anyone holding the link. There are no player accounts or background uploads. Shared pages are not indexed and use `private, no-store` cache headers.

Keep Redis eviction off if shared links should survive until their 30-day TTL. The local JSON-file experiment is separate from this production storage implementation.

## Verification

Server tests cover snapshot and CP preservation, TTL command/expiry boundary, GET without renewal, collision retries, names/IDs, integration variable names, size limits, provider failures, shared rate limits, and endpoint origin/body checks. Live Redis and deployed browser verification require the configured project environment.
