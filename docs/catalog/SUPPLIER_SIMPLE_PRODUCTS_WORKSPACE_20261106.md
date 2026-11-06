# Apex simple supplier Products workspace — November 6, 2026

## One everyday destination
Use /supplier → **Manage products** → /supplier/products.

This is a compact, Shopify-like organization based on Shopify's product search/list/details workflow. Two clear collections are currently kept separate because their product identifiers are not yet authoritatively reconciled:

- **Supplier list — 76 product cards, 168 staged option rows**. Each source parent is one card. In-card selection switches exact private retail prices. The 17 ingredient/formula entries display their full composition. The 11 options across five unclear source rows are held; no guessed price. Suppliers review content with existing **Approve / Needs Changes** controls, within this page.
- **Saved products — 63 existing private product records**. Search by name or SKU, filter by status, and open one **Edit product** screen for title, description, saved SKU, price and photo Add/Replace/Reuse. Reuses existing server-validated write actions and supplier membership checks; no new privileged editing authority.

The supplier home now makes Products the primary action. Older bulk, CSV, specialized image, legacy import, shipping and other controls remain reachable in **More tools and settings**, hidden by default; nothing is deleted.

## What supplier self-service means

Supplier owner/manager may edit private product details or request publication using existing write contracts, without routine administrative content approval for each draft edit. Do NOT auto-approve a source sheet or use staged source rows as real product SKUs. The existing administrative hold, required product eligibility, approved public image, active publication switch, and checkout release controls are independent and must remain enforced.

**Important:** 76 supplier-sheet parents are staged review cards, **not yet** 76 new public.products rows. The private 63 existing products are separate. Do not double the supplier's actual retail prices, make up source cost, invent on-hand quantities or create duplicate products. Direct editing of a source parent (especially per-variant price) will require a reviewed authoritative parent/option identity and controlled draft import/reconciliation; this change is a unified access/UI step, not that migration.

## QA
1. Owner/manager sign-in → /supplier/products. Confirm 76 source cards / 63 saved products / 168 exact staged options, no foreign tenant data.
2. Search a parent name, oil or full blend composition. Switch option; selected private retail price updates. The review state/held options remain intact.
3. Filter Supplier list → Needs attention. Five unresolved parents appear. Approve remains unavailable for held parents, but Needs Changes may be submitted with a note.
4. Filter Saved products → Draft / Publish requested / Admin holds, and open Edit product. Confirm independent name/description/price/stock configuration and existing Add/Replace/Reuse image controls.
5. Confirm no actions directly modify publication, price, inventory, checkout, shipping or private costs when viewing the list.
6. Confirm main supplier dashboard presents Products prominently and keeps advanced utilities inside a collapsed section.
7. Run exact-head npm test, lint, typecheck, build, integration and Vercel preview. Keep product publication and payment gates unchanged.

## Explicit next phase
- Reconcile parent names and source options against the 63 saved IDs, flag genuine new parents vs duplicates. Only five normalized parent names currently overlap seven saved product records; not authoritative.
- Build safe private parent/variant draft mapping and edit controls for the 76 source parents. Supplier can then update per-variant prices and inventory with stable IDs from one card.
- Keep legal/regulatory checks distinct from ordinary supplier data editing. Do not activate checkout automatically.
