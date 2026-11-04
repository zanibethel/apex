# PR #223 — Owner weekly progress and expense-evidence digest

## Purpose

Send a separate weekly **owner-only** Apex progress and expense-evidence email without using a sixth ChatGPT automation slot. GitHub issues/PRs are the authoritative work tracker; Vercel's existing protected Cron infrastructure and existing Resend sender deliver the digest.

**Schedule:** Fridays at **14:00 UTC** (approximately 9 AM CDT / 8 AM CST); exact Central clock time moves at DST. This is separate from the supplier's daily-order email.

**Recipient:** a single pre-approved Apex-domain address configured as production-only `APEX_OWNER_PROGRESS_EMAIL` in Vercel. Never send this project expense summary to supplier accounts or infer a recipient from user-provided browser fields.

## Verified contents

- Pull-request titles, links and merge dates from the **public** Apex GitHub repo, restricted to the past 7 days.
- Highest-priority currently open Apex issue references, links and descriptions.
- Security: only HTTPS GitHub repo endpoints; timeouts; escaped HTML/title fields; bounded 100-row source reads; no issue body or customer records.
- Expense **coverage disclosure**: Apex-specific billed expense total is **NOT VERIFIED** until actual receipts, allocations or project-specific billing feed exist. Do **not** treat missing invoices or team-level Vercel usage as $0 Apex spending or label old $10/month quotes as paid invoices.
- Roadmap link: [Apex issue #222](https://github.com/zanibethel/apex/issues/222).

## Operational guardrails

- Vercel Cron supplies `Authorization: Bearer CRON_SECRET`. No secret means HTTP 401.
- The server requires both Resend's encrypted sending key and the explicit owner recipient environment variable; missing settings return HTTP 503 without sending.
- One Resend provider idempotency key per Central calendar date, with an explicit provider-accepted check. Provider acceptance is not proof of final inbox delivery.
- GitHub access failure returns HTTP 503 without sending instead of displaying stale or invented work status.
- No payment, USPS, inventory, checkout or supplier permissions are changed by this PR.
- The report must not contain vendor invoice details until a private, audited, owner-only expense ledger or provider billing integration is reviewed.

## Next expense-accounting pass

Track in [#222](https://github.com/zanibethel/apex/issues/222):

1. Collect actual provider receipts through an authorized private channel: Vercel, Supabase, Proton, domain, Resend, USPS and other operator-approved costs.
2. Store date, vendor, amount, currency, owner, billed vs forecast, whether **Apex-specific** or **shared-team**, allocation method and receipt reference.
3. Reconcile invoice totals, avoid double counting and send only validated Apex-attributable actuals plus clearly labeled forecasts.
4. Add owner-admin expense entry/import workflow and test provider-billing attribution before showing a total as confirmed.
5. Capture email delivery/bounce records and missed-week alerting. The first manual progress email was already sent November 3.

## Verification
Unit tests cover Central day interpretation, last-seven-days merging, issue priority, untrusted HTML escaping, failure-to-infer expenses, recipient isolation, cron authorization, Resend idempotency and preservation of the supplier daily schedule.

This pass intentionally **does not** claim the full invoice-ledger feature is implemented.
