# Apex supplier card storefront visibility — 2026-11-02

## Purpose

Keep supplier publishing effortless: the existing checkbox, pencil and Publish
switch stay on one mobile line. Give the supplier an immediately visible,
**separate** Storefront status. The switch only records an audited preference;
it does not prove any customer can see a product.

## Sources of truth

- The page checks the supplier's authenticated store and RLS-controlled
  listing-control row.
- For **requested** products only, the server calls
  `get_private_release_readiness(storeId,productId)` with the current
  authenticated supplier client. No service-role credentials are used.
- The status helper never treats a checked switch, a locally saved request,
  private product metadata, or private image URLs as evidence of a public
  listing.
- **Live · sold out** requires the protected RPC to explicitly return
  `status_code=public_visible`, `effective_public=true`, and
  independently positive supplier, product, admin, identity, content,
  setup and global release checks. A positive client-side override cannot
  satisfy that requirement.
- Missing/contradictory RPC responses fail closed with
  **Visibility unavailable**; administrator holds override everything.
- Zero stock never means "live" by itself. If a product becomes lawfully
  visible in the future, customer commerce remains disabled until a
  separately authorized payment and inventory flow.

## Current hosted environment

As of the PR, the global release gate is OFF, and Apex has no independently
verified supplier/product release authorizations with sufficient evidence.
The existing `get_private_release_readiness` always returns
`effective_public=false`. Therefore **Live is impossible** in production
with this pass. No migration, public image URL, inventory, source approval,
payment, or checkout changes are made.

## Interface checks

- Requested status appears directly on the card beside product setup state,
  below the compact single-line title/pencil/Publish controls.
- An explicit explanation lives in the existing **Status details** accordion
  and appears in single and multiple-offer private previews.
- Existing admin hold/correction text, multi-select actions, filters,
  media uploads and private saved drafts remain unchanged.
- The separate media readiness screen remains private. Product-specific
  public image licensing, label verification, rights clearance, approved
  hosting and independently confirmed regulatory eligibility are future
  required gates, not assumed from private image accessibility.

## Test and rollout

CI should verify incomplete/contradictory server verdicts, admin priority,
optimistic UI controls, missing RPC data and exact mobile card placement.
No live products or admin authorization records are created by these tests.
Merge only after exact-head quality checks and Vercel preview succeed.
