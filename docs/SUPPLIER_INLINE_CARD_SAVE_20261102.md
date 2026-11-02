# Supplier card inline Save — November 2, 2026

## Verified baseline
On the hosted Apex private supplier store all 63 imported product records have
**actual storage objects** in the private draft image bucket, not just linked
paths. All 63 on-hand and reserved inventories are zero, public release remains
OFF and no product is publicly published.

## User experience
A supplier opens the existing pencil editor on a saved or unsaved product card.
Once the product fields change, a **Save changes** button appears next to
Preview single / Remove unsaved inside that SAME card. This lets suppliers
save one edited product without scrolling to or selecting the global bulk
toolbar. The existing **Save selected** still works for 1–250 selected items in
20-item server batches; no new server write endpoint has been added.

Both actions use the previously implemented authenticated
`saveBulkProductDrafts` and the original validated `updateDraftProduct` /
`createDraftProduct` path. This preserves store membership checks, SKU
uniqueness, source cost protection, private-only edits and current price
validation. Saving does not change inventory, public release or listing intent.

## Failure isolation
- Saving one card never saves any other checked or edited card.
- A failed or missing server response displays an explicit inline retry reason.
- An individual save keeps the edited card open instead of switching to a
  global failure filter.
- Existing failed rows from other bulk attempts remain in the retry queue.
- Newer edits made while a response is in flight remain marked unsaved.
- Only an acknowledged saved product ID can clear the unsaved flag.

## Tests
Node tests exercise single-card isolation, stale save responses, missing
results, retry preservation, editor controls and unchanged server enforcement.
The existing disposable PostgreSQL full private supplier workflow now
additionally tests inventory expected-count compare-and-swap and cross-supplier
denial, resetting stock to zero within the rolled-back transaction. No
production inventory is changed.

**Limitation:** Browser-level testing using Lily/Tierra's authenticated
sessions is still outstanding. The above tests do not impersonate real users.
