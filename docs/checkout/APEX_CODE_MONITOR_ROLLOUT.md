# Apex checkout safety monitor rollout

## What is installed

Apex Supabase production now contains two **schema-only** migrations (no checkout activation, payment, shipping, inventory or order changes):

- `20261114234344_apex_checkout_monitor_aggregate_v1.sql`: a private, `SECURITY DEFINER` aggregate-only snapshot function `apex_internal.checkout_monitor_snapshot_v1()` and a NOLOGIN permission role. Explicit EXECUTE access is limited to `apex_checkout_monitor`; `PUBLIC`, `anon`, `authenticated`, and `service_role` are denied.
- `20261114234546_apex_checkout_monitor_login_identity_v1.sql`: `apex_checkout_monitor_login`, a low-privilege LOGIN identity that inherits **only** the snapshot function permission. It has `PASSWORD NULL` so it cannot authenticate yet. Read-only transactions are the default, and timeouts are set.

Verification against live Apex Supabase: gate disabled; two scheduled pg_cron jobs active and owned by postgres; no overdue unpaid holds or retained terminal delivery envelopes at the observation; monitor can execute the snapshot but cannot directly SELECT private orders/deliveries. Public roles cannot execute it.

## Activation gate — manual credential step remains

1. **Set a unique password privately** for `apex_checkout_monitor_login` in Supabase using a secure supported database-role management flow. If using the SQL Editor, be aware that SQL history may retain the statement and password; do not paste credentials into issues or this repository. Do **not** reuse the production checkout or postgres credentials.
2. In GitHub repository **Settings → Secrets and variables → Actions**, add repository secret `APEX_MONITOR_DATABASE_URL`. Use the exact Supabase-provided **TLS-verified** connection URI for the newly credentialed role, with a host reachable from GitHub-hosted runners (check Supavisor if direct IPv6 cannot be reached). Do not put this URI in any repository file, PR, chat message or logs.
3. Once the PR is approved and merged, run the `Apex checkout safety monitor` workflow using **Actions → Run workflow**, or confirm its first scheduled execution. It reads only the private aggregate function. The workflow fails closed if credentials or database access are missing.
4. Verify a healthy run exits successfully without creating an issue. Test failure notification against an isolated, non-production fixture or simulate a missing monitor credential in an isolated environment. The workflow creates **one deduplicated GitHub incident issue** and closes it on recovery; actual mobile/email notifications depend on GitHub notification settings.
5. Confirm scheduled runs continue at the intended ~5-minute cadence (GitHub Actions scheduling is best-effort, not an exact five-minute SLA). Validate the checkout gate remains disabled.
6. **Only after end-to-end healthy and incident-recovery verification, disable the existing hourly ChatGPT monitor.**

The connected GitHub application currently does **not** provide repository secret write actions, so it cannot set `APEX_MONITOR_DATABASE_URL` automatically.

## Checks

`scripts/checkout-safety-monitor.mjs` checks the private gate; overdue unpaid holds (>3 minutes past expiry); terminal delivery envelopes retained >75 minutes; and pg_cron job schedules, ownership, activity, recent failures, and stale success (`expiry>10m`, `purge>15m`). Alerts contain no order IDs, ciphertext, PII, connection strings, or SQL error details.

No production checkout, BTCPay payments, shipping, supplier payout, or inventory mutations are introduced.
