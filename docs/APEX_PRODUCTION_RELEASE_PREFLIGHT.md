# Apex production release preflight — 2026-10-30

## Verified from connected Vercel project
- Project: apex (Next.js), linked to GitHub zanibethel/apex.
- Most recent READY production deployment: commit `7c106fcc52ab242cc912df573f7b5777b0719f46` on `main`.
- Production Git integration therefore publishes commits from `main`; merging PR #47 may initiate deployment.
- Vercel environment variable names do not include
  `APEX_MULTI_SPLIT_DRAFT_WRITES_ENABLED` or
  `APEX_RECIPIENT_ADMIN_WRITES_ENABLED`.
  Both new server-side actions require an exact value of `true`, so absent
  variables keep these particular actions disabled.
- Older production variables include `APEX_SPLIT_DRAFT_WRITES_ENABLED`,
  `APEX_DRAFT_CATALOG_WRITES_ENABLED`, `APEX_DRAFT_PROMOS_ENABLED`,
  and `APEX_WALLET_REQUESTS_ENABLED`. Their values were not decrypted
  or verified; do not infer their behavior from names.

## Required before merge
1. Verify live database migration state and approve an ordered migration plan.
2. Review privileged payout RPC ownership, EXECUTE grants and admin membership.
3. Test the preview deployment with verified admin, supplier and customer accounts.
4. Confirm existing production feature flag values and downstream effects
   through an authorized configuration review, without logging secrets.
5. Confirm automatic deployment controls, branch protections and rollback path.
6. Explicitly authorize the merge and production release separately.

CI green: application checks, isolated payout RLS, Bitcoin regtest.
No live Bitcoin payouts or production schema changes were performed in this pass.
