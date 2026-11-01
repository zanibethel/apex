# Apex supplier/admin hold-to-correction acceptance — October 31, 2026

## Scope
Disposable PostgreSQL integration regression after PR #92. This is not a hosted Supabase migration and must never run against the production Apex project.

## Simulated lifecycle
1. A verified platform admin puts a complete private product on hold with a supplier-facing reason.
2. The assigned supplier manager reads that reason through existing row-level access controls.
3. That manager edits the product description; the edit must save without erasing the admin hold.
4. The same manager cannot submit a private publication request while held.
5. An unrelated supplier and a staff account cannot read the restricted reason.
6. The admin switches the hold to required review with a new reason; the supplier sees the new reason and still cannot request.
7. The admin approves republishing. Approval removes the hold but does not set supplier_wants_listing or public product/store flags.
8. The authorized manager explicitly submits a new private publication request. Even then, the global public-release gate remains disabled.
9. Audit history retains the hold, required review, and reapproval with the correct notes.

## Implementation
- The new SQL fixture is database/tests/supplier_hold_correction_roundtrip_integration.sql.
- GitHub Actions executes it after existing private-release decision tests in its disposable PostgreSQL job.
- Node regression assertions verify the CI ordering, role isolation, reason presentation, and no-publication conditions.
- No production data writes, changed RLS policies, new privileges, public product activation, checkout or payments.

## Still pending manual acceptance
An authenticated browser walkthrough on supplier owner/manager and platform admin accounts, plus staff and unrelated-supplier denial and iPhone screenshots. Automated SQL role simulation does not replace this manual step.