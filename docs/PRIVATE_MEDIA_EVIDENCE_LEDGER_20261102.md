# Apex private image identity and usage-rights evidence (2026-11-02)

This pass adds an append-only record of human-reviewed *private image evidence*
to the admin Media Readiness workspace. It does **not** confer authority to
advertise or sell any specific product, copy media into public hosting, or
enable checkout.

- A trusted platform admin opens `/admin/media-readiness` and reviews the
  existing product-specific private submitted snapshot.
- Admin may record **Evidence checked** (identity-document reference,
  photo-use-rights reference, and notes) only for an **internally approved**
  unchanged submission, or **Needs correction** with an explanation.
- The server verifies admin identity from trusted app_metadata, the current
  private content-review submission/image path, and access to the exact
  private storage image before recording evidence.
- Database RLS allows only platform admins to SELECT/INSERT the protected
  evidence table. The table is append-only with **no UPDATE/DELETE grants**.
  Supplier, guest and unrelated authenticated users cannot view or forge
  evidence. A new image or submitted review version makes prior evidence stale.
- Existing product changes invalidate internal reviews through previously
  installed product-review integrity triggers. Current evidence evaluation
  additionally compares the exact submission and image path.
- The public catalog never reads this table, no private image URL is returned
  publicly, and `private_release_gate.enabled=false` remains enforced.
- This is **recordkeeping, not regulatory validation**. Human reviewers must
  independently assess the image, ingredient identity, licensing, supplier
  authority, intended use and any applicable legal permissions. Later
  consumer/media release is an independently reviewed pass.

Schema file: `database/sql/apex_private_media_evidence_ledger_REVIEW_ONLY.sql`.
Disposable RLS test: `database/tests/private_media_evidence_integration.sql`.
Deployment sequence: exact-head CI + Vercel preview → reviewed hosted migration
and permission readback → merge code → production readiness check.

No existing product, review decision, image, stock or supplier publishing
preference is modified by this migration.
