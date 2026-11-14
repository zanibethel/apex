# Apex nonpayable production submission readiness (after PR #348)

> **Operational update — November 14, 2026 (after PR #349 merge)**
>
> This file originally documented the *proposal*. The production status has
> since advanced. The historical proposal and test plan remain below, but
> statements such as "not applied" refer to the earlier review stage.
>
> - **Encrypted delivery minimization deployed to Apex Supabase** using
>   migration `20261114062105_apex_terminal_retail_delivery_purge_v1`,
>   sourced from `20261114090500_apex_terminal_retail_delivery_purge_v1.sql`
>   at blob `233e72cf816b0915dec5c6258e4aa69a2ba8382a`.
>   Existing expiry job remains scheduled every minute. The new private
>   delivery purge runs every 5 minutes as `postgres`, with a 100-row bound.
> - Postmigration readback confirmed the private order-engine gate **false**,
>   no active or overdue holds, no encrypted delivery rows, exactly one active
>   delivery-purge cron and one active unpaid-hold expiry cron. The new purge
>   first ran successfully at 2026-11-14 06:25:00 UTC with zero failures
>   at readback. A guarded direct smoke call returned zero rows purged and
>   left the engine OFF with zero stored delivery. All anon/authenticated/service_role
>   DELETE grants on encrypted delivery, and EXECUTE on the purge function,
>   were denied; the checkout executor also lacked EXECUTE.
> - **Vercel WAF custom rule independently read back ACTIVE**, rule ID
>   `rule_apex_nonpayable_order_submission_ip_limit_kmcxVg`. It matches
>   production **POST /api/checkout/nonpayable/v1**, limiting to **20 requests
>   per IP every 600 seconds** using a fixed window, with `rate_limit`
>   mitigation (429). No abuse-load or true edge 429 exercise has been
>   conducted; mark the WAF release acknowledgment pending validation.
> - Apex Vercel environment inventory readback had **none of the six**
>   nonpayable submission/review flags set. No customer submission or payment
>   release has been authorized.
> - **Auth provider review is still pending.** Application code enforces
>   network-verified `getUser()`, confirmed email and nonanonymous
>   sessions and has no public signup UI; the connected Supabase app does
>   **not expose hosted** Confirm Email, Allow Signups, anonymous login, SMTP,
>   or Auth attack-protection settings. Inspect them in the Supabase
>   Authentication dashboard rather than treating application behavior
>   as confirmation of hosted settings. Supabase's password-breach check
>   was reported as a paid-plan option; do not claim it is enabled.
> - The existing hourly `Apex Checkout Expiry Watch` was extended to check
>   the new cleanup job and overdue terminal retention, without modifying
>   the production order engine.
>
> **Remaining release gates:** hosted Auth settings and delivery tests,
> WAF 429 behavioral verification, ongoing purge-job operations alert
> readback, and independent approval for any future
> checkout or payment activation. The four supplemental acknowledgment
> variables must remain unset until each review is complete.
>
---

**Proposal only. No live submission, checkout, invoice, postage or payouts.**

## Verified preflight on 2026-11-14
The Supabase order-engine gate was OFF, with 0 active held orders,
0 encrypted delivery rows, and one active every-minute unpaid-hold
expiry job. The Vercel Firewall config could not be read because the
connected integration lacked firewall permission. No WAF rule has been
verified or installed in this PR.

## Operator review gates
The public endpoint still needs BOTH original flags:
`APEX_RETAIL_NONPAYABLE_SUBMISSION_ENABLED=true` and
`APEX_RETAIL_NONPAYABLE_OPERATOR_APPROVAL=nonpayable-only-v1`.
It now additionally needs four exact operator acknowledgments, all
default OFF and server-only:

| Key | Required exact value |
| --- | --- |
| `APEX_RETAIL_WAF_IP_RULE_REVIEWED` | `nonpayable-post-ip-20-in-10m-v1` |
| `APEX_RETAIL_CUSTOMER_AUTH_REVIEWED` | `confirmed-invite-policy-v1` |
| `APEX_RETAIL_DELIVERY_RETENTION_REVIEWED` | `terminal-1h-purge-v1` |
| `APEX_RETAIL_HOLD_EXPIRY_REVIEWED` | `pgcron-expiry-monitored-v1` |

**Acknowledgments are not independent evidence.** Set none until the
configuration, audit logs and disposable tests have been reviewed.
The separate private PostgreSQL engine gate also remains OFF; even all
six flags cannot enable production holds by themselves.

## WAF
Inspect existing Apex Vercel Firewall rules before editing any.
Review a rule restricted to **POST /api/checkout/nonpayable/v1**,
fixed-window **20 requests/IP/10 minutes**, response **429**, with IP
derived from the edge-provided source (never browser-supplied headers).
Apply it only through a separately approved operator operation; test
synthetic bursts, visibility, shared-NAT behavior and rollback.
Vercel WAF counters may be region-local. Existing PostgreSQL limiter
independently allows 10 attempts per verified customer per 10 minutes.
See https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting

## Auth
The site currently has invitation-only account sign-in UI and requires
verified getUser(), confirmed email and nonanonymous sessions. This PR
adds the confirmed-email requirement within the central private-session
verifier as well. Separately check actual hosted Supabase Confirm Email,
Allow Signups, anonymous access, invitations, recovery redirects, SMTP
delivery, auth rate limits and CAPTCHA settings. Do not confuse UI
absence of sign-up with a disabled provider setting.
See https://supabase.com/docs/guides/auth/general-configuration

## Expiry and encrypted delivery
Existing private pg_cron expires unpaid holds every minute and
idempotently releases stock. Proposed migration adds an independent
**owner-run** five-minute bounded purge of **encrypted delivery only**
for terminal cancelled/expired unpaid holds older than one hour.
It preserves immutable order/line metadata and forbids API/executor
deletes. The proposed migration is NOT applied by this PR. Exercise
post-termination delete, active-row denial, repeated purge, role
isolation and stock correctness in disposable PostgreSQL before rollout.

Review `cron.job` and `cron.job_run_details` for both jobs,
and alert on failure/backlog. No log may contain customer address or
encrypted key material. For any future payable checkout, revisit
retention independently.

## Exit criteria
CI lint/typecheck/tests/build and RLS pass; provider-side WAF and Auth
readbacks are evidenced; private expiry and purge are tested with
synthetic records, alerts/rollback reviewed, and separate operator
authorization granted. **Do not change production switches or DB
engine gate from this PR.** Admin view:
`/admin/checkout-production-readiness`.
