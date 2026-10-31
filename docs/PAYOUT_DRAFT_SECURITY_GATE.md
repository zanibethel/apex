# Payout draft security gate — integration review

## Original finding (closed in PR #43)
The initial SECURITY INVOKER RPC required direct authenticated table-write grants,
allowing administrators to bypass RPC allocation validation through the Data API.

## Implemented mitigation
The draft-saving RPC now uses SECURITY DEFINER with a fixed empty search_path,
explicit auth.uid(), trusted app_metadata platform_admin role, and current admin
membership checks. Direct INSERT/UPDATE/DELETE privileges on payout_rules and
payout_rule_allocations are revoked from PUBLIC, anon and authenticated.
The function's EXECUTE privilege is revoked from PUBLIC and anon and granted
to authenticated. No production database has been modified.

## Isolated PostgreSQL verification
- Authenticated direct table mutations are denied.
- A valid 10,000-bps draft saves through the RPC.
- Non-admin membership and untrusted role claims cannot save drafts.
- Invalid totals, duplicate recipients, out-of-range allocations and unknown
  recipients are rejected.
- Active rules cannot be modified through the draft RPC.
- Two simultaneous new draft saves for one scope produce distinct adjacent
  versions.

## Remaining release gates
1. Review SECURITY DEFINER ownership, EXECUTE grants, JWT freshness and the
   complete migration chain against the intended Supabase production roles.
2. Review Vercel production/preview deployment triggers and confirm both
   APEX_MULTI_SPLIT_DRAFT_WRITES_ENABLED and
   APEX_RECIPIENT_ADMIN_WRITES_ENABLED remain disabled by default.
3. Provision verified administrator membership through an approved privileged
   process; do not allow self-service role grants.
4. Test admin/recipient permissions with controlled non-production accounts.
5. Explicitly approve any production migration and deployment separately.
6. Do not activate live Bitcoin payments or payouts as part of this merge.

Passing CI establishes isolated test behavior, not production readiness.
