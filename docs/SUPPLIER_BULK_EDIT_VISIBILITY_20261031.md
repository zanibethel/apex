# Apex supplier bulk editing visibility and save selection — October 31, 2026

## Finding
After PR #94, a supplier could follow a Missing setup link to a field, make an edit, and still have **Save selected** disabled because the edited card was not selected. A status-filtered card could also disappear on its first edit when `needsSave` changed. Editing a searched product's name/SKU could remove the card from the current search.

## Correction
- Whenever an authorized supplier edits a field, automatically add that product to the existing selected set. Keep any other selected rows.
- When editing, return the status filter to All products so the card remains mounted and editable.
- When editing name or SKU, clear a text query that could stop matching the edited title/SKU. When editing other fields, retain the query.
- Existing `Save selected`, 20-row chunking, server-side ownership/auth checks and admin holds are untouched. The UI does not auto-save, auto-publish or change RLS.

## Tests
- Pure regression for the old disappearing-row behavior under Ready to request filtering.
- Query clearing for name/SKU edits; preservation for non-search fields.
- Selection idempotence, multiple selected card retention and source integration.
- Existing Next.js quality CI and isolated Postgres RLS integration must pass.

## Manual iPhone acceptance
1. On a saved private product, apply Ready to request or Needs setup/held status filter and expand its missing setup checklist.
2. Tap the missing Description or Price link, begin editing, and confirm the product stays visible even as status changes to Unsaved edits.
3. Confirm Save selected displays the changed product without manually finding its checkbox.
4. Search by title/SKU, edit that title/SKU; confirm the search clears and the card remains visible and editable.
5. Select several cards and edit another; confirm prior selections are retained and only chosen rows are saved.
6. Confirm no save or publication occurs without explicit action; holds and admin reviews still block private requests.

Manual authenticated real-device QA is not completed by this code change. No hosted Supabase records were changed.