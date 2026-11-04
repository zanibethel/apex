# Issue #216 Phase 2 — Atomic review annotations (disposable-only)

**Stack:** Draft PR #239 on #238 → #237 → #236 → #235 → #234 and earlier Issue #214 foundations. All changes are open, unmerged, and unavailable to production customers.

## What's persisted
The isolated database stores only supplier-specific **review annotations** for existing held original order lines and review shipment plans: `review_state`, `review_note`, independent `review_version`, last editor and timestamp. It records an append-only per-change audit and an immutable per-request receipt. It does **not** update purchased quantities, source history, shipment plans, tracking evidence, payment authorization or physical fulfillment.

## The two version dimensions
`source_revision` comes from the original review shipment plan and guards the related planning state. `review_version` is a separate optimistic counter for human review annotations, which previously lacked its own revision. Repeated identical review notes are recognized as already present; a different note against a stale review version is rejected. A changed source plan version also rejects the edit. Successful updates increment only the annotation version.

## CSV import
The existing cumulative export now includes the separate `review_version`. The protected supplier page reads **all** bounded current held source records, then overlays narrowly scoped annotations from a membership-checked read RPC. Only owners/managers see the Save action. A local preview reports duplicate, stale, changed and unchanged rows. The server action then independently refetches the current source and annotations, validates the complete uploaded file again, constructs the eight-field allowlisted change payload and submits it using the caller's normal Supabase Auth client. Users cannot insert arbitrary orders or source values.

If any row conflicts, the entire operation fails. Database mutation is one PostgreSQL transaction serialized by a supplier store row lock, with unique request ID and immutable audit/receipt. Exact request replay returns the prior receipt. A different upload with an identical note and state is a no-op rather than another audit event.

## Security and release
The new SQL and its invocation explicitly require disposable database `apex_test`, the disabled private release gate, a live verified non-anonymous Auth user, and fresh supplier owner/manager membership. The SQL is in `database/sql/*REVIEW_ONLY.sql`, **not** a Supabase migration. All three private tables enforce RLS and lack direct app-user grants; there is no service-role frontend credential. Sensitive customer destination and payments are neither read nor exported. Tracking and shipping remain disabled. Production lacks the test-only RPC and fails closed.

## Validation
- PostgreSQL: full transaction rollback after valid, replayed, stale, conflicting, duplicate, PII-like, cross-store, staff and anonymous cases; private audit and no commerce mutation; second test uses two independent real sessions to prove store-lock serialization and no lost update.
- Node: exact response shape, overlay, stable row identity, independent review-version, stale edits, duplicate-free replay and strict non-commerce receipt fields.
- Application: lint, typecheck, Node tests, build, and Vercel preview.

**This is not a production-ready shipping upload or fulfillment report email.** A live release needs separate independent source/merchant eligibility, privacy and security approval; report emails and protected address access remain a future issue.
