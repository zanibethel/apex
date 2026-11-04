# Apex PR #209 — Product-first supplier workspace

The iPhone bulk editor now prioritizes managing saved product cards.

## Interface

- Added a compact navigation row with quick links to **Product cards**, **Source import**, **Shared images**, and **CSV import/export**.
- Retained the exact source-import, image reuse, and CSV components and their saving behavior, inside **native collapsed expandable sections**. They remain accessible from keyboard/touch and use a maximum-width mobile layout.
- Kept the saved product cards, search/status filter, pencil editor, product Publish toggle, bulk Save, and all existing preview/publish actions.
- Existing jump-to-bulk-actions shortcut remains available on mobile; the actions still sit below the cards and do not overlap upload fields.
- No customer checkout, stock, pricing, product publishing permissions or database schema changes.

## Acceptance
- On a 390px/430px phone, the product shortcut is visible before the optional source, image and CSV sections, and each expanded section remains within viewport width.
- Source import and image reuse run only when the user explicitly opens the respective section and executes its existing action.
- CSV import can stage changes; the editor remains mounted, and cards/Save selected workflow remain unchanged.
- Mobile bulk action tray stays in normal flow; use the product or action jump shortcut for long lists.
- All existing application/build and RLS security regression checks pass before merging.

The native details panels default collapsed on desktop as well; this reduces clutter but does not remove tools.
