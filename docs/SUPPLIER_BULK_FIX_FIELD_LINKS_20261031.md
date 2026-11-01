# Supplier bulk product setup links — October 31, 2026

## Goal
Make private product-card readiness actionable on iPhone without increasing the size of the previously approved two-column sticky action bar.

## User-facing behavior
The existing collapsed Setup items remaining / Administrator feedback details contains linked missing fields. Each link uses an ordinary fragment identifier and jumps directly to the corresponding editor input on that same product card.
Supported fields: Product name, Unique SKU, Product description, Product category, Saved product image, Purchase price, Active in internal catalog, and Confirmed stock on hand.
Image and stock links lead to the product's private media/inventory panel. When inventory tracking is missing, the panel still explains that it must be resolved in Inventory. The image-picker toggle remains user controlled.
Targets receive a visible focus/target outline and scroll margin; links remain keyboard accessible and wrap on mobile.

## Safety and scope
The link mapping is a pure local whitelist. All targets stay within the authorized supplier bulk workspace. No DB writes, RLS or role changes, release flags, public URLs, payment or checkout changes.
An unsaved local edit still requires Save before image/stock updates and a private publication request. Admin holds/review remain authoritative. This PR neither approves nor publicly publishes anything.

## Acceptance
1. Sign in as a supplier owner/manager with a saved synthetic product missing at least one draft setup field.
2. Expand Status details, select each missing field; verify scroll/focus goes to the correct card and control, not a different product.
3. For missing image or inventory, verify the media panel is the destination. Upload or stock changes still use existing guarded controls.
4. Repeat on iPhone Safari; check no new action-bar height, horizontal scrolling, obscured fields, or broken touch navigation.
5. Change a field without saving: it remains labeled Unsaved edits and Publish stays unavailable.
6. As admin, place a hold; supplier sees reason and can correct details but still cannot publish until approval and a new private request.

CI runs Node unit/source tests, lint, typecheck, build, and disposable PostgreSQL role/security integration. Manual signed-in browser acceptance remains pending.