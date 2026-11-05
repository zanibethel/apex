# Track 1 — Private media acceptance and public image handoff

**Verified:** November 5, 2026. **Source:** connected Apex project read-only metadata and merged PR [#264](https://github.com/zanibethel/apex/pull/264).

## Current verified facts

- 63 saved products, 63 exact private storage object paths matching their saved image paths; the bucket `apex-draft-product-images` remains **private**.
- One existing product-review submission, **zero** `approved_internal` review states, and **zero** media-evidence events. Saved images have **not** been independently authenticated for public display.
- 13 saved products still have no category because their identity, composition or strength requires review. The proposed 63-row taxonomy identifies those 13 as explicit holds using ID, SKU and name; the implementation never assigns a holding category.
- Nine saved categories, **zero published**; global public-release gate `false`; zero observed order and BTCPay invoice intents.
- A saved image object is evidence of storage only, not a cleared public asset.

## Admin evidence queue follow-up

The protected admin **Image release readiness** page now supports a prioritized, private submission queue. Filters distinguish pending internal review, evidence awaiting checks, correction requests, and recorded evidence. Signed 90-second previews are created **only for the currently selected queue**, not every submitted image; the underlying review and evidence ledgers remain admin-RLS scoped.

Recording identity and image-use rights references is still a *private evidence step*. It does **not** approve public image delivery, authorize a product or seller, or turn on checkout. An unchanged, approved internal content review and an exact matching image-submission record remain prerequisites. Any later public asset mapping needs a separate review and immutable revision/revocation contract.

## Delivered supplier workflow

The authenticated supplier **Product Image Readiness** page:
1. Reads a complete, single-authorized-store product, review and inventory snapshot; refuses partial/truncated reads.
2. Verifies each product's exact folder and object, then creates only short-lived, signed, **private** previews; signs in batches of eight.
3. Prioritizes exact taxonomy holds, missing/inaccessible images, category setup, corrections, ready-to-submit drafts, pending reviews and current internal content decisions.
4. Shows private eight-step setup deficits and review status. For eligible drafts it offers the existing explicit per-product **Submit for internal review**, which checks the supplier role, draft-write switch and authoritative server RPC.
5. Never automatically submits, approves, publishes, changes stock, creates a public bucket, generates a customer image URL or enables payments.

## Acceptance actions and owner handoff

| Owner | Acceptance action | Evidence needed |
| --- | --- | --- |
| Supplier | Inspect product-specific private photo and name/strength, correct missing or mismatched images, complete category and metadata fields | Exact product draft and private preview |
| Supplier | Explicitly submit a complete draft for internal content review | Submitted, immutable snapshot and review status |
| Admin | Compare the submitted image with its product identity and evaluate use rights, return corrections or record references | Current review snapshot and private media-evidence event |
| Admin | Recheck the original 13 held identities before any category assignment | Verified source detail; never guess from name |
| Track 1 + independent reviewers | Design and review a **separate** public asset mapping/hosting contract tied to immutable verified image revisions and independent release status | Security/tenant review, object-integrity checks, revocation, cache invalidation and automated denial tests |
| Manual QA | On an authorized mobile supplier session verify preview loading, filter behavior, review button, error/refresh states, and all 63 records | Device/browser result and recorded discrepancies |

A separate, signed-off public media delivery implementation remains necessary before actual product photography can appear on customer cards. It must deny access whenever the release gate, supplier/product authorization, content/media evidence, or exact image revision fails. Do not reuse short-lived private supplier preview URLs as customer image URLs.

## Verification / release status

PR #264 passed exact-head GitHub quality checks including lint, TypeScript, Node tests, build and isolated PostgreSQL RLS integration, and its preview was READY. Production `ed302feacd5c3e9fef616f077c48fe4a450c0a9b` was READY on `apexanabolics.co`. A fresh database readback confirmed the global gate remains false, zero internal approvals/media events and zero order/invoice intents.

**Not verified:** interactive sign-in and mobile physical-device acceptance, legal use-rights/identity of individual images, actual public media distribution, and purchase/fulfillment functionality.
