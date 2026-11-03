# Apex PR #177 — Verified Sold Out publication and admin release board

**November 2, 2026.** This is a reviewable release infrastructure pass, not a customer checkout launch, regulator determination, product approval, wallet activation, or payment migration.

## Product-manager behavior

Suppliers continue using the existing **Publish / Unpublish** switches and bulk-selection controls. The backend persists an audited supplier setting only, subject to administrator holds. When the release gate and independently verified eligibility are in place, that single setting can make an eligible zero-stock item appear publicly as **Sold Out**; Unpublish and administrator Hold immediately remove it from the read-only public projection. A customer cannot create an invoice or purchase through this release.

To prevent contradictory status displays, the proposed SQL migration defines **one internal eligibility predicate** for both the public read-only feed and the signed-in supplier/admin release verdict. A product is public only when all of these hold simultaneously:

- The global public gallery gate is open by a separately authorized database change, **never by the supplier or this migration**.
- The supplier has opted into Publish and has no administrator hold, republish review or same-supplier identity restriction.
- The product remains in its editable private base store, with complete required product metadata, active state, valid USD retail price, an associated published category, and a saved image reference.
- Current inventory reads exactly **zero on hand and zero reserved**, so the label Sold Out is truthful.
- Its supplier and its specific product have **independent, unexpired verified release records** containing reviewer identity, review timestamp and evidence reference. No placeholder evidence is inserted.
- A pending/changes-requested content review or an unapproved source import excludes the product.

The anonymous projection has exactly seven allowed keys (ID, title, description, USD price, currency, Sold Out availability and `can_checkout=false`). It exposes no supplier costs, wallets, category/customer private data, exact inventory, private image paths or checkout links.

## Admin experience

A new private, verified-admin page, `/admin/catalog-release`, is linked from the existing admin Control Room. It shows real product records, supplier Publish on/off, category status, stock, product setup and a per-product **server-evaluated** visibility verdict. A checked Publish toggle never counts as a publicly visible item. It remains read-only with bounded queries, no service-role credentials, no product mutation and no approval buttons that could self-certify eligibility.

The private verdict recognizes `public_visible`, `category_not_published`, `inventory_not_sold_out`, `public_release_disabled`, administrative restrictions and missing supplier/product authorizations. The supplier's "Live · sold out" status requires all positive server checks.

## Where the database is right now

Live data at audit time showed 63 zero-stock product records but only one product with active complete metadata, one supplier Publish setting on, an outstanding content-review hold, no published category, no verified supplier/product release records and a structurally disabled global release gate. These are real blockers. This PR **does not invent approval records or enable the gate** to force public output.

The new file `database/sql/apex_verified_soldout_release_activation_REVIEW_ONLY.sql` is specifically a staged, owner-reviewed migration. It removes the structural impossibility constraint, but deliberately leaves `enabled=false` and performs no public content changes. **It is NOT automatically included in hosted Supabase migrations or applied by the PR.** Applying this SQL to a real database is a separate, intentional authorization decision after eligible content and release evidence exist.

## Tests and rollout

CI uses disposable PostgreSQL: first checks the original hard-off release gate, then installs synthetic reviewed evidence and the staged migration. In that *test database only*, it opens the gate and confirms a public seven-field Sold Out record plus matching authenticated private verdict, then tests supplier Unpublish, admin Hold and reapproval lock, category unpublish, positive stock, expired/missing approval evidence, content review, identity holds, unapproved imports and gate shutdown. Production release settings and Bitcoin operations are never touched.

Before actual public activation, the owner must independently validate real supplier/product eligibility evidence, published categories, approved product imagery, and outstanding moderation. The global gate must then be enabled with an audited authorized database change, and `APEX_PUBLIC_SOLD_OUT_CATALOG` must be deliberately configured after an endpoint smoke test. **Neither the UI-only PR nor the test gate flip does any of those things.** The existing Next.js feature flag also remains off.

The repository still retains its older read-only gallery function for historical regression. New authorization enforcement is centralized in this review-only migration and cannot make an unauthorized product appear through the existing public route. No live order/payout activation or customer checkout changes.
