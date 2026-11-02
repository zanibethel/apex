# Apex supplier workspace filters and completion overview — 2026-11-02

## Production baseline verified
Apex currently has 63 private product cards, all 63 have an attached private
image, and all inventory rows have zero stock. A single supplier publishing
preference has been requested; the public release gate is OFF and there are
zero publicly published product rows. Sharing an image across product variants
does **not** independently verify their product identity or public eligibility.

## Improvement
The existing compact supplier workspace now shows a lightweight factual
summary: saved private cards, private images attached, supplier publication
requests, and administrator holds. These counts come from the same
authenticated store-scoped records used by the editor. They are not estimates
based on thumbnails or public visibility claims.

The existing **Show** menu adds:
- **Image corrections / missing**: image missing, changed since review or
  specifically flagged for correction.
- **Admin holds**: any administrative hold/review, including a product with
  its Publish request already checked.
- **Awaiting review**: pending internal product review or outstanding
  supplier correction resubmission.
- **Needs setup / held**: now includes held or image-problem products even
  when a publication request is already saved.

All filters are client-only convenience: they neither change server-side
eligibility nor mutate products, supplier requests, image approval, prices,
stock, checkout, or payout settings.

## Checks
Node tests confirm requested-and-held products never disappear from the
attention or hold filters; counts and saved/unsaved filtering are correct;
search and request changes remain consistent; existing pencil, selection and
Publish controls remain in place. Existing PostgreSQL tenant/RLS tests and
Next build remain mandatory before merge and deployment.

No schema migration or production data write is made in this PR. We do not
claim a real authenticated browser walkthrough has occurred.
