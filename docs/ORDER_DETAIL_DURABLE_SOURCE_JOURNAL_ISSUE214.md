# Issue #214 — Phase 6: immutable source receipt journal and readback-first recovery

**Scope:** Review-only, disposable `apex_test` database, stacked after PR #231 → #230 → #229 → #228 → #227. This is **not** an authorized purchase source, a hosted Supabase migration or a production ingestion service. No endpoint, webhook, queued job, customer address, cryptographic key, checkout, actual payment, inventory mutation or shipping action is added.

## Why the next release gate is still closed

The source tables `public.supplier_sales_history` and BTCPay settlement records do **not** independently supply a complete immutable purchase (all items, quantities, purchase time, customer delivery address/consent and eligibility). A signed BTCPay webhook demonstrates a provider event about an invoice, **not** the presence of a verified order. The proposed signed-order HMAC is a separate contract and no external source has been configured to speak it. For now, all input journals are explicitly labeled **`synthetic_ci_unverified`**.

## New disposable schema

`database/sql/apex_order_source_replay_journal_REVIEW_ONLY.sql` preflights `current_database() = 'apex_test'` and `private_release_gate.enabled = false`. It is intentionally excluded from `supabase/migrations`. All three private tables use forced RLS and zero direct anonymous/authenticated/service-role grants.

- **`apex_internal.held_order_source_claims`:** exactly one unchangeable source hash per (store, canonical historical sale), with a database-enforced primary key and unique composite identity.
- **`apex_internal.held_order_source_deliveries`:** unique (store, source kind, external delivery reference), independently foreign-keyed to the canonical hash; identical delivery replays are no-ops. A distinct delivery reference for the same original sale/hash is recorded once; a changed hash or cross-sale re-use cannot replace the source.
- **`apex_internal.held_order_source_recovery_events`:** append-only observations `unverified_received`, `held_snapshot_readback`, `source_conflict_review`; one event of each type per delivery. No mutable status flags, source JSON bytes, IPs, customer names, addresses, email, phone, tokens or decryption material.

Two `SECURITY INVOKER` private SQL helpers are callable **only by the disposable database administrator** (no grants to standard app roles).

`note_unverified_source_delivery(store, sale, delivery_ref, source_hash)` uses a transaction-scoped advisory lock for the canonical sale identity, checks the independent historical sale/store relationship, and stores only an **unverified** delivery reference. It neither trusts input as genuine source evidence nor mints permits. Changes to the hash under the same sale or changes to an existing delivery ID fail with a uniqueness error. Every result has `source_verified=false`, `can_create_order=false`, and `can_ship=false`.

`review_source_delivery_readback(store, delivery_ref)` is the **only recovery action** in this slice. It checks for an already-persisted complete, sealed, immutable held snapshot with matching canonical sale/source hash, matching line-count commitment, trusted success audit, disabled fulfillment/payment and encrypted destination; a positive match logs `held_snapshot_readback` once. If the order does not exist, it returns `requires_independent_source_attestation` with `can_retry_order_write=false`. If a partial/conflicting record exists, it records `source_conflict_review` once and requires manual handling. **It never retries an order write, calls a provider, upgrades payment/fulfillment, decrypts an address, or buys a label.**

## Tested behavior

`tests/payout-rls/atomic-held-source-recovery-journal.sql` runs the whole acceptance fixture inside `BEGIN ... ROLLBACK` after the Phase 4 synthetic restricted-worker tests. It verifies:

1. Existing held order is detected by immutable purchase/hash, not by report arrival date.
2. Repeated same delivery returns the same ID with no extra receipt events.
3. Different delivery ID with the same original source hash can observe the same held snapshot without duplication.
4. Same-sale changed-hash and delivery-ID reassignment are denied.
5. A historical sale missing line items/address remains **unverified and unwritten**.
6. Other supplier's store cannot claim/read another store's source history.
7. Source claims/deliveries/recovery events reject changes and deletes.
8. Authenticated client cannot execute functions or read private journal.
9. Journal contains no PII/raw-payload columns, commerce gate stays off, and all synthetic test additions roll back.

CI: `Payout RLS isolated Postgres verification`, plus existing `Apex quality checks` and Vercel preview checks. Production is unaffected.

## Operational design required before authorization

**Real source intake:** Determine the actual system that will authoritatively hold complete itemized paid orders and delivery information. Define its event IDs, receipt timestamp, immutable source hash and signed event verification. This cannot be inferred from BTCPay alone or created by treating supplier CSV uploads as sales.

**Receipt/processing reliability:** In production, separate authentication of real provider events from journal insertion, run server-side only with minimally scoped identities, and use database uniqueness under concurrent submissions. Implement an independently approved, time-bound source permit tied to exactly one canonical purchase; the worker must never mint its own permit.

**Crash safety:** Persist a receipt *before acknowledging* the upstream delivery; on restart, first read back the canonical sealed held order and journal. The absence of an order is not permission to write automatically — validate the genuine source, its permit and shipment eligibility separately. Use explicit bounded retries, backoff, poison-event isolation, dead-letter review and alerts. Failed writes should be independently audited in a separate successful transaction. An operator must reconcile unknown outcomes rather than resend financial or shipping actions.

**Key and retention policy:** Choose a KMS/vault, separate encrypt and need-to-know decrypt roles, enforce rotation and revocation, approve recipient data retention/deletion and backup handling, and test irreversible crypto-erasure where lawful. The Phase 5 in-memory keyring is only a unit-test model.

**Fulfillment:** Supplier queue/tracking (#215) and cumulative duplicate-safe reports (#216–217) must consume **verified held order identities**, never order-report rows as new purchases. Shipment and payment authorization remain independent gated decisions.

**Status:** This PR is a reviewable durability milestone, not a live connected order source and not permission to sell or ship any particular product.
