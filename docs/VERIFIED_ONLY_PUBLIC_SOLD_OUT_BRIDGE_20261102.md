# Apex verified-only storefront visibility bridge — 2026-11-02

## Scope
The supplier still uses a card-level **Publish** toggle or bulk publish. That
switch currently persists a private, audited publication preference. This pass
prepares a **read-only public SOLD OUT catalog projection**, gated by independent
legal eligibility and globally disabled by default. This PR does not implement
live purchasing, payment routing, inventory exposure, a cart, or consumer image
distribution.

## Eligibility
The public RPC returns a product only when:
- global private release gate has independently been enabled by a separately
  reviewed migration (the current database constraint **forbids** this);
- a supplier has requested the listing and no admin hold, correction request,
  same-supplier identity hold or unresolved product content review exists;
- supplier AND product release authorizations are verified, current, and
  backed by named reviewer, timestamp and evidence reference;
- any linked source record has passed source identity review;
- product name, SKU, description, image record, published category, and price
  are present; inactive listings are excluded;
- inventory record is valid, **including zero stock**.

Even an item with inventory is labeled **Sold Out** and cannot be purchased.
Supplier cost, internal inventory counts, private image paths, wallet data
and *provisional* compare-at prices never leave the projection.

## UI and claims
- Read-only catalog is paged in groups of 24 (up to page 417).
- The provisional 2.5× compare-at amount is retained in private editing
  but removed from the current shared offer tile's strikethrough/%-OFF UI;
  it is not a verified historical or market discount.
- Customer images still have placeholders because authenticated private
  supplier media must not be exposed via signed URLs. Public asset
  verification/replication is a future, separately approved step.

## Compliance and rollout
FDA warning letters to peptide sellers in 2026 say the words "research use
only" do not automatically legalize consumer-directed promotional drug
claims. Do not flip the public release gate or use this work to promote
unapproved drug products. Counsel should verify product classifications,
intended use, authorized channels, labeling and advertising before activation.
FTC 16 CFR 233 also addresses fictitious former price comparisons.

The file `database/sql/apex_verified_only_sold_out_feed_REVIEW_ONLY.sql`
is a **read-only RPC migration**. It leaves the structural release gate OFF.
The web feed additionally requires the server-only
`APEX_PUBLIC_SOLD_OUT_CATALOG=enabled` flag, which is **not set** here.

Disposable CI temporarily drops the OFF-only check inside a rolled-back
transaction to test the eligibility projection. Never do that in production.
A later public-activation pass must separately verify legal status, media,
end-to-end supplier toggles/admin overrides, live status reporting and
revocation behavior before any actual customer exposure.
