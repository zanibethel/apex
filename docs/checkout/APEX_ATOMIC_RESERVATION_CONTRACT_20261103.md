# Apex — atomic order reservation contract (PR #191)

## Why this pass exists

PR #188 added a production private **immutable, held-only order-intent journal**, PR #189 added server-calculated read-only catalog checks, and PR #190 added an admin-only locked recheck. None is authorized to reserve live inventory or create customer orders. The next required design is a durable, idempotent reservation operation that checks stock, current prices and verified shipping/tax amounts **in the same transaction**.

This PR implements that transaction as **executable SQL in an isolated PostgreSQL test fixture only**: `database/sql/apex_order_reservation_contract_REVIEW_ONLY.sql`. Its schema, tables and function are `apex_test_reservation.*`, its first action rejects databases not named `apex_test`, and it has no privilege grants to Apex's anonymous/authenticated roles.

### Transaction design demonstrated

1. Validate a bounded, canonical cart of 1–8 unique UUID product IDs and integer quantities (1–10 per line, no browser unit price or tax amount).
2. Produce the item fingerprint **inside the database** using SHA-256 over sorted canonical JSON.
3. Acquire a transaction-scoped advisory lock on `(store, idempotency hash)` and check the durable unique `(store_id,idempotency_hash)` order key. Same request returns the existing held order; changed request with the same key is rejected.
4. Load server-owned approved shipping and tax quotes by references. Both must match the store, canonical cart fingerprint, destination region, USD and an unexpired authorization. No arbitrary tax rate, free shipping or client-calculated costs are accepted.
5. Lock synthetic inventory rows `FOR UPDATE` in stable product-ID order and confirm product eligibility and available stock. Derive merchandise subtotals from **stored** prices and verify the complete total against the displayed amount.
6. Insert the single held order, immutable price line captures, and increment reserved units in the **same database transaction**. A failed step rolls back all writes.
7. Return only held-fixture status, ID, total, and literal `can_pay=false` / `invoice_created=false`. No BTCPay request, customer identity, shipment or payout occurs.

### Regression tests

The isolated PostgreSQL suite verifies valid shipping/tax totals, duplicate-key replay, mismatched replay denial, new-price rejection, expired/unapproved/mismatched quotes, cross-store rejection, malformed payloads and rollback. A two-session concurrency script tests both (a) two different requests competing for a one-unit item and (b) two same-key requests competing for a multi-unit item. The expected result is **one reservation per unique request**, never oversold inventory.

### What is not deployed

- **No production order reservation procedure or customer checkout API**. The real order journal remains empty and restricted.
- **No shipping or tax pricing engine**. The synthetic fixture uses explicitly saved, approved illustrative quote records. Real provider integration and destination verification remain unconfigured.
- **No release bypass**. Apex's product authorization, regulated-commerce reviews, seller approvals, global release gate and live BTCPay credentials remain separate prerequisites. All actual Apex product inventory stays zero.
- **No customer orders, payment invoices, wallet transfers, provider credentials, or shipping labels.**

### Next production decisions

Before moving this design out of the fixture, define a trusted shipping/tax provider integration, verify allowed destinations and regulated-product eligibility, design a real order owner/customer identity and abuse limits, specify reservation expiry/release and refund/void flows, and obtain merchant/provider approval. Then implement a separate privileged service with a global checkout gate and full audit, not a public `SECURITY DEFINER` order RPC.

This is a deliberately executable reservation foundation, not a claim that checkout is live.
