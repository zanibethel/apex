# Apex — single shared supplier storefront (October 30, 2026)

## Decision
During the first launch phase, Apex has **ONE supplier entity and ONE storefront**. Lily and Tierra are operators of the same storefront, not two suppliers with separate product catalogs.

## Verified hosted Supabase changes
- Preserved Lily's supplier membership as `owner`.
- Removed the unused, empty Tierra-only draft supplier/store.
- Kept the original Lily supplier/store IDs while renaming their internal slugs to `apex-shared-initial` and `apex-shared-store-draft`.
- Store display label is `Apex Storefront (Draft)`; `is_public = false`.
- User `wheeliejacked@apexanabolics.co` has trusted `app_metadata.apex_role=platform_admin` and no supplier membership.
- User `missapex@apexanabolics.co` has no platform admin role and is the owner member of the ONE supplier.
- Tierra's Supabase Auth account has **not yet been created**. Once her correct email and identity are verified, add a membership for that existing `apex-shared-initial` supplier ID; do not insert a new supplier or store.

## Email clarification
The latest email provided was `tnassty@alexanabolics.co`. Earlier references used `tnasty@apexanabolics.co`. These have different local parts AND different domains. Do not guess, create users, send invitations, or link any role until Tierra confirms the exact mailbox.

## Authorization / dashboard
- Apex admin checks the trusted Supabase Auth app metadata role on the server.
- Supplier dashboard queries `supplier_memberships` via RLS and scopes the shared `stores`, `products`, `categories`, `inventory_items` queries to the member's supplier ID and store IDs.
- Any two verified Auth identities with memberships referencing the same supplier ID see the same underlying catalog and inventory.
- No public catalog publishing, product writes, purchases, orders, or payment functions are enabled by this pass.
- Later multi-supplier architecture remains possible: add a second supplier/store only when a genuinely distinct business joins.

## Follow-up
1. Confirm Tierra's actual email and create/verify her Auth user in the dedicated Apex Supabase project.
2. Assign Tierra a membership to the **existing** Apex shared supplier ID, without a platform admin role.
3. Test both supplier logins and same-store visibility; test that a non-member is denied.
4. Review/merge PR chain and only then plan tested production release.
