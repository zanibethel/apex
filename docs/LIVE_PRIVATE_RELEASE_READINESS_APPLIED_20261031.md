# Apex — Applied Private Release Decision Engine (2026-10-31)

**Existing production Supabase project:** `fhqpkpztercadcxspdkg`. No new hosted database or Supabase test branch was created.

- Feature source: [PR #82](https://github.com/zanibethel/apex/pull/82), merged as commit `b4bbae511e412ae6572291ef8b7192e751058d41`.
- Hosted migration: **`20261031201137`**, name **`private_release_readiness_identity_holds`**; applied once.
- Exact SQL captured in `supabase/migrations/20261031201137_private_release_readiness_identity_holds.sql`, plus non-executable advisory header.
- **Do not reapply this migration**. The live migration history differs from some older checked-in payout filenames; no blind `supabase db push` or reset.

## Immediate post-application read-only validation

- The private public-release gate contains exactly **one disabled record** and no enabled record.
- The four newly added `apex_internal` tables have RLS enabled; authorization tables contain **zero** verified supplier/product rows. Staff/suppliers have no permission to update those authorizations directly.
- The private readiness RPC is callable only by authenticated users and re-checks supplier owner/manager membership or server-controlled platform admin authorization. Anonymous EXECUTE is revoked.
- Both identity-hold triggers exist. There were zero active identity holds when migration was applied because the existing product did not have an admin hold.
- The existing listing control and three listing audit events were retained, as was the one approved internal product review.
- **Zero products published and zero public stores**; authenticated accounts still cannot update `products.is_published` or `stores.is_public`.
- Supabase security advisor flags INFO "RLS enabled, no policy" on these four intentionally private tables; this is deliberate fail-closed protection. Advisor also notes signed-in, security-definer RPCs, which require continued role/privilege audit and regression testing.

## Acceptance checklist

1. Supplier opens `/supplier/catalog`: beneath supplier publication preference, **Effective release decision** should be shown, with a concrete private restriction such as supplier/product authorization unverified or supplier not requested. A failed RPC displays "Decision unavailable" and must not imply publication eligibility.
2. Platform admin opens `/admin/listing-controls`: each submitted product shows the authoritative database release decision. An administrative hold must take priority over supplier intent.
3. For safe further testing, use a separately authorized synthetic private product or isolated disposable CI fixtures rather than changing the real approved listing. Verify clone attempts with equivalent normalized names cannot bypass a same-supplier admin hold.
4. Verify no product/store is publicly published or made sellable and no private draft image is accessible anonymously.

**CI verification:** [PR-triggered GitHub Actions](https://github.com/zanibethel/apex/actions/runs/41237304781) passed application and disposable PostgreSQL security tests at the exact merged feature SHA. This is **not** an endorsement to activate public commerce. A future separately approved eligibility, jurisdiction, public image, takedown and payment/fulfillment release design is required.
