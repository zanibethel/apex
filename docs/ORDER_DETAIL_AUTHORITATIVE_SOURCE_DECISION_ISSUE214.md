# Issue #214 Phase 7 — Authoritative purchase-source decision and acceptance contract

**Decision for future implementation:** Apex itself should be the source of truth for **purchase creation** in a single, server-owned, authorized transaction. BTCPay supplies **payment evidence**, not items or customer delivery details. This is an architectural proposal and a fail-closed validation contract, **not** a deployed checkout or permission to sell.

**Review-only status:** Stacked on #232 → #231 → #230 → #229 → #228 → #227. No API endpoint, Supabase production migration, database writer, state mutation, inventory reservation, live customer capture, payment, refunds, crypto transfer, decryption endpoint, USPS label purchase or shipment has been added. All checkout and shipping gates stay off.

## What the current code really offers

| Existing source | Code / table | Observed capabilities | Why insufficient |
|---|---|---|---|
| Cart selection | `src/app/cart/customer-cart-page.tsx` and `src/app/cart/cart-provider.tsx` | Product IDs and quantity stored in browser | Not a server-owned purchase; client values are changeable |
| Customer delivery form | `src/app/cart/delivery-details-form.tsx` | Contact and US address **format validation** in browser | Never submitted or saved; no verified original purchase |
| Cart quote and readiness | `/api/cart/quote`, `src/lib/checkout/admin-multiline-order-admission.mjs` | Server-derived merchandise/discount/shipping previews, private checks | Does not durably reserve stock or produce a committed order; quote can expire or prices change |
| Retired checkout preview | `src/app/api/checkout/quote-preview/route.ts` | Endpoint returns 404 | Cannot create order or payment |
| Sales-history rows | `public.supplier_sales_history` | Store, order reference, original purchase timestamp, gross and payment/review state | Missing immutable product lines and address |
| Supplier CSV upload | `src/lib/supplier/sales-reconciliation-csv.mjs` | Review flags/notes with duplicate detection | User-editable; not independent sale or delivery proof |
| BTCPay signed invoice webhook | `src/lib/supplier/btcpay-settlement-evidence.mjs` | HMAC-verified event plus separately authenticated invoice readback | Proves provider settlement observation, not original cart, eligibility or shipping address |

No existing source satisfies the complete purchase-source contract, and **none may directly mint an order-ingestion permit**.

## Future canonical server transaction — order of operations

This is a proposed design pending independent merchant, product, shipping, privacy and payment approval, **not a currently executable workflow**.

1. Accept client selections only as a request. Verify authenticated (or explicit guest) customer identity and consent without treating browser state or browser-provided prices as authoritative.
2. Within a newly reviewed server-side transaction, independently re-read **one authorized supplier store**, all products and variants, saved prices, discount rules, inventory, supplier/product eligibility, any existing holds and shipping policy. Never re-use quote previews as durable authorization.
3. Allocate the **canonical original purchase ID and timestamp once**, freeze every product line's title/SKU/quantity/unit cents, and reconcile merchandise + shipping – discounts = gross in integer USD cents. Separate payment state from order/fulfillment/inventory states.
4. Encrypt the buyer's **minimum required delivery fields** at first trusted server ingress using separately reviewed KMS/vault-managed AES-256-GCM, with associated data bound to the canonical store/order/timestamp; preserve only the sealed envelope and key reference, no plaintext on report tables.
5. Commit the immutable purchase record, line snapshots, sealed delivery, protected customer consent/evidence, readback/audit and idempotent original source receipt **atomically**. A failed transaction leaves no partial purchase and cannot cause a payment, inventory or shipping side effect.
6. Only after that record is independently readable and legal/payment eligibility is approved may a later, separately authorized payment process create a BTCPay invoice with the canonical order reference. Idempotent invoice/pre-post fences prevent duplicate calls. Signed settlement plus Greenfield invoice readback is distinct evidence, never a source of missing order details.
7. A later **independently approved** fulfillment authorization may allow a restricted supplier to see the minimum required shipment details for their own purchase, update tracking with concurrency/audit checks and prepare/obtain labels. Never send sensitive addresses in ordinary notification emails or unsecured CSVs.

The existing private release gate is off. No data source is approved to execute this transaction today.

## Phase 7 code and acceptance

`src/lib/checkout/authoritative-purchase-source-contract.mjs` adds two **pure, no-write** functions:

- `classifyCurrentPurchaseSource(kind)` gives a deterministic machine-readable list of missing capabilities for each existing source. It returns `source_authoritative=false` and all creation/payment/inventory/fulfillment flags false.
- `assessProposedApexPurchaseCapture(input)` checks only the **structure** of a hypothetical server-side, sealed, held purchase envelope: exact fields, canonical store and original purchase identity/time, uniquely ordered line references and product IDs, frozen item titles/SKUs/quantities/prices, same-store delivery-envelope binding with canonical Base64 and AES-GCM nonce/tag sizes, and complete integer-cents reconciliation. It deliberately refuses client-controlled claims that the source was already authenticated or durably committed. No plaintext address, key or full input is returned.

**Structural completeness is NOT source attestation.** Even a valid-looking proposal yields `source_authoritative=false`, `gcm_authentication_verified=false`, `historical_sale_independently_checked=false`, `canMintOrderPermit=false`, `canCreateOrder=false`, `canCollectPayment=false`, `canReserveInventory=false`, and `canShip=false`. It cannot claim to have cryptographically checked the ciphertext or proved a real sale.

Tests `tests/authoritative-purchase-source-contract-issue214.test.mjs` cover each existing insufficient source, unknown sources, valid synthetic sealed shape without authority, forged attestation, missing or duplicate lines, wrong store and timestamps, arithmetic/discount/shipping mismatches, injection of plaintext fields, held-only flags, malformed encryption metadata and no external side effects. The test uses the Phase 2 synthetic signed-input generator; no live customers, products or payments.

## Remaining design and operational gates

- Production transactional source capture and readback (not merely a shape validator), independently reviewed RLS/worker permissions, original purchase identity conflict/replay handling, immutable capture+consent evidence.
- Authoritative customer identity/guest process, shipping address validation, privacy rules, retention/crypto-erasure, backup recovery and restricted supplier read rights.
- Real KMS/vault service with ownership, rotation and decrypt-on-need policies; the current in-memory keyring is only a synthetic demonstration.
- Merchant/supplier and product eligibility, customer consent, refund/partial/cancellation state continuity, inventory transaction atomicity, signed payment provider reconciliation, an auditable no-double-invoice/label recovery plan.
- Authorized integration of #215 supplier fulfillment ledger and #216–217 cumulative daily reports. Do not infer orders from CSV or payment webhook records.

**Next reviewable step:** separate read-only, supplier-scoped **held-order detail** contract consuming verified line snapshots and metadata *without exposing encrypted delivery or promising shipment*. Only after those access controls and purchase-source decisions are reviewed should a genuine source-capture implementation be considered.
