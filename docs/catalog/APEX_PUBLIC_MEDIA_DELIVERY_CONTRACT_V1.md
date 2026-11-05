# Track 1 — Public media delivery contract v1

**Status (November 5, 2026):** implementation foundation merged behind a hard-disabled delivery route. **Not a public-image launch.** Owner: Track 1; cross-review with supplier/admin reviewers and security/operations required before an asset can ever be served.

## Contract and trust boundaries

Source: `src/lib/catalog/public-media-delivery-v1.mjs`. Only trusted, verified **server-side** records may be passed. A version has exactly:

| Field | Requirement |
| --- | --- |
| `schemaVersion` | Integer `1` |
| `versionId` | Unique UUID, immutable for this image version |
| `storeId`, `productId` | Both exact UUID identities |
| `submissionId` | Existing immutable private product-review submission UUID |
| `evidenceEventId` | **Latest** trusted per-submission private image identity/rights evidence event UUID |
| `sourceImagePath` | Product-scoped private path `<store>/<product>/<uuid>.(png\|jpg\|webp)`; **server-private only** |
| `sha256` | Lowercase 64-character SHA-256 hex of independently verified immutable published asset bytes |
| `assetKey` | Exactly `media/v1/<store>/<product>/<version>/<sha256>.<ext>`, with the source image extension; no arbitrary external URL |

An uploaded file path, matching name, private signed preview, supplier claim, internal content approval, or a supplied digest **alone** does not make a version publishable.

`parsePublicMediaVersionV1` rejects unknown fields, malformed IDs, unexpected paths, wrong digest, extension mismatch, and keys not derived from the full asset identity. It does **not** itself verify the hash against object bytes. Before a release implementation can create this record, a separate trusted image-copy worker must read the approved source and verify the stored public object's bytes, content type and cryptographic digest, without making the private bucket public.

## Delivery decision (checked on every request)

`resolvePublicMediaDeliveryV1` allows only a **versioned immutable asset key** when all of the following independently observed states are true:

- Separately activated public catalog gate **and** media-delivery switch; all unconfirmed states fail closed.
- Version ID and source image path still match the current private product and current **approved** review submission. The existing product-change guard invalidates changed details. No cross-store or cross-product use.
- Media evidence event matches the **current latest** evidence ID, source image path, same product, same submission, recorded identity and publication-rights evidence. A newer correction or changed submission denies the old version.
- Exact private-base store, independently published category, supplier listing on, no admin hold or pending republish approval, no active identity hold.
- Separate **current** verified supplier and product release authorizations. Expiration, withdrawal, or changed ownership immediately denies the old version.
- Explicit version revocations must not contain this version ID.

The positive result includes **only** `{schemaVersion,versionId,productId,assetKey,sha256}`, never a private storage path, evidence references, supplier costs, private review or preview URL. It never grants order or payment rights. A subsequent approved image-delivery adapter must derive any final CDN hostname from **trusted server configuration**, fetch only an immutable verified object, and recheck eligibility on every request. Never redirect to an untrusted arbitrary URL.

## Revocation and version changes

An image replacement, revised product-review submission, changed matching rights evidence, unpublished category, supplier unpublish, active admin hold, revoked/expired product or supplier approval, or global release shutdown **immediately disables delivery on the next authorization check**. Explicit revocations are permanent for the matching version ID. To republish a changed image or after explicit revocation, issue a *new* version ID with a new approved snapshot, latest evidence, and freshly verified copy/digest. Never reuse an old version ID or serve cached stale decisions.

**Version-ledger follow-up (private schema only):** The additive migration `20261105162000_apex_private_public_media_versions_v1.sql` defines immutable version identities and an append-only explicit revocation ledger in `apex_internal`. Both tables enable and FORCE RLS, grant no anonymous/authenticated reads or writes, have no user-facing writer API, and raise on UPDATE/DELETE. Exact asset keys include store, product, immutable version UUID and verified SHA-256 digest; keys cannot be external URLs or reference a different source product. A revocation permanently marks the exact version ID, never a later replacement. Its empty hosted state is independently checked before and after migration; there is still **no public media approval**.

**Integration still required:** a separately privileged, reviewed writer (with transactional revision/CAS, exact current submission/evidence checking and byte-level digest verification); public-safe immutable asset-copy worker; private current-eligibility read adapter wired to both release and media switches; live revocation/invalidation on image and authorization changes; CDN cache purge; and customer delivery with negative tests. A raw row in the ledger is **not** proof of any review and cannot cause public delivery. This migration does not manufacture approvals, copy objects, publish storage/CDN links or give public read grants.

## Automatic irrevocable revocation (separate protected migration)

The migration `20261105170000_apex_public_media_auto_revocation_v1.sql` installs five database trigger sources that append **permanent, version-ID-specific** revocations: source-image/product-detail edits, current review updates, new media-evidence events, product authorization changes/deletes, and supplier authorization changes/deletes. Each trigger executes with a restricted `SECURITY DEFINER` function and writes only into the private version revocation ledger; it does not alter product approval or release switches.

An `automated=true` revocation records a database-initiated decision with a **null user actor**; explicit manual entries still require a real authenticated reviewer. Neither actor type can update/delete the original version or revocation events. Repeat triggers use `ON CONFLICT DO NOTHING` to preserve the first permanent reason. A later renewal/reversion cannot resurrect the old version ID. Future asset replacement **must generate a new version** after evidence and asset-byte verification.

Live deliverability still requires dynamic checks for category publication, listing switches/holds, expiry and the global gate; those events suppress delivery immediately even before a revocation is stored. The new automatic triggers are **not** a publication or checkout mechanism. Tests exercise isolated synthetic changes inside rollback and verify no hosted commerce switch or data rows are changed.

## Endpoint

`GET /api/catalog/media/v1/[productId]` is intentionally reserved and **always responds 404** with `private, no-store`, without looking up storage or any customer/supplier private data. Do not change it to redirect or return bytes until a separately reviewed release writer, access predicate and distribution mechanism have passed exact-head tests and approval.

## Verification and next acceptance gate

Node unit tests check exact key construction, rejected forged paths/digests and 25+ denial variants (new evidence, changed source/review, admin hold, expired approvals, revocation, gate off). The existing isolated RLS tests and Vercel build must pass on the exact PR head. Live project status when authored: public gate OFF, zero media evidence approvals, zero content approvals, zero public products. Manual mobile/browser review and real image proof are **not** verified by this contract alone.

**Integration ownership:** Track 1 owns public read behavior. Supplier/admin review owns independent evidence; backend operations owns immutable asset hashing, logging and revocation; Track 2 owns orders/bitcoin and is unchanged.
