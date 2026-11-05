# Development Track 1 — November 5, 2026 customer storefront checkpoint

> **Public media contract/revocation update, November 5:** The server-side versioned public media contract [#272](https://github.com/zanibethel/apex/pull/272), the private immutable version/revocation ledgers [#274](https://github.com/zanibethel/apex/pull/274), and automatic source/evidence/authorization-change revocation logic [#276](https://github.com/zanibethel/apex/pull/276) are present on `main` as of `e9b60162f7d8c1c474dd05537af8c98053568b96`. All three exact-head CI runs, including disposable PostgreSQL authorization/trigger tests, passed; branch Vercel previews were READY. The protected hosted migrations `20261105155316 apex_private_public_media_versions_v1` and `20261105160320 apex_public_media_auto_revocation_v1` were applied and read back. **Hosted state:** both ledgers empty; five automatic irrevocable revocation triggers and two immutable-record triggers installed; forced RLS and no anonymous/supplier table access; no public media or internally approved images; global release gate OFF; draft bucket private; no checkout or Bitcoin invoice intents. `GET /api/catalog/media/v1/:productId` was live-checked and still returns HTTP 404. The separate reviewed asset issuer, verified byte-copy/digest worker, private current-eligibility adapter, CDN revocation and manual mobile acceptance are **not** implemented. See [Media Delivery Contract v1](../catalog/APEX_PUBLIC_MEDIA_DELIVERY_CONTRACT_V1.md). No public image activation or commerce permission was granted.

> **07:30 CT review update:** [PR #264](https://github.com/zanibethel/apex/pull/264) merged and production READY on `ed302feacd5c3e9fef616f077c48fe4a450c0a9b`. Supplier image-readiness now includes a prioritized, private review queue, exact 13-ID holds and explicit per-product internal review submissions, guarded by existing authorization. Read-only hosted audit: **63 exact saved private image paths/objects; 13 uncategorized identity holds; 9 unpublished categories; 1 submitted review; 0 internal approvals; 0 media evidence events; 0 checkout/invoice intents; global release gate false**. No product images have been approved or delivered publicly. See [Private media acceptance and handoff](../catalog/APEX_PRIVATE_MEDIA_ACCEPTANCE_20261105.md). Manual supplier/mobile QA remains unverified.

> **Later November 5 verified update:** [#260](https://github.com/zanibethel/apex/pull/260) and [#262](https://github.com/zanibethel/apex/pull/262) are merged on main `1c3d1c5a7292792b0394dfac29415a9d4bcb97e2`, with exact-head quality, Payout RLS and Vercel previews successful. Production Vercel deployment for that SHA is READY. The hosted Supabase migrations `20261105095126 apex_public_cart_optional_shipping_quote` and `20261105095908 apex_public_catalog_category_projection` were applied successfully and read back. The public quote backend now accepts configured optional shipping. The public catalog projection can return category names **only for independently released, published categories**; the mobile public category filter is implemented. The global commerce gate remains **false**; 0 published products, 0 published categories, 0 stocked products, 0 checkout intents, 0 invoice intents, and public catalog returns 0 rows. Anonymous users still have no direct private inventory or release authorization read grant. The original snapshot and earlier unresolved-dependency descriptions below are historical where superseded by this update. No new commercial authorization was granted.

**Target:** December 1 technical readiness (not permission to transact). **Owner:** Track 1 (public catalog, cart, checkout UI/transport). **Source of truth:** `main` after reviewed PR #256, commit `3eca225ab1cb4066e1cfbac1f4234bad3805d049`. Branches and migrations owned by other tracks were not modified. The hosted private release gate remains **OFF**.

## Merged Track 1 slices

| PR | Delivered | Verified |
| --- | --- | --- |
| [#250](https://github.com/zanibethel/apex/pull/250) | Page-local name/description search, stock filter, mobile controls; filters **only eligible public projection** | CI/PG integration success; exact-head Vercel preview READY |
| [#252](https://github.com/zanibethel/apex/pull/252) | Strict browser-to-server checkout request v1 parser; reserved route rejects admission **before receiving private data** | CI/PG integration success; exact-head Vercel preview READY |
| [#253](https://github.com/zanibethel/apex/pull/253) | Read-only cart reprices/rechecks on refresh, visibility, focus and connectivity; updated shipping code UX | CI/PG integration success; exact-head Vercel preview READY |
| [#254](https://github.com/zanibethel/apex/pull/254) | Release-gated, responsive product detail URLs; prices/availability from current approved public projection | CI/PG integration success; exact-head Vercel preview READY |
| [#255](https://github.com/zanibethel/apex/pull/255) | Adapter to merged Track 2 [#251](https://github.com/zanibethel/apex/pull/251), trusted store binding/HMAC, rejects 9+ distinct products instead of truncating | CI/PG integration success; exact-head Vercel preview READY |
| [#256](https://github.com/zanibethel/apex/pull/256) | Parser supports no-fee shipping and null configured minimum without making a quote payable | CI/PG integration success; exact-head Vercel preview READY; backend dependency below |

GitHub Actions `Apex quality checks` includes lint, typecheck, Node tests and Next build, plus isolated PostgreSQL RLS authorization integration. These passed for each PR source head before merge. Vercel production on merged #256 SHA was subsequently reported **READY**. CI/preview alone does not prove a manual mobile browsing, supplier UAT or live inventory acceptance.

## Current hosted read-only state

Rechecked against the connected Apex Supabase project on November 5:

- 63 saved products; 50 active; **zero publicly published**, 13 without category; zero products with missing descriptions/image paths in saved private records.
- **Zero published categories**, zero positive on-hand inventory rows, 63 zero-stock rows, one supplier listing intent row, one administratively clear listing-control row. Supplier listing intent is not an independent authorization to publish.
- Public release gate `apex_internal.private_release_gate.enabled=false`; current public catalog RPC returns zero products.
- Independent supplier and product approvals, inventory claims and admin holds remain prerequisites to any public listing. No Track 1 PR changed this gate or product eligibility.
- This checkpoint does **not** attest stock receipt, independent supplier approval, real customer orders, payment readiness, private media suitability or physical shipment rights.

## Existing supplier workflows reviewed (not rewritten)

The preexisting authenticated supplier workspace contains product create/edit with price and description validation; CSV upload with duplicate/SKU and formula checks, bulk edit; private image upload/reuse; requested card publishing and admin hold/review controls. Server-side actions revalidate both `/catalog` and `/cart`. Existing Node and isolated PostgreSQL tests cover authentication, roles, approvals, supplier scope and held stock. Production supplier UAT is still required; **saved products are not the same as released inventory**.

## Cross-track handoff and boundaries

Track 1 browser transport v1: [contract](TRACK1_TRACK2_CHECKOUT_HANDOFF_V1.md); Track 2 canonical server-only contract: [Track 2 v1](APEX_TRACK2_ORDER_HANDOFF_V1.md). The server adapter `prepareTrack1CheckoutHandoffForTrack2V1` must be called with independently trusted `trustedStoreId` and a server-only `fingerprintKey`; it does not admit an order, reserve stock, create a checkout intent, make payments or persist delivery PII. The protected `POST /api/checkout/handoff/v1` remains **HTTP 503** without reading a body. Customer details currently exist only in the client-side form's memory, not transmitted to a backend checkout endpoint.

**Cart capacity mismatch:** saved cart can hold 20 distinct products, but current Track 2 admission contract accepts 8. The adapter rejects 9–20 without losing or splitting lines. Track 2 needs an explicit multi-order atomic plan or the customer UI needs a clearly stated eight-line cap at eventual admission; do not silently truncate.

## Remaining dependencies (not delivered)

1. **Approved real catalog:** 13 unassigned categories require supplier/admin review, public category publication is zero, and the public RPC does not provide released category labels or publicly authorized image URLs. Do not infer categories from names or expose signed private image paths. Source evidence and separate reviewed public projection are necessary for real category search and product media.
2. **No-fee shipping RPC:** deployed `public.get_public_cart_quote_source(jsonb,text)` currently rejects `charge_shipping=false` and null free-shipping minimum; PR #256 fixes only the safe JS parser. Any privileged SQL migration must preserve the release gate, all supplier/product checks, no public stock quantities, no payment authority, and be independently tested before applying. Configured `20001` cents remains the strictly-over-$200 threshold.
3. **Checkout Track 2:** a protected body-reading/order-admission route needs HTTPS/CSRF/rate limits, encrypted delivery storage, exact server saved-price/stock/promotion/shipping rechecks, idempotency and atomic reservation, plus canonical order identity. Payment creation/settlement remains exclusively Track 2 and separately gated; no live transaction here.
4. **Mobile/functional acceptance:** preview builds were READY, but actual small-screen browser review, keyboard/assistive-tech walkthrough, product media fit and current supplier UAT still need hands-on evidence with authorized content.
5. **Security hardening:** Supabase advisor retains 19 informational RLS-without-policy findings and warnings on public/authenticated `SECURITY DEFINER` execute grants, plus leaked-password protection settings. These are **not independently verified exploits**; triage against actual grants, claims, tenant constraints and intended denies before commerce authorization.

## Release rule

Do not activate checkout, payment, stock reservation, supplier fulfillment or USPS purchases without separate explicit commercial authorization. No sales-tax calculations were added. Existing production gates and hosted migrations were not changed by Track 1. Technical readiness by December 1 remains a target, conditional on documented dependencies.
