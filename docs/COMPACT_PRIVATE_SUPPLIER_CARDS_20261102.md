# Compact private supplier product cards — 2026-11-02

## Requested adjustment
The product-manager cards looked oversized and images looked zoomed in,
particularly on mobile. Make cards feel closer to a compact product catalog
without shrinking touch controls, hiding private-public status, or affecting
actual customer-facing pages.

## Changes
- Decrease private bulk-card padding and gaps.
- Reduce the default offer-image preview to **136px** (desktop/tablet) and
  **124px** (phone). Keep image within **70%** of the frame width
  (**65%** on phones) and within 82% of the frame height.
  Continue to use `object-fit:contain`; never crop the product.
- Make preview copy, title, prices, supporting labels and captions smaller,
  with a maximum 2-line description within the private card.
- On wider screens (at least 1120px), show 2 collapsed cards per row.
  A card with an open pencil editor, or a new unsaved card with automatic
  editing, spans both columns so fields, media picker, and stock inputs are not
  compressed.
- On phones, keep one card per row, readable status, and 40px+ edit control /
  44px full-preview action.
- No changes to `OfferTile` itself, customer catalog CSS, image storage,
  databases, pricing, inventory, product approvals, or publication rules.

## Verification
Node layout-contract tests verify responsive breakpoints, private scoping,
no cropping, full-width editing, and intact checkbox/edit/Publish controls.
GitHub lint, typechecking, Node tests, Next production build, existing
PostgreSQL RLS integration suite, and Vercel preview must pass before merge.
A manual signed-in browser visual review remains useful because CSS unit tests
cannot simulate every physical screen and font size.
