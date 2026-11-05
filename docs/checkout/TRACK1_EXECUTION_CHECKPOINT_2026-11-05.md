# Development Track 1 — November 5, 2026 customer storefront checkpoint

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
