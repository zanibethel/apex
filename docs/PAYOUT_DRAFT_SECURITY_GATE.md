# Payout draft write security gate — BLOCKER (review only)

## Finding
The current `public.save_payout_rule_draft` function is `SECURITY INVOKER`.
Its migration also grants authenticated users direct `INSERT` on `payout_rules` and
`INSERT/DELETE` on `payout_rule_allocations` under administrator RLS policies.
A verified administrator can therefore call the Data API directly, bypassing the
RPC's 10,000-basis-point total, recipient uniqueness/validation, scope existence,
and atomic replacement logic. RLS alone does not enforce those invariants.

## Release gate
Do not apply `20261030233000_multi_split_draft_rpc.sql` to the live database,
or enable `APEX_MULTI_SPLIT_DRAFT_WRITES_ENABLED`, until the bypass is closed.
Do not enable payout execution.

## Proposed remediation
Use a tightly scoped RPC execution role with no direct Data API table-write grants,
or enforce invariants at the database layer with deferred constraints/triggers.
Any privileged function must explicitly check `auth.uid()`, trusted
`app_metadata`, and current admin membership, use a fixed search path, and
have explicit EXECUTE grants. Avoid broad SECURITY DEFINER privileges.

## Required negative tests
1. An authenticated administrator cannot directly insert an invalid rule.
2. An authenticated administrator cannot directly insert/delete allocation rows
   to produce a partial or 9,999-bps split.
3. An authenticated non-admin cannot create, edit, or read admin-only drafts.
4. A valid 10,000-bps split can be created and updated through the RPC.
5. A published or scheduled rule cannot be changed through the draft RPC.
6. Concurrent writes cannot create duplicate scope versions.
7. All tests run against disposable PostgreSQL before production migration.

## Current verification
PR #41's green CI validates recipient directory access and the existing draft
RPC happy path; it does NOT establish the direct-write bypass is closed.
