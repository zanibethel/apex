# Apex supplier daily email — provider delivery evidence

Track 3 / Issue #219. Verified integration boundary, not a checkout or shipping release.

## Existing and new contracts

- The existing sender accepts a *verified opt-in account email* and writes a stable
  `supplier_daily_report_email_outbox` provider acceptance record.
- The new **private** `apex_internal.supplier_report_delivery_events` table records only
  the signed provider event ID, matching accepted dispatch ID, provider email ID,
  event type and timestamp. No addresses, raw payload, email text or customer PII.
- `record_supplier_daily_report_delivery_event` checks the existing 256-bit
  server-only dispatch token and requires one unique accepted provider ID.
  Exact event replay is a no-op; changed reuse is rejected. It creates no order.
- `get_supplier_daily_report_delivery_status` requires current authenticated
  supplier membership and returns only the **current user's** status for one
  permitted store/date. The projection is version 1, with no recipient data.
- A signed Resend event is not shipment evidence; CSV review edits, purchase
  history and provider email acceptance never authorize carrier operations.

## Provider configuration

1. Keep `RESEND_REPORTS_API_KEY` for outbound reports and the existing
   `APEX_REPORT_DISPATCH_TOKEN` private in Vercel.
2. Configure a **separate** `RESEND_REPORT_WEBHOOK_SECRET` as a production-only
   sensitive secret in Vercel. Use the signing key generated for the Apex
   webhook endpoint; never add it to GitHub or any `NEXT_PUBLIC_` variable.
3. Point the Resend webhook to
   `https://apexanabolics.co/api/webhooks/resend-supplier-reports` and
   subscribe only to: `email.sent`, `email.delivered`, `email.bounced`,
   `email.complained`, `email.failed`, `email.delivery_delayed`,
   `email.suppressed`.
4. Deploy the secret-bearing configuration and check a real **authorized**
   provider event against the private journal and current supplier's daily
   status view. Do not send a test message to arbitrary addresses.
5. Resend can host other projects: after raw signature validation,
   unrelated senders and non-supplier report subjects are acknowledged
   without creating private journal entries. Unknown *matching daily report*
   provider IDs return retryable failure to handle accepted-outbox races.

## Evidence vocabulary

- `provider_accepted`: Resend accepted the outbound API request.
- `provider_sent` and `provider_delayed`: delivery not established.
- `provider_delivered`: Resend reported a recipient **mail server** delivery,
  **not** independent proof that the message appeared in the recipient inbox.
- `provider_bounced`, `provider_complained`, `provider_failed`,
  `provider_suppressed`: requires owner/supplier attention. Never auto-enable
  resend attempts without verifying the current subscription and recipient.
- Existing accepted messages are **not backfilled** as delivered from guesses.

## Tests / deployment discipline

- Exact-head GitHub Node/Next checks, isolated PostgreSQL forced RLS,
  tenant isolation, token rejection, replay and forged claims tests,
  and Vercel preview must all pass.
- Migration was applied to the connected hosted Apex Supabase project as
  version `20261105134226_apex_supplier_report_delivery_events`; source uses
  that exact filename, avoiding a second schema application.
- Confirm the production release gate remains false; never activate shipping,
  postage, Bitcoin settlement or order creation in this track.
- Owner weekly digest delivery has a distinct source contract and is not
  quietly recorded as a supplier's daily report.
