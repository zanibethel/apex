# Apex admin media-release evidence queue — 2026-11-01

## Current system reality
Hosted Apex Supabase reports 63 supplier import variants, 62 still unverified, 1 draft product and associated private image, 1 private content-review record, 0 published products and 0 public stores. The single attached photo is not proof of the identities or packaging of 62 other variants.

## Implemented
- New `/admin/media-readiness` dashboard accessible only after `auth.getUser()` and trusted `isVerifiedPlatformAdmin(user)`, linked from Apex's admin control room.
- Uses only existing RLS-scoped `private_product_review_states` with complete bounded counts, not unrestricted reads of private supplier product tables. The latter are explicitly protected by tenant RLS even from admin accounts.
- For each submitted review snapshot, validates the image path belongs to that exact store and product. An authenticated administrator may request a 90-second signed preview from the existing **private** image bucket, using the already approved admin-review access. No permanent public URL, file copy or storage mutation.
- Shows current internal content-review status and separate image release prerequisites: valid image path, accessible private preview, source/version confirmation, product-specific image identity, publication rights, independently verified supplier/product eligibility and versioned public hosting.
- The five independent media/public-release checks are **always unverified** here, because no trustworthy attestation system or public media approval registry currently exists. Admins can route suppliers through the existing content review and image upload workflows, but this page has no approve/publish action.
- Any malformed review record or unavailable RLS read fails closed. No new database privileges, migrations, secret keys, inventory changes, customer product feed, cart admissions or BTCPay requests.

## Separate approval workflow required before public imagery
1. Seller submits product-specific authentic visual evidence or manufacturer-licensed product photography and verifiable source/provenance documents.
2. An independent reviewer confirms the exact name, strength, packaging/contents depicted, identity rights and authorization to distribute this specific image and product.
3. A dedicated, auditable and revocable media-approval record must bind a content digest, store/product ID, reviewer, approval timestamp and revision. Any image replacement revokes the earlier approval.
4. Only after that, create a separately controlled public media asset. Never publish the draft bucket itself or expose its signed URLs as permanent catalog assets.
5. Integrate only an approved media mapping into the separately authorized public Sold Out catalog RPC and keep its global release gate OFF until independent seller/product eligibility approvals and the full security rollout are completed.
6. Supplier inventory edits never imply listing or payment approval; actual sale, taxes, shipping, transaction reservations and BTCPay remain disabled.

## Verification
Require exact-head lint, TypeScript, tests, build, isolated PostgreSQL/RLS and Vercel preview READY before merging. This pass is safe to deploy because it **only displays private existing admin-authorized records** and cannot alter stored release state.
