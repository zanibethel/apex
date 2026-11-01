# Supplier bulk-save failure review — October 31, 2026

## Goal
After a 20-row chunk partially fails during a large supplier CSV or multi-product edit, immediately show the exact cards that still require correction or retry. Keep confirmed saved cards selected for future previews, but do not re-submit them unnecessarily.

## Behavior
- From the exact keys submitted to Save selected, compute unfinished keys by subtracting ONLY outcomes with ok=true and a confirmed persistent product ID.
- If any keys remain, clear current search, switch to a dedicated Fix / retry saves filter and show only these cards; preserve the existing global selection set.
- Provide an accessible link to the filtered product cards and an explicit Show unfinished button if suppliers navigate away.
- After the remaining cards save successfully, clear retry keys, return the status filter to All products, and restore access to the full saved selection for Preview selected.
- A new CSV upload resets stale retry keys, its search and status filter, then selects the newly imported cards.
- This is a local UI-only review aid. Status changes or missing responses never automatically grant publication.

## Safety
No hosted database writes, schema changes, new permissions, public visibility, payment/checkout changes or changes to server-side ownership, admin hold and review RPCs. The existing 20-row batch ceiling and explicit Save selected / private Publish actions are unchanged.

## CI acceptance
- Synthetic 45-row save with one failure and 5 unattempted rows shows exactly 6 unfinished cards; completed 39 stay selected but hidden until All products is chosen.
- All success outcomes require both ok and a confirmed persisted ID.
- Missing server responses remain eligible for explicit retry rather than appearing saved.
- Unrelated products are excluded by the exact submitted key set. Existing title/SKU and readiness filters continue to work.
- Lint, typecheck, Node tests, Next.js build, isolated PostgreSQL security integration must pass on the exact PR head.

## Manual iPhone acceptance still pending
1. Sign in as an authorized supplier owner/manager; use synthetic products, not real customer or payment data.
2. Select 25–45 CSV rows, intentionally include one invalid product field, and save.
3. Confirm only failed and unfinished cards remain in the filtered view; follow Jump to product cards and correct each error.
4. Save remaining cards. Confirm the full selection is once again previewable and previously saved product IDs/SKUs remain unique after reload.
5. Verify the recovery hints do not overlap the fixed mobile toolbar and that no public product listing was activated.

No authenticated browser or real-device test has been performed as part of this PR.