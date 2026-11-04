# Apex Issue #217 — Supplier email and metadata-only attachment foundation

**Review-only.** This PR is stacked on #239 → #238 → #237 → #236 → #235 → earlier Issue #214 foundations. Nothing is merged, and no actual email or shipment is sent by this work.

## Existing mail delivery is unchanged

The project already has a sales-summary sender at /api/cron/daily-supplier-reports and a verified account-email opt-in flow, using Resend and a per-store/date/recipient dispatch journal. Its Vercel cron runs at 11:00 UTC (05:00 CST / 06:00 CDT), targeting delivery before 08:00 America/Chicago. **This new code does not change the existing cron, provider key, sender, consent setting, or outgoing message.** A sales record is not independently confirmed to need shipping. Provider acceptance is not mailbox delivery.

## Protected review attachment

src/lib/supplier/review-email-report-manifest.mjs builds a complete, bounded, stable synthetic held-order report from the existing authenticated supplier review workbook. It creates an in-memory CSV and SHA-256 digest, with only store ID, original order ID/time, original line number, order/plan row kind, purchased/planned/unplanned quantities, plan identity/revision, and review version. No customer names, addresses, contacts, product titles/SKUs, tracking numbers, payment credentials, review notes, email destinations, invoice details or delivery ciphertext.

At /supplier/reports/fulfillment/email-preview, the authenticated supplier can preview responsive HTML in a sandboxed frame and download the metadata-only attachment in their browser. No external signed link, unauthenticated file download, webhook or email job is created. The only link intended for a later email points back to the existing authenticated supplier dashboard.

All statistics explicitly concern **held order planning**, not paid or physically shipped orders. The original purchase date remains fixed, while new-today and carried-forward counts use America/Chicago. Shipped and delivered verified counts are **zero / unavailable** rather than inferred from a tracking draft.

## Synthetic delivery outbox and delivery-status tracking

database/sql/apex_supplier_review_email_delivery_REVIEW_ONLY.sql only runs in disposable apex_test with all commerce gates disabled and is deliberately outside supabase/migrations. The private outbox enforces unique (store_id, report_day, recipient_user_id), verifies active supplier membership, current opt-in, confirmed account email, bounded report digest and row counts, and rejects changed content for the same frozen identity.

Append-only synthetic provider events distinguish prepared, simulated_accepted, simulated_delivered and simulated_failed. Acceptance is not delivery; independent simulated delivery/failure events, duplicate-key replay, stale-revision denial and bounded retry logic are all testable without sending a real message. The authenticated supplier status RPC exposes only the **current user's** own preview state and attempt count. Actual provider-accepted, real inbox-delivered and mail-sent flags always remain false. The private tables enforce forced RLS and no application-user table grants.

## Verification and remaining gates

Node tests cover 20-order-compatible source bounds, exact CSV digest reproducibility, redaction, cross-store and malformed source denial, mobile email HTML and strict non-delivery claims. Isolated PostgreSQL tests cover verified opt-in, per-day dedupe, changed-content rejection, simulated delivery event progression, retry, unauthorized recipients, cross-store and anon denial, and rollback. Full CI and preview checks must pass before review.

Real supplier email attachment sending, provider-signed webhook reconciliation, durable failure alerts, Proton inbox/mobile end-to-end QA, and any address-level access **remain unimplemented**. Those require verified eligible original purchases and separate privacy/security release gates. This PR does not activate live shipping, payments, postage or fulfillment.