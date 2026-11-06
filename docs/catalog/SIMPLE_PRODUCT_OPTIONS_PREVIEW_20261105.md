# Simple product cards with variants — read-only admin preview

**Scope:** Issue #286. One card per product. Variants are inside the card, not separate catalog cards.

## Test in Apex
1. Sign in as a verified platform admin.
2. Open `/admin/fulfillment-qa` and find **Try the product cards**.
3. **Sample Product A** has five exact sample combinations in ONE product card. Change the single **Choose option** dropdown (oil / strength / size); the price changes on that same card.
4. **Sample Product B** has one option and displays its price directly, without an unnecessary selector.
5. On mobile, cards stay compact; there is no extra overlay, modal or supplier action to switch an option.

The values are synthetic demonstrations, not supplier prices. Both cards are non-orderable. This preview changes **no** product, SKU, stock, checkout, payment, delivery, public publication or inventory record.

## Connection to real product cards (later)
- Only render dropdowns for options that actually exist and are independently approved.
- Keep one parent listing, one image, one description and a stable identity. Each real saleable option retains its own separate SKU, price and stock for the future variant-aware cart/order contract.
- Current public product feed provides one product ID and one price, not verified variant rows. Do **not** synthesize options from title text or upload the private supplier workbook to the public repo.
- Preserve existing product image Add / Change / Reuse UI and supplier/admin publish/hold controls. No extra approval step just to change a draft.
- Real variant storage/read projection, Lily workbook reconciliation and checkout identity are separate work under #286.

## Verification
Run `node --test tests/product-option-picker-v1.test.mjs tests/compact-variant-card.test.mjs`, then `npm run check`, exact-head RLS, GitHub CI and Vercel preview. Do not merge if checks are incomplete or failing.
