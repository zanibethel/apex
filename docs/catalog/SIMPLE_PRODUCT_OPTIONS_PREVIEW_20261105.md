# Simple product options — review-only preview

**Scope:** Issue #286. A small mobile-first option picker, not a supplier import, inventory migration, product publication or checkout integration.

## Try it

1. Sign in as a verified Apex platform administrator.
2. Open \`/admin/fulfillment-qa\` and find **Try the product dropdowns** near the top.
3. Change **Carrier oil**, **Strength** and **Size**. Only combinations in the supplied test fixture can be selected; the **selected retail price** changes automatically.
4. Try changing from MCT / 200 mg to GSO. There is no 200 mg GSO sample; the selector moves to the first actually supported GSO variant instead of inventing one.
5. The button remains **Checkout unavailable**. No cart item, order, wallet, stock quantity, supplier product or database field is changed.

## Rules for the eventual real catalog

- Include a dropdown only when that dimension has multiple applicable choices; one fixed attribute is shown plainly.
- The authoritative input must be an independently approved, public-safe **variant** list (distinct stable IDs and retail cents), not raw supplier spreadsheets or inferred combinations.
- Keep private supplier product costs, unverified quantities, and raw wholesale workbook data outside the public UI.
- Select exactly one valid variant; never multiply product strength, carrier and volume ranges into imagined SKUs.
- Live availability, product-level publication, variant-aware cart/order handoff and supplier editor remain **separate later implementation steps**. The current public projection only exposes a single product/price, so this preview does not enable variants in the actual public product detail.
- Preserve the existing Add / Change / Reuse image workflow. No new media approvals or extra supplier clicks in this PR.

## Verification

Run \`node --test tests/product-option-picker-v1.test.mjs\`, \`npm run check\`, GitHub exact-head quality/RLS and Vercel preview verification before merge. Synthetic option prices are generic examples and not the supplier's values.
