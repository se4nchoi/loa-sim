# Build sharing experiment — 2026-10-17

Goal: clicking a shared recommendation should open the sender's simulated result, with its original baseline available for comparison. The user also permits storing a short ID → long build URL mapping for public character data.

## Reproduce

```sh
node scripts/share-link-experiment.mjs
node scripts/share-link-browser-experiment.mjs --verify
```

The second command needs a free local port 5174. Without `--verify` it stays running for manual browser checks. All generated data is in ignored `cache/`; no remote storage, bible fetch, or browser storage is involved.

## Payload experiment

Five existing character loadout fixtures, four scenarios (unchanged, weapon +25, weapon +25 with level 10 gems, and changes across gems/engravings/quality/accessory tiers). Some edits are no-ops on characters already at the target. Four payload representations, three browser-standard codecs: zlib DEFLATE, gzip, raw DEFLATE; URL-safe Base64 after compression.

240 encode/decode round trips passed. Each verifies the payload, reconstructed editable state, baseline, existing import validation, and exact numerical CP equality using the current model. All three truncated-payload checks rejected their input; this is not comprehensive malformed-input testing.

Whole URLs, including `https://loa-sim.vercel.app/sim#build=v1.`; DEFLATE results:

| Representation | Minimum characters | Maximum characters |
|---|---:|---:|
| Full baseline + full editable state | 3,796 | 5,446 |
| Full baseline + changed state sections | 2,787 | 4,850 |
| Full baseline + individual changed fields | 2,787 | 4,583 |
| Character + individual changed fields, without baseline | 88 | 336 |

The minimum includes unchanged builds. These ranges describe these fixtures and scenarios, not all possible builds. The patch experiment replaces arrays/objects when their keys differ; otherwise it walks into individual fields. It is not a finalized public format or a generic JSON Patch implementation.

Recipe links preserve results only with the same baseline. In a synthetic drift check, increasing the source's recorded CP by 100 while retaining its equipment changed the same weapon recipe from 6864.0357629680475 to 6965.193466814614 CP. A frozen link retains the original input. Model changes can still change recomputed CP; a production payload should include the original result and model identifier.

## Short-link mapping experiment

Three frozen sample links were mapped to 12-character IDs in a local JSON file. At the production hostname, the resulting `/s/<id>` URLs would be **41 characters** long. This is a prototype, not deployed functionality.

Verified persisted mapping equality, HTTP 302 status, exact `Location` preservation for all three encodings, and HTTP 404 for an unknown ID. The target is restricted to this experiment's `/lab#build=…` format, not an arbitrary external URL. The browser decoder page uses the existing simulation engine and import validator, but an attempted in-app browser connection timed out; subsequent browser tooling was blocked on its error page. **The final browser load and Reddit/Discord sharing behavior are not verified.** HTTP redirect assertions and the 240 reconstruction checks did pass independently.

## Proposed direction

Generate a self-contained frozen build link, then optionally shorten it. Persist only a short ID → versioned internal destination mapping. This is still storage of build data, because the destination string contains that data; it needs no player accounts, roster database, or synchronization. Keep the unshortened link/file export available independently of the lookup service.

Production work still needed: public decoder and shared-workspace behavior; durable mapping store and retention policy; immutable mappings with collision handling; bounded decompression and validated schema/patches; create-endpoint size/rate limits; only permit internal build destinations. Do not use the serverless runtime's local filesystem as durable storage. Avoid importing a shared character over the recipient's saved live character merely to display the plan.

No production endpoint, external shortening service, deployment, or remote database was created by this experiment.
