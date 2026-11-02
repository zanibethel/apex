# Bulk reference image for 63 private Apex product cards — 2026-11-02

## Current hosted data verified
The Apex supplier storefront now contains **63** imported private product records,
all with an internal source link, and currently has **one** actual uploaded
private storage image, attached to **5-Amino-1 MQ — 5 MG**. The other **62**
private products have no image. The catalog's public release gate is OFF.

## Workflow
Supplier opens `/supplier/catalog/bulk`, sees the section **Use the same
image for all private products** above the editor, and selects the already
uploaded source image (auto-selected when only one exists). Clicks **Apply
image to 62 products** once. Each source is read once using the authenticated
supplier browser session; every other product receives a distinct newly
authorized private storage object and a separately checked product image
attachment. Progress, failures, and retry instructions are shown inline.

- The action defaults to **missing images only**, preserving the existing
  reference image and any future unique photos.
- Retrying after refresh only processes cards still missing an attached image.
- Existing image permission actions check store membership, private product
  status, exact object path and existence before the link is saved.
- No shared storage paths or direct metadata-only copies: a product's image path
  must start with its own `<store>/<product>/` prefix.
- Stop if the source image changes, to prevent a single batch from distributing
  mixed photos.
- The copy queue is bounded to the existing 250-card private editor limit and
  runs up to three browser operations concurrently.
- No server-level service key, new database migration, public bucket, public
  image URL, or email/image rights approval is required for this **private
  draft-only** operation.

## Important
A shared image is a **private layout placeholder**. It does not verify the
physical product identity, the correct vial label or concentration, the image
rights, or lawful eligibility to advertise and sell. Each product still needs
independent product-specific review for a consumer-facing listing. No public
product may be released based on this mass image application.

## Verification and limitations
Node tests simulate all 62 transfers and cover storage errors, retries,
authorization API use and source-image swaps. Exact-head CI and Vercel preview
must pass before merge.

The connected tools can read database rows and inspect storage metadata but
cannot directly perform the **authenticated private storage blob copy** on the
supplier's behalf without the supplier session. This is intentionally a
single button the authorized supplier can run in the live web app, not a
privileged database mutation that falsely references nonexistent files.

No product inventory, source costs, SKUs, prices, category, active flags,
publish requests or public release gates change.
