# Apex checkout safety monitor rollout

The monitor in `scripts/checkout-safety-monitor.mjs` is read-only and fails closed. It checks the private order gate, overdue unpaid holds (>3 minutes after expiry), terminal delivery envelopes retained >75 minutes, and both required pg_cron jobs (owner, schedule, active state, success age and failures).

## Deployment gate

**Do not merge or retire the existing hourly monitor yet.** Before activating GitHub Actions:

1. Provision a dedicated monitor database identity, **not** the existing production checkout login, `postgres`, `service_role`, or a role with BYPASSRLS. Prefer a tightly scoped private aggregate-only database function/view with explicit permissions rather than granting general SELECT access to customer tables. The code now reads only `apex_internal.checkout_monitor_snapshot_v1()`, staged in `database/sql/apex_checkout_monitor_aggregate_grants_REVIEW_ONLY.sql`. Review and apply that script separately after database security review; it is not deployed. The script creates a NOLOGIN permission role; a separate dedicated LOGIN role and secret still need provisioning. Never grant the login direct SELECT on private order tables.
2. Provide TLS-verified credentials in the GitHub Actions secret `APEX_MONITOR_DATABASE_URL`; never commit credentials or print connection errors.
3. Verify the workflow can read only safe aggregate counts and cron metadata, and cannot retrieve individual orders, addresses, ciphertext, or identifiers.
4. Run `npm test`, run the workflow manually, confirm healthy runs are silent and a deliberate isolated test failure creates a GitHub Actions failure notification. Scheduled GitHub Actions runs may be delayed and are not a hard real-time SLA.
5. Confirm the expiry job (`* * * * *`) and purge job (`*/5 * * * *`) remain owned by `postgres`, active and successful. Missing purge is an incident.
6. Only after live end-to-end verification and reliable alert delivery, retire the ChatGPT hourly monitor.

No checkout activation, payments, order mutation, shipping, or payout operations are part of this rollout.
