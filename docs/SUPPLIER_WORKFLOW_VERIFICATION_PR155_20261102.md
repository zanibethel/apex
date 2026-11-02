# Supplier / Admin Full Workflow Verification — 2026-11-02

## Goal
Exercise the same lifecycle the supplier uses: import an existing source into
a private zero-stock card, edit details, ask for publication, receive a
reasoned administrator hold and an image correction, update the private image,
resubmit content and listing corrections, and see the new evidence status.
Everything remains *private* unless separately confirmed legally eligible and
approved for public release.

## Real UX improvement in PR #155
Before: an image correction on the bulk product card still required visiting
the separate `/supplier/catalog` page to submit the updated product for
internal content review.
Now: the existing **Status details** accordion contains the previously
implemented `SupplierReviewSubmission` form. The supplier saves any edits
and submits from the **same product card**, without a new wizard or dashboard.
The existing authenticated action / database RPC still checks owner-manager
membership, completed setup and review status. The bulk page refreshes after a
successful request. The title, pencil, checkbox, Publish toggle, admin hold
and image correction note remain in place.

## Automated tests
`database/tests/full_supplier_card_workflow_e2e.sql` exercises synthetic
data in disposable PostgreSQL 17 after all the current migrations.
A transaction wraps the complete flow and is **rolled back**, then explicit
checks confirm no synthetic source or product survived and the global release
gate remains OFF.

The sequence verifies private source card creation and 0 stock; metadata
editing; requested publication without actual public release; private content
review; admin hold; admin-only evidence and supplier-safe image correction
note; cross-tenant read denial; supplier inability to override admin hold;
product image edit invalidating old review; content resubmission; supplier
correction resubmission; revised admin evidence; admin republish permission;
deliberate supplier request; and release still blocked.

The Node test also checks that the inline action is present and that a stale
image correction never represents current approval or public visibility.

## Boundaries / outstanding manual verification
- **This is an integrated SQL/logic CI test, not a browser session with real
  authenticated supplier + admin credentials.** The latter still needs
  a human walkthrough on the hosted site.
- No real image binaries are uploaded in the DB fixture, which uses synthetic
  private image paths. The image-upload flow still needs a real supplier test.
- No production source data, inventory, discount prices, product authorizations,
  seller verification, BTCPay settings, public assets or checkout are changed.
- The owner/admin must still make independent decisions on product legality,
  source evidence and image rights. Do not enable the public release gate.
