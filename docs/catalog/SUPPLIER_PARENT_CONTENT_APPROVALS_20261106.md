# Private supplier card content approvals

Date: November 6, 2026. Follow-up to issue #286 and PR #290.

## How the supplier reviews products

1. Sign into Apex as an assigned supplier **owner or manager**.
2. Open `/supplier/catalog` and select **View supplier product options**, or visit `/supplier/catalog/variant-review`.
3. Review each parent card's exact retail price choices. The **Composition** section now shows complete ingredient formulas from the supplier sheet, including long slash-separated blend formulae; it is not a fabricated strength dropdown.
4. Select **Approve** only when all source options for that parent are priced and consistent. If any option is held, approval is disabled; use **Needs Changes** plus a short note explaining the discrepancy.
5. After saving, the card displays **Approved**, **Needs Changes**, or **Review again — source changed**. History is append-only and documents the authenticated reviewer. If the underlying private source rows change, the previous decision no longer counts as current.
6. No owner/supplier review in this workflow changes products, inventory, public catalog, payment, or shipping. This is a private confirmation of the proposed workbook interpretation only.

## Technical boundaries

- Data source remains `public.apex_supplier_variant_review_items` with strict store-scoped owner/manager **read-only** access, with 168 private records across 76 proposed parent groupings.
- Review decisions are independent events in `public.apex_supplier_parent_review_events`. `anon` sees none. Authenticated users get only SELECT and a strict subset of INSERT columns under ownership RLS; no UPDATE or DELETE.
- A **SECURITY INVOKER** trigger (no public SECURITY DEFINER RPC) checks the submitted source snapshot against every current staged option's ID, source row, name, category, composition/strength, size, carrier, retail cents, review status and notes. Stale or tampered forms fail. Parent approvals require every source option to be review-ready and priced.
- Source prices are retail, not costs. Staging IDs are **not** authoritative SKU/product identities. The 63 existing product records and 63 inventory rows must remain untouched, and the global release gate must remain off.
- Only the five supplier-ambiguous source rows and their 11 held options require clarification. The 17 full blend formulations should be visible as composition text, rather than hidden or truncated.
- There is no bulk approval in this change; per-card decisions ensure the supplier actually reviews each card.

## Test plan

- `npm test`, `npm run typecheck`, `npm run build`.
- Disposable PostgreSQL: staging migration, review-event migration, `tests/payout-rls/private-supplier-parent-approval.sql`, then full RLS job.
- Verify current main and exact PR head pass GitHub and Vercel preview checks before merge.
- Apply the reviewed migration to hosted Apex Supabase only after CI passes. Check zero review events at install and re-check 63 original products, 63 inventory records, zero published products and the disabled release gate.
- Sign in with a real assigned supplier owner/manager account to submit a **content-only** decision; do not impersonate a supplier or preapprove catalog records.

## Remaining

Supplier identity confirmation, review of the 76 proposed parent groupings, resolving held rows, and separate authoritative variant/product mapping with legal/regulatory readiness are still required before any real publication or purchase.
