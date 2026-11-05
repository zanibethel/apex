# Apex Track 3 — Owner report-delivery alert sender

**Scope:** Issue #219 only. Existing verified, opt-in supplier daily reports use Resend, and a private webhook journal tracks signed provider events. This addition alerts the **configured platform owner** when those reports have a transport problem.

## Scheduling and controls

- Daily Vercel Cron: `/api/cron/owner-mail-alerts` at **16:15 UTC**. Vercel uses UTC scheduling, with possible hour-level variation by plan. The supplier summary sender is at 11:00 UTC.
- Endpoint requires the existing `CRON_SECRET` bearer authorization. Additional server-only dependencies are the activated `APEX_REPORT_DISPATCH_TOKEN`, `RESEND_REPORTS_API_KEY`, project Supabase URL/publishable key, and the existing `APEX_OWNER_PROGRESS_EMAIL` (restricted to `@apexanabolics.co`). No new client-visible key is introduced.
- The token-guarded RPC reads **seven days** of aggregate provider evidence, excluding pre-webhook accepted emails from receipt-overdue warnings. It alerts on bounced, failed, complained, suppressed, delayed, or missing signed events **after three hours**. It returns no recipient or customer data.
- If alert count is **zero**, no email is sent and no outbox record is made.
- A private FORCE-RLS outbox stores **one frozen summary per Central calendar day** and leases it for 15 minutes to prevent overlapping cron calls.
- A stable Resend idempotency key is derived only from the Central day. Retries are capped at **four attempts** and **12 hours from the first claim**, inside Resend's published 24-hour idempotency retention window.
- Provider API acceptance is journaled. It is **not** proof of actual inbox delivery. A failed acknowledgement remains visible as a private, unfinished claim; no credential or address is logged.
- The alert goes only to the configured owner email. There is no automatic supplier resend, recipient suppression change, or provider subscription mutation.

## Readiness and follow-up

- Code and isolated SQL tests should pass before applying a new hosted migration or merging.
- After applying the migration, record the **actual** Supabase migration version and align the source filename and CI references. Never apply the same DDL twice.
- Verify Vercel production READY on the merged SHA and confirm the cron registration, then monitor the first nonzero genuine post-webhook event.
- Historical Apex supplier daily reports dated November 3 and November 4, 2026 were shown as *delivered* in the Resend message-history API, but **not** in the signed webhook journal. They predate its activation, and must not be backfilled as signed events.
- Alert counts represent provider transport status; they neither imply delivery to a human inbox nor prove order eligibility.

## Explicit non-ownership

No changes to customer addresses, canonical order admission, payment settlement, shipping status, labels, carrier access, discounts, or storefront release. The private commerce gate stays **false**.
