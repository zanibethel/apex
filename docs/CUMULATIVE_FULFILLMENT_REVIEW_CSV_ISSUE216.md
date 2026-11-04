# Apex Issue #216 — Cumulative supplier fulfillment review CSV (Phase 1)

**Status: review-only.** Stacked on PR #237 → #236 → #235 → #234 → #233 → #232 → #231 → #230 → #229 → #228 → #227. None merged, no production migrations or shipment/payment enabled.

## Keep sales review and fulfillment distinct

The existing /supplier/reports/daily is a prior-day sales summary. The existing /supplier/reports/reconcile edits **sales review** annotations, not physical fulfillment. The new /supplier/reports/fulfillment reads the current authenticated, supplier-scoped held-order queue. It paginates to a complete snapshot up to 100 original orders/1,000 CSV rows, rejects a truncated/changed/cross-store/duplicated source, and never guesses unavailable original order details. A transaction-consistent historic snapshot and larger streams require additional database source work.

The report includes stable order IDs, original purchase UTC timestamps, original line number/SKU/title, purchased/planned/unplanned quantity, shipment plan stable IDs, references, current revisions, and latest **tracking draft** only. It contains no recipient, address, phone, email, destination ciphertext, decryption key, carrier label or payment credential. Formula-like cells are escaped.

## Cumulative workflow

Orders carry forward under the same canonical identity. A new-today count uses the original purchase date in America/Chicago; earlier dates are carried forward. Partially planned means some original items are still unplanned; fully planned means planning is complete, **not** shipped or delivered. Incomplete held records expose no item/quantity detail. Shipped and completed counts remain zero/not verifiable without approved real shipment evidence.

CSV row kinds are incomplete_order, order_line (unique original order ID + line number), and shipment_plan (unique original order ID + shipment plan ID). Every field is immutable except **review_state** (unreviewed, reviewed, needs_attention) and **review_note** (maximum 240 chars). Notes must not include personal delivery information. Neither editable field authorizes shipping.

## CSV preview and conflict report

The upload area validates a selected CSV **locally without saving**. It checks exact header, store ID, source order/line/plan identity, immutable values and current shipment-plan revision. Identical repeated rows are counted once; conflicting duplicates are rejected. Unknown rows and stale revisions are rejected. The entire preview is rejected if any row conflicts, and a downloadable metadata-only error CSV lists record keys, input line numbers and conflict codes.

The source-only function applyCumulativeReviewPreviewLocally is for deterministic simulation/testing of idempotent overlap; the supplier UI does not provide save/apply-to-server.

**Critical limitation:** This is a local import preview, **not** a durable supplier dashboard upload/sync. No production import RPC, receipt audit, file storage, scheduled email, carrier/label action or actual order writer has been added. A separate, reviewed atomic persistence step will require verified original purchase source, supplier authorization, immutable history, optimistic locking and transaction replay.

## Verification and follow-ups

Node tests cover 20 orders overlapping Day 3/Day 4, 10 stale plan edits, no duplicate orders/plan IDs, exact local replay with no extra records, immutable tampering, cross-store rejection, malformed and conflicting duplicates, incomplete source blocking and CSV spreadsheet formula protection. GitHub application checks and Vercel preview must pass before review. Production remains gated.

Issue #217 email attachment is a later approval: secure supplier-specific access to complete order reports, verified opt-in, scheduling, deduplication and provider delivery monitoring. Shipping addresses must remain outside ordinary email and accessible only through separately approved protected expiring access.
