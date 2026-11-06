> **November 6 addendum — use the latest verified checkpoint:** [Apex execution checkpoint](APEX_EXECUTION_CHECKPOINT_2026-11-06.md) and [next development prompt](supplier/NEXT_TRACK3_SHIPMENT_LEDGER_PROMPT_20261106.md). PRs [#298](https://github.com/zanibethel/apex/pull/298), [#299](https://github.com/zanibethel/apex/pull/299) and [#300](https://github.com/zanibethel/apex/pull/300) merged: one supplier Orders & Fulfillment hub, per-order immutable held-record review, and purchase-time line/partial-quantity **browser-only** preview. Exact PR heads and deployed main were tested; last verified hosted data had **0 real order/line snapshots** and the public release gate **OFF**. The full audited shipment lifecycle, partial allocation persistence, trusted settlement, protected delivery authorization, CSV reconciliation, USPS labels, tracking and live email attachment delivery **remain unimplemented or execution-gated**. The instructions below describe synthetic QA and historical foundations, not a working shipment queue.

# Apex Track 3 — Fulfillment & reporting technical acceptance tests

**Version:** November 5, 2026. **Scope:** independent supplier operations track (Issues #215–#219).
**Purpose:** distinguish working technical foundations from activation of real order fulfillment.
**Live release rule:** no payments, shipping, carrier postage, destination decryption, or customer shipment notification unless separate verified source/merchant permissions are approved. A supplier sales-history record or accepted email is never equivalent to a paid eligible order.

## One-click three-track sample purchase (recommended first test)

Open **https://apexanabolics.co/admin/fulfillment-qa**, sign in as
platform admin, and click **Run sample purchase** at the top.

Expected result: six stages appear in order:

1. Customer cart: 2 sample items / 3 units, $55 items + $8 optional shipping.
2. Checkout handoff: Track 1 selections pass the actual Track 2 v1 validator.
3. Order identity: a synthetic held-order readback preserves immutable purchase time and rejects a mismatched request.
4. Bitcoin payment: **a signed mock notification is verified**, but no real invoice, settlement or payout happened.
5. Supplier fulfillment: an allocation of one unit leaves two unplanned; real shipping and postage are blocked.
6. Supplier report: metadata-only review manifest for one original order, no real email or delivery data.

All six checks must pass; expect **"Sample workflow checks passed —
no real purchase was made."** The test does not submit personal details
to an API, use a live Bitcoin store, purchase labels, create orders in
Supabase, or send emails. It is intended to verify compatibility of the
three contracts, not claim production payment or fulfillment readiness.

Follow the more detailed exercises below only if you wish to investigate
CSV overlap, email transport, or USPS provider enrollment.

## Fastest interactive acceptance walkthrough (admin-only)

Open **https://apexanabolics.co/admin/fulfillment-qa** using a verified platform admin login.
This page creates only deterministic synthetic records and never reads or writes
production orders, delivery addresses or payment accounts.

1. Verify the four stat cards read **Day 3: 20**, **Day 4: 40**,
   **new on Day 4: 20**, **carried forward: 20**.
2. Click **Check stale edits**. Expected: **Rejected without changes**,
   **10 stale rows**, **0 proposed changes**, **20 unique uploaded orders**.
   Download the conflict report and confirm it lists stale revision errors.
3. Click **Check valid edits**. Expected: **Review-only preview accepted**,
   **10 proposed changes**, **0 stale rows**, **40 unique orders**.
4. Click **Apply to browser-only simulation**, then **Check valid edits** again.
   Expected: **0 proposed changes** (identical replay, nothing to write).
5. Click **Reset scenario**, download the Day 3, Day 4, stale-edit and
   valid-edit CSV samples, and import them using the file picker. The
   stale file must be rejected and the valid file must pass.
6. Inspect the attachment manifest below the workbench. It must have
   **40 original held orders**, no shipment/delivery claim, no customer PII,
   a deterministic SHA-256 digest and **no send action**.
7. Open a private/incognito browser window without authentication. Direct
   access to this path must redirect to admin sign-in. A supplier without
   platform-admin privileges must be denied.

The workbench is intentionally **not** a customer-facing testing mode,
live fulfillment queue, or carrier label interface.

## A. Automatic repository verification (repeat on each PR)

From the Apex repository checkout:
\`\`\`bash
git pull --ff-only
npm ci
npm run check
\`\`\`
The \`check\` script runs lint, TypeScript, Node tests and Next production build. Use the GitHub PR **Checks** tab to verify the same exact head SHA and isolated \`Payout RLS isolated Postgres verification\` suite. Do not merge when any check failed or while the preview build is still running.

Additional focused tests:
\`\`\`bash
node --test tests/review-only-fulfillment-state-issue215.test.mjs
node --test tests/cumulative-fulfillment-review-csv-issue216.test.mjs
node --test tests/supplier-review-email-manifest-issue217.test.mjs
node --test tests/supplier-held-csv-preview-issue216.test.mjs
node --test tests/supplier-report-delivery-journal-issue219.test.mjs
node --test tests/owner-mail-alert-cron-issue219.test.mjs
\`\`\`
Expected: no failing tests. The historical Day 3/Day 4 suite creates **20 Day 3 orders, carries those 20 forward, adds 20 on Day 4, and rejects stale offline edits to 10 older records**; 40 original IDs and 40 plan IDs remain unique. This test uses synthetic identities and never writes to hosted Supabase.

## B. Supplier/browser smoke (approved existing supplier account)

1. Log in using a confirmed, currently authorized supplier account. Visit \`/supplier/reports/daily\` and select yesterday and another saved report date. Confirm figures match saved source data. The "not generated" state is **not** shown as zero sales.
2. Enable daily-report email only if you actually want that verified account to receive it. Confirm the status differs among **not sent**, **provider accepted**, **provider sent**, **provider delivered to mail server**, and failure states; none claim a guaranteed inbox view.
3. In \`/supplier/reports/cumulative-csv\`, download your own store export. It must contain only held order IDs, original timestamps, statuses and review metadata, without addresses, phone numbers, payment methods, product descriptions or customer names.
4. Upload one or more **previously downloaded** cumulative files into the browser-only comparison input. Confirm repeated identities are counted once. A tampered store ID or historical purchase timestamp must be rejected. No record is ever edited as a consequence of this comparison.
5. Visit \`/supplier/reports/shipment-review\` and \`/supplier/reports/order-foundation\`. With no independently eligible order records, neither page may show payable, label-ready or shipped work.
6. Log out, open those pages in a new private window, and verify you are redirected to sign-in without a CSV download.
7. Sign in to a second supplier account. It must not download or view the first supplier's records by altering a \`store\` query parameter.

## C. Admin email health, daily cron and real Resend event

1. Open \`/admin/email-reports\` with a verified platform-admin account. The sender fingerprint and webhook-signing configuration must be reported without revealing any keys. The 7-day health panel should show **pre-webhook** historic acceptances separately from **overdue** post-webhook receipts.
2. Check Resend's dedicated Apex webhook's subscribed events: \`email.sent\`, \`email.delivered\`, \`email.bounced\`, \`email.complained\`, \`email.failed\`, \`email.delivery_delayed\`, \`email.suppressed\`. Confirm no existing unrelated webhook was changed.
3. Verify the real Supabase daily snapshot precedes the \`11:00 UTC\` Vercel supplier report cron. Check a fresh authorized report's \`generated_at\` and provider accepted ID. Both must occur before 8:00 AM **America/Chicago** year-round; Central standard/daylight offsets differ.
4. To test the **public signed webhook ingress only**, send a separate email from the **authorized reports sender** through Resend to Resend's official simulation address \`delivered@resend.dev\` with an unmistakable QA subject (not a production daily report). In the Apex webhook delivery history, verify a successful 2xx callback. It should be **ignored** by the report-specific journal because it is not an enrolled supplier's canonical accepted daily report. Check the corresponding provider event's attempt history if callback fails. This does not verify correlation to the private outbox.
5. To validate **full private correlation**, let the regular daily cron send a genuine report to an already opted-in, verified supplier. Match that exact accepted provider ID to the webhook delivery event and the supplier's protected status. Check any actual bounce/failure is reflected on the admin health page and supplier history. **Do not backfill old messages as signed events**.
6. The owner-only alert cron is \`16:15 UTC\` daily. With **zero verified incidents**, it must send **no alert email**. With a verified incident, inspect private acceptance journal, owner-only aggregate email, stable daily idempotency key and no repeat after success. The alert describes transport evidence, not inbox placement. Do not generate fake incidents in hosted Supabase to force a send.
7. Test signed-event tampering, stale timestamp, replay conflicts and foreign sender/recipient only in the automated tests / nonproduction provider test account.

## D. Review-only fulfillment simulations

Run the focused Node tests in Section A. They verify:
- Allowed status vocabulary: queued → review → packing → label-ready → shipped → delivered, with exception/cancel branches. All real transitions are **blocked** until independent authority exists.
- Stale expected revision rejects the transition; duplicate source identities cannot generate new orders.
- Allocations cannot exceed each line's originally purchased quantity. A partially allocated order is **not** completed.
- Cumulative export maintains one canonical original order ID; untrusted CSV edits can alter **review notes only**, not purchase time, product/quantity, payment or shipment identity.
- Workbook imports with conflicting or stale rows are rejected **all-or-nothing**. The provided error CSV identifies conflicts. All previews operate locally and make **zero** hosted writes.
- Review-email manifest contains only typed, non-sensitive metadata, a deterministic attachment digest and original-date counts. It does **not** send email, expose destination data or claim shipment.
- There is no test that legitimately charges postage or marks an order shipped: those require the missing provider/Track 2 release authority.

## E. USPS readiness and supplier-side test

1. At \`/supplier/usps\`, verify each supplier sees **their own** account readiness. The page must say label purchase/tracking sync are disabled. Never enter OAuth secrets or merchant account passwords in product fields or screenshots.
2. Each supplier separately completes USPS business onboarding, USPS Ship enrollment, allowed postage payment setup, and obtains explicit **Labels API** approval. USPS says Labels API is **not** included in default access; merchant-specific grants and account payment approval are required. Source: https://developers.usps.com/getting-started
3. Once the business/app approval exists, use **USPS TEM** / approved test environment and supplier-isolated credentials, not live postage. Verify rate/dimensions, no cross-supplier credentials, invalid address, unauthorized package, duplicate request, timeout and reconciliation cases.
4. **Do not** enable a real label purchase button until both provider access and verified order/shipment authorization exist. Request independent operator confirmation before any charge; test refund/void and tracking separately.

## F. Release gates / blockers checklist

- [ ] Track 2 publishes a stable, **server-side, verified** canonical order/line contract with immutable original purchase time, source versions, independent settled-payment and transport-eligibility verdicts, plus a separately audited destination release.
- [ ] Issue #215: independently eligible shipment queue, supplier-scoped event/partial-shipment ledger, tracking and idempotent immutable audit records are installed and authorized.
- [ ] Issue #216: only eligible rows may enter the operational cumulative CSV; authorized offline edits get version checks and a truly atomic supplier-scoped import.
- [ ] Issue #217: pending eligible-order attachment or short-lived authenticated supplier-only download is linked to the verified queue; no addresses in ordinary email.
- [ ] Issue #218: USPS labels/account approval and supplier-paid quote/confirmation/charge/void/tracking operations pass the provider's approved test environment.
- [ ] Issue #219: verify a **genuine** post-activation signed delivery event and mail alerts end to end.
- [ ] Final technical signoff documents privileges, provenance, backups, credential handling and explicit release decisions.

**Current intended safe outcome:** the repository's review/test contracts are complete, ordinary supplier held-history exports remain read-only, the customer release gate stays disabled, and partner-only steps are explicit. This is **not** the same as activating a live storefront or carrier payment integration.
