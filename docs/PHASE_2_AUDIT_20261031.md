# Apex Phase 2 — production audit and first review pass (2026-10-31)

Source-of-truth checks: GitHub `main` commit `d61ddecc91d055fe2a55ffed0757569c934db88d` (merged PR #63), Vercel `apex` production deployment `dpl_kvHzSF6dVSnsKwML4N291Rt1ff8P` READY at the same SHA, dedicated Supabase `fhqpkpztercadcxspdkg` ACTIVE_HEALTHY. The current quality workflow for `main` is green. These are infrastructure checks, not authenticated manual acceptance tests.

## Implemented in the merged source
- Approved Apex logo, responsive header/menu, role-aware account links and optional profile form.
- Supplier draft product and category create/edit, private image upload, separately tracked source costs and compare-at prices, responsive product cards, importer review and draft conversion.
- Inventory read/edit server action with optimistic on-hand compare-and-swap; source and catalog audit schema.
- Restricted supplier sales-report, discount, test wallet-request and admin split draft interfaces.
- Tenant-oriented RLS and test suites; no code path intentionally activates live checkout or live Bitcoin transfers.

## Incomplete or unverified
- Hosted catalog contains **0 products, 0 categories and 0 inventory rows**, with **63 private import candidates** awaiting review/confirmation; no stock quantity is inferred from them.
- Draft product and inventory edits depend on `APEX_DRAFT_CATALOG_WRITES_ENABLED`; current deployed production setting is not asserted by this audit because the secret value was not read. Verify with an authorized user before calling writing functional.
- No independently verified owner/manager/staff end-to-end browser test of draft creation, image persistence, stock updates and cross-supplier isolation in production.
- Public catalog is a read-only list and empty state; searchable/filterable categories, product details and customer cart/mock checkout are not implemented.
- Sales history, payout, discounts and administration are mostly scaffolding or draft/test workflows, not settled commerce.
- Production currently has the `apexanabolics.co` alias. Vercel reports preview SSO protection; production-domain visitor restriction is not established. Public site content must remain nontransactional.
- Several older stacked draft PRs remain open although release PR #63 already consolidated their code. Do not merge old stacked PRs into `main` independently.
- Four Supabase migration-history entries were returned while additional SQL source and schema objects exist; reconcile migration history before further production DDL.
- Supabase security advisor: WARNING on authenticated execution of `public.save_payout_rule_draft` (SECURITY DEFINER); review function guard and grants. WARNING that leaked-password protection is disabled. No production configuration changed in this pass.
- Authenticated browser QA and live role isolation remain release gates; green source-level CI does not replace them.

## Small Phase 2 passes
1. **Inventory role-aware UI guard (this PR):** Align the stock editor's visibility with existing server-side owner/manager, private-store, unpublished-product, and feature-flag checks. Keep non-editable stock visible as read-only. Add regressions. No DDL, payment, live commerce, or env flag changes.
2. **Draft product-management acceptance:** Verify authorized owner/manager product create/edit, image upload and stock persistence in a protected test environment; fix only evidenced failures, reconcile hosted SQL/migration drift, and validate real-user RLS/negative cases. No automatic import publishing.
3. **Customer catalog presentation:** Add read-only category filtering, search and detail views over explicitly approved nontransactional preview content, with mobile and accessibility tests. Cart/guest-checkout should remain design-only pending authorization; no live checkout.

## Review gate for Pass 1
- GitHub lint/typecheck/tests/build pass.
- Protected Vercel branch preview reports READY and supplier inventory route can be evaluated by an authenticated role.
- Owner manually confirms staff sees read-only inventory, manager/owner sees an editor only when draft writes are enabled, no cross-store edits, and no layout regression.
- No merge without owner authorization.
