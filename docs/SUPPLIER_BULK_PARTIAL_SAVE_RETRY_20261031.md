# Supplier bulk partial-save recovery — October 31, 2026

## Finding
The private bulk editor allowed saving up to 250 selected cards in sequential, server-limited 20-row chunks. If an item failed or a later chunk stopped, retrying Save selected sent all selected rows again, even previously saved records. This caused redundant updates and could overwrite a colleague's intervening changes on a retry. A truncated server response could also leave an incomplete selection with unclear status.

## Fix
- Compute Save selected targets from **only** newly imported, locally edited, or previously failed selected rows. Unchanged confirmed saved rows remain selected for Preview selected but are never silently re-saved.
- Evaluate each server chunk by its exact submitted keys. Ignore duplicate/unrelated/malformed response records and mark a batch incomplete if any submitted outcome is missing. Stop before sending the next batch.
- Preserve every successfully confirmed product ID and generated SKU; do not mark missing outcomes saved.
- Show a concise count of saved, failed, and not completed changes and instruct the supplier to correct remaining rows and retry. The existing 20-row per-request and 250-row workspace bounds remain unchanged.
- The compact two-column mobile action bar remains the same size, but Save now counts only pending changes.

## Safety
No changes to server-side role checks, product validation, database RLS/SQL, admin hold precedence, the release gate, checkout, or payments. No automatic save or publish behavior. Retrying still requires the supplier's explicit Save selected action.

## Regression checks
- A saved unchanged card remains in Preview selected without being re-submitted.
- 45 selected cards: first 20 has one failure, second 20 succeeds, final 5 are not completed. The next save only retries the failed and unattempted 6.
- Partial, duplicate, and foreign response keys never count as successful row confirmations.
- Confirmed generated SKU/IDs and other successful row values survive reconciliation.
- CI: lint, TypeScript, Node unit/source tests, Next.js production build and isolated Postgres RLS test.

## iPhone browser acceptance still required
1. Sign in as owner/manager; import 25–45 synthetic private products, including one deliberate invalid amount.
2. Select and Save. Verify successful/failed counts and per-product messages without horizontal overflow.
3. Correct the invalid amount, Save again; verify only unsuccessful items are retried while all saved selections remain available for Preview selected.
4. Reload and verify every confirmed product has exactly one saved SKU, title, cost/price, category and description; no duplicates.
5. Verify Save is disabled when all selected cards are already saved, but Preview selected remains available.
6. Confirm no public product activation, checkout or payments. Record sanitized screenshots and exact account role/device.

Manual real-device and authenticated browser QA are not claimed complete. Do not use live customer data or real product sales in this acceptance pass.