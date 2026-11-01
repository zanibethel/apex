# Apex supplier admin feedback — October 31, 2026

## Feature
Authorized supplier owners/managers can open Administrator feedback on a saved private product card to see the latest reason when an administrator has placed the product on hold or required review.
An admin applying Hold/Require Review must provide a reason. The admin form now explains that this reason is supplier-visible and must not contain confidential internal details.
Approving republishing removes the restriction but does not publish the product; the supplier must submit a new private request when eligible.

## Controls
- Only the authenticated supplier store-scoped listing controls are read. The existing RLS SELECT policy restricts records to platform admins and assigned supplier owners/managers.
- Server forwards the stored reason only for an active hold or review. Client helper validates kind again, truncates to 1,000 characters and falls back when reason is absent.
- Note is plain text rendered by React (no HTML). Ordinary or approved listings do not expose old reasons.
- No SQL, RLS, permission, new public endpoint, release, payment, checkout or publicly published product changes.
- Saving an admin override also invalidates the bulk product workspace route.

## Acceptance
1. On a synthetic private product, enter a distinctive hold reason as admin. Confirm the supplier sees it under Administrator feedback and cannot request publication.
2. Change to Require review with a different reason. Confirm the latest reason replaces the hold reason.
3. Clear the restriction using admin approval; verify old reason disappears from supplier card and no product becomes publicly available.
4. Verify unrelated supplier and anonymous users cannot access the page or read the note.
5. Verify note wrapping and collapsed details on iPhone with no horizontal overflow.
6. Run lint, typecheck, tests, Next build, and disposable Postgres RLS integration on exact PR head. Do not merge before checks pass.

Authenticated manual browser acceptance is still pending.