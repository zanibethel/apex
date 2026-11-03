# PR #178 — Category publication controls and product setup visibility

## Scope

Build a usable administrator category-control page and surface real product-setup gaps without altering any existing supplier/product approval or payment controls. Supplier product Publish/Unpublish continues to use the same existing audited listing RPC. The admin can configure category visibility once for the store rather than manually approve each supplier Publish operation.

### Private admin workflows

- `/admin/categories` lists categories from a narrow, admin-authenticated RPC, with a compact Publish/Unpublish action and per-category product counts. It reads private category data through the existing user session; neither service-role credentials nor a general RLS bypass are exposed to the browser.
- `set_admin_category_publication` verifies the caller's database JWT `app_metadata.apex_role=platform_admin` **and** nonnull auth identity. Only a private store's exact category can be changed. A short audit note is required when publishing, but unpublishing remains one click.
- An append-only, admin-readable audit table records the category identity, action, actor, reason and timestamp; authenticated callers cannot write directly. Duplicate same-state clicks do not create duplicate events.
- `/admin/catalog-release` now shows each product's field-completeness checklist (missing name, SKU, description, category, image, positive list price, active flag or valid inventory record) beside the protected server release verdict. These are **setup requirements**, not supplier authorization or product release approval.

### Protection boundaries

- The migration does **not** change any existing category publication flag during installation, publish a product, open the global private release gate, create release-approval evidence, enable customer checkout or activate payouts.
- The public Sold Out projection remains strictly dependent on independently reviewed supplier and product authorizations, completed media/content checks, zero actual stock, a permitted category, supplier Publish and absence of admin holds.
- Supplier category edits retain their existing narrow permissions; `categories.is_published` is never granted as a writable column to suppliers or anonymous users.
- Admin cannot publish a category from a different store by guessing a UUID. User-editable metadata is never trusted as an admin claim.
- A missing RPC, stale data or insufficient permission is reported as unavailable, not falsely shown as published.

### Verification and rollout

CI installs the migration only into isolated PostgreSQL after the synthetic Sold Out release test, tests role and audit isolation, verifies a real admin Publish/Unpublish/repeat lifecycle, confirms the global gate stays OFF, and checks that no product becomes publicly visible from the category change alone.

**Production installation requires a verified database migration**, as Vercel deployments alone do not apply Supabase migrations. After exact-head test verification and merging, the new admin category page can become operational by applying the same reviewed SQL through the connected Apex Supabase migration flow. The PR itself is not authorization to mark any real category published or to create/approve product-eligibility records. A separate product-eligibility review and global-release activation are still required before any public listing can appear.
