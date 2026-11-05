# Apex live prelaunch SKU-edit permission — applied and verified (2026-10-31)

**Existing Supabase project:** `fhqpkpztercadcxspdkg`; no additional Supabase database or branch created.

**Hosted migration:** `20261031174113` / `enable_private_draft_sku_edit`.

**Repository migration:** `supabase/migrations/20261031174113_enable_private_draft_sku_edit.sql` is an exact capture of the transaction applied via the connected Supabase migration tool. This migration should **not** be replayed against the already-updated hosted database.

Permission change: `GRANT UPDATE (sku) ON public.products TO authenticated`. The existing `supplier_draft_products_update` RLS policy remains unchanged and requires the actor to belong to the **owner/manager** role of the same **private store**, with `is_published=false` on both old and new row versions. The server action independently verifies membership and the draft status. Existing unique `(store_id,sku)` constraint continues to reject duplicates.

**After-state readback:**
- Authenticated SKU update column privilege: YES.
- Anonymous SKU update privilege: NO.
- Authenticated publish and store reassignment column privileges: NO.
- Products RLS enabled; only pre-existing owner/manager private-draft update policy present.
- One existing private product, zero published products, one attached private image. No product contents were modified by the migration.
- Supabase security advisor still flags the pre-existing payout draft SECURITY DEFINER RPC and leaked-password protection disabled; no new advisor findings were added.

**Client code:** PR #72 was already merged and deployed to `apexanabolics.co`. New private drafts get an automatic SKU if blank; existing drafts expose an editable SKU input. Manual authenticated browser QA (editing the current draft SKU, saving, reloading and verifying the image/stock remain attached) is still needed.

**Migration provenance:** Older hosted payout migration timestamps differ from checked-in migration filenames. Do not blindly run `supabase db push` or `db reset` against the live project; reconcile historical migrations before automated replay.

**Publication remains separate:** This permission does not publish products, make the store public, or enable checkout, payment or fulfillment.
