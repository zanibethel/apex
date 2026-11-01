# Supplier multi-product persistence acceptance — October 31, 2026

## Evidence this pass adds
Two separate disposable-PostgreSQL CI connections provide a reproducible, synthetic supplier save/reload boundary. The first acts as an authorized supplier manager to create 25 private draft products, save their SKU, name, description, purchase price, compare-at price, private cost, active flag and on-hand inventory, and COMMIT. The second opens a new connection as the same manager and reads every record back, checking the stored values against expected rows.

The fresh connection also tests RLS/visibility from a different supplier, same-supplier staff and anonymous roles. It confirms no private product is publicly visible and that authenticated suppliers cannot update is_published.

## What this does not prove
- This tests actual Postgres persistence and RLS on the same schema/fixtures as the current application, but does not call Next.js server actions or interact with a browser.
- It does not reproduce Vercel Authentication, iPhone Safari, image picker, actual authenticated session reload, or a slow network connection.
- It does not mutate hosted Supabase, supplier-owned products, customer profiles, orders, wallet destinations or payment settings.
- It does not prove authorization to offer or sell any product publicly; existing private release remains disabled.

## Remaining iPhone walkthrough
1. Sign in as supplier owner/manager, open `/supplier/catalog/bulk` on an actual iPhone.
2. Download the CSV template, import 25 synthetic items (with one blank SKU), and inspect offer cards.
3. Save selected and confirm result counts and generated SKUs.
4. Edit multiple saved rows, auto-select, save again, and fully reload the page. Compare name, SKU, description, category, source cost, price and compare-at price against submitted values.
5. Add/reuse an image and stock for two saved items and verify persistence after a full browser reload.
6. Test partial failure with an invalid price: fix, retry only unfinished, then preview all saved selection. Confirm zero public visibility and no checkout.
7. Check no mobile overflow, keyboard/touch hit targets, and role isolation. Save sanitized screenshots/repro notes.

## PR merge rule
Do not merge this test-only PR until lint, TypeScript, unit/source tests, Next.js build, and CI's disposable PostgreSQL integration (including the two separate connections) are green. Manual real-device acceptance remains explicitly pending.