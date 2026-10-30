# December launch window and seasonal promotion plan

_Last updated: 2026-10-29. Anonymized founding-partner feedback; planning only._

## Partner request and target
The founding partner supports the six-week development schedule and would ideally like a **technically ready storefront before December 10, 2026** so a seasonal promotional launch could take advantage of the holiday period and early-January interest.

**Date math:** Six weeks from **October 29, 2026** lands on **Thursday, December 10, 2026**. To meet the stated *before December 10* preference, set a **stretch technical-readiness target of December 7–9**, assuming funding, scope agreement and supplier inputs are available immediately. The existing six-week estimate starts when those prerequisites are met; funding delays may shift milestones. These targets do **not** guarantee real-money transactions or regulatory/payment approval by December 10.

Partner described a history of **24-hour holiday flash sales** and interest in a possible New Year's promotion. Treat these as requested business capabilities and hypotheses, not proven forecasts of demand.

## Proposed seasonal MVP capability (small scope)
One simple, admin-configured 24-hour flash-sale promotion, only for a catalog that is authorized for commerce:
- Choose eligible products or a specific collection; use one **percentage-off** discount rule.
- Explicit start/end date and time, store timezone (initially `America/Chicago`), and a preview before activation.
- Automatic server-side activation and expiry, even when nobody is logged in; no manual midnight shutdown needed.
- A concise storefront banner with clear sale end time, without pop-ups blocking search or checkout.
- Price calculation on the server and an immutable order-line price/discount snapshot; expired promotions cannot apply to new orders.
- Log the person who scheduled/edited the sale; show discounted orders and revenue in platform/supplier reports.
- No stacking multiple promotions, complicated coupons, influencer referrals, or multi-store campaign tooling in the first release.

**Priority and capacity:** This is a **candidate small feature**, not permission to jeopardize critical order, privacy, payment or security requirements. Build it only after partner confirms it is higher priority than another optional feature, and only if Week 3 work/Week 5 tests leave room. Otherwise prepare banners and a manual announcement workflow for a later release, with no misleading automatic-discount promise.

## Tentative launch communications (conditional)
- **Dec 7–9:** technical readiness demonstration and supplier acceptance, if prerequisites were met by Oct 29 and core milestones passed.
- **Dec 10:** partner's preferred announcement/launch milestone; only an actual commercial launch if every legal/product, payment, security, operations and commercial gate has passed.
- **Late December:** consider a 24-hour holiday sale after verified commerce enablement.
- **Around New Year's:** optionally schedule a separate 24-hour promotion based on authorized inventory and supplier approval.
- Never promise increases in sales, product health outcomes, or eligibility for unapproved transactions.

## Launch readiness dependencies
- Supplier funding and prompt catalog/assets/approval, confirmed domain and hosting ownership.
- BTCPay + Prism payout-signing/custody assessment; actual two-destination split tests and stable reconciliation.
- Supplier/product/jurisdiction authorization, approved payment arrangement, refund/fulfillment policies and signed terms.
- Fully tested promotion price handling and ability to disable a promotion immediately.
- Clear notice to partners if the site is ready in demo mode but commercial go-live must wait.

## Acceptance checks (when flash-sale feature is approved)
- [ ] A scheduled 24-hour test promotion activates/expires using the configured business timezone.
- [ ] Only explicitly eligible products receive the intended discount; tax/shipping/commission bases remain correct.
- [ ] Product page, cart, confirmation and order reports show consistent authoritative totals.
- [ ] Completing an order across the promotion boundary follows documented quote-expiry rules.
- [ ] Admin can preview, cancel, and audit a sale; supplier-only access remains enforced.
- [ ] A non-sale product and expired sale have no discount.
- [ ] All screens remain navigable and accessible on a phone.
