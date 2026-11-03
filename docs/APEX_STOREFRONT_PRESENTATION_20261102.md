# PR #176 — Final-storefront presentation without public checkout simulation

**November 2, 2026.** This pass is a customer-facing presentation and protected admin-preview change. It does not create an order, enable crypto payments, change hosted database publication settings, bypass admin holds or apply SQL migrations.

## Customer experience

- Replace *concept preview* headings and demo-first navigation with normal Apex Anabolics brand, catalog browsing and account links.
- Hide demo cart and mock checkout controls from customers even when an internal checkout test environment variable is present. The legacy interactive checkout test route now revalidates a signed-in `platform_admin` role server-side and 404s for the public; it remains an internal design exercise, not a payment facility.
- Keep product listings, descriptions and prices sourced only from the existing explicitly enabled, RLS-safe, public sold-out projection. The fallback state now says simply **No products available right now** and does not expose private supplier records or unfinished release steps to customers.
- State actual capability accurately: **Checkout is currently unavailable**. Do not label the public brand a fictional store, invent settlement or expose simulated checkout confirmation steps as a real purchase.
- The common Apex offer tile uses the approved Apex logo asset as a fallback when no authorized product image is available.

## Supplier + admin experience

- The supplier publishing UI says **Publish / Unpublish**, with direct toggle-style language and an honest protected storefront status. The RPC still saves the supplier preference and honors administrator holds. A checked toggle does **not** override the independently verified release gate.
- New `/admin/storefront-preview` view displays **actual authenticated product records** in the customer-facing tile layout: real product names, descriptions, catalog prices, authorized private signed image previews (90-second URLs) and available stock when accessible. It uses the normal cookie-bound Supabase client, revalidates the trusted admin role, and has no service-role keys, public image exposure, checkout actions or product mutations. A category or stock read denial does not create fake values.
- This allows design adjustments against the existing catalog instead of manufactured test merchandise. The dashboard links to the real-data preview and supplier management controls.

## Why 63 products are not being automatically published

A read-only inspection of hosted Apex data on November 2 showed: one private store; 63 stored products all with zero on-hand stock; zero `is_published` products; zero published categories; no verified supplier/product release authorizations; global public release gate off. Merely changing CSS/labels or setting `stores.is_public=true` would conflict with the current private editor assumptions and could expose unreviewed data. This PR **does not claim** to turn those records into public products.

A separate publication-release pass must review authorization records and adapt the supplier editor for public stores, approve categories/images, test independently verified catalog release, then expose only allowed items. That must not enable live checkout or remove the administrator's ability to hold a listing.

## Merge gate

Require latest exact PR-head app lint/typecheck/unit/build, isolated PostgreSQL security/integration, and Vercel preview checks. Keep no-index until a separate public storefront indexing decision. No production payment or migration changes.
