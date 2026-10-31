# Supplier Bulk Workspace — Search and Status Views

Date: October 31, 2026. UI-only pass following the compact mobile toolbar and save-state fix in merged PR #89.

## Why

On iPhone, even a moderate CSV import produces a long column of visual product cards. Suppliers need to find a specific item or concentrate on incomplete drafts without losing the existing image, stock, preview or publication-request actions.

## New controls at /supplier/catalog/bulk

- **Find product:** case-insensitive title or SKU search. A search does not mutate saved products or reorder the imported/new-first cards.
- **Show:** All products; Unsaved drafts; Ready to request; Publication requested; Needs setup / held.
- **Showing N of M products** provides the current count and the selected count in this view.
- **Select visible** selects only currently displayed cards, not other products hidden by the search/status filter. Changing search/filter clears the selection. All bulk save and selected publication actions operate on *selected visible rows* only.
- **Add product, Add 5 and CSV import** reset the view to All products with no search so new cards do not disappear. CSV import still selects the imported cards for review.
- The two input controls use responsive columns with accessible labels and 44px targets.

## Status meaning

**Ready to request** means the supplier's existing server-scoped private listing-readiness state says a saved, unchanged product can submit a private publication request; it is *not* public/legal saleability. Missing listing-control records never count as ready. **Publication requested** includes local successful requests plus persisted requests. **Needs setup / held** groups saved, unchanged products that are not eligible to request publication; it includes incomplete or held items and does not diagnose the reason by name alone. **Unsaved drafts** includes newly imported products and edits not yet stored.

No new publication entitlement is granted by the filter. The existing server action and database RPC recheck ownership, completeness, admin holds and the global disabled release gate. No new SQL, public image access, checkout, payments or public catalog changes.

## Automated acceptance

- Search matches case-insensitive name or SKU without changing original order.
- Status views separate unsaved, ready, requested and blocked state and handle missing readiness conservatively.
- Selection and group actions are limited to visible cards; changing view drops selections.
- Mobile layout keeps finder and status options compact, preserving the already-approved sticky action bar.

## Manual supplier acceptance still needed

1. Sign in on iPhone; import synthetic CSV rows and confirm imported cards are visible and selected.
2. Search by partial title/SKU; confirm counts and no horizontal overflow.
3. Select visible results; save only those. Change filter and confirm prior selection clears.
4. Verify that newly saved products move into the appropriate status view after reload.
5. Confirm an admin hold shifts an otherwise eligible saved card to Needs setup / held without allowing a publication request.
6. Test with VoiceOver/keyboard and verify the search input and status selector are labeled.

Manual authenticated QA is not claimed complete. Keep this change reviewable and separate from the approved main deployment.
