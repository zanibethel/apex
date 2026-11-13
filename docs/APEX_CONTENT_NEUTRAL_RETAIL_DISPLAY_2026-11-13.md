# Apex — content-neutral retail display (proposal, November 13, 2026)

## Why
The current retail-display SQL rejects any product whose name or description contains
one of several fixed words (including “peptide”). This prevents legitimate topical
hair-care cosmetics from being displayed because of a word rather than a product
review. The user clarified that the intended catalog does not include injectables
or anabolic steroids; prospective hair-care items need product-specific evaluation.

## Proposed change
- Add one forward-only migration replacing only the **supplier Publish preference**
  and **anonymous display-only retail catalog** functions.
- Remove hardcoded name/description keyword regular expressions in these two
  functions, including the broad “peptide” match.
- Do not edit prior applied migrations, stored product records, categories or pricing.
- Keep authenticated supplier ownership, required name/description/positive price,
  active status, explicit Publish/Unpublish intent, audit events, administrator
  visibility restrictions and holds, pending review, linked imports, identity holds,
  catalog gate, tenant scoping, and display-only `can_checkout=false`.
- Existing **Admin → Catalog release** restriction controls remain the mechanism
  for independently restricting or unrestricting a specific product. A product
  needing approval can be placed on review/hold until its classification,
  composition, marketing claims and applicable shipping/payment requirements
  are verified. Word matches never constitute permission to sell it.
- Keep the BTCPay/Prism Bitcoin plan and all checkout/invoice/fulfillment
  admission controls unchanged. No live sales or other payments are enabled.

## Tests and rollout
`npm test` includes a static regression test. The isolated PostgreSQL workflow
applies the new migration after previous retail migrations and verifies that a
fictional copper-peptide hair serum can be supplier-listed as **Sold Out** with
`can_checkout=false`. A separate explicitly administrator-restricted product
must still fail Publish. Existing cross-tenant, audit and admin privilege tests
remain.

This PR must pass tests and be reviewed before migration application. It does
**not** apply migrations, flip product gates or deploy automatically.
