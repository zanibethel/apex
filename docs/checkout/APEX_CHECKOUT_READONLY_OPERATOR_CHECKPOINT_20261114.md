# Apex checkout readiness — independently verified operator checkpoint

**Observed:** November 14, 2026.  
**Production:** https://apexanabolics.co  
**Database:** Supabase project `fhqpkpztercadcxspdkg`  
**Target:** December 1 technical readiness, not automatic authorization for live commerce.

This checkpoint records **read-only findings** from the connected Vercel and Supabase projects after the account registration, SMTP and access-boundary work. It does **not** activate checkout, create an order, make a payment, publish a listing or grant customer/supplier/admin access.

## Live evidence (read-only)

| Source | Observed state | Meaning |
| --- | --- | --- |
| Vercel Production environment variable key inventory | Neither `APEX_RETAIL_NONPAYABLE_SUBMISSION_ENABLED` nor `APEX_RETAIL_NONPAYABLE_OPERATOR_APPROVAL`, nor the four supplemental operator review keys, were present | Public nonpayable admission fails closed at the route before reading a customer request. Environment *value* secrets were not decrypted or exported |
| Supabase private `apex_internal.retail_order_engine_gate` | `enabled = false` | The atomic database order-holder remains independently OFF |
| Supabase `retail_order_holds` and `retail_order_delivery_envelopes` | 0 records in each | No recorded production customer holds or sealed delivery records at observation time |
| Vercel active firewall configuration | An active, valid rule for production `POST /api/checkout/nonpayable/v1`, fixed-window 20 requests per IP per 600 seconds | An upstream request-rate rule is **installed**. Its behavior during a controlled 429 burst, analytics, and rollback has **not** been exercised as part of this checkpoint |
| pg_cron unpaid-hold expiry | `apex-retail-unpaid-holds-expire-v1` active, every minute; 1,088 completed records observed in last 24h, zero non-success statuses in that time window | Scheduled expiry is active, but no **real expired production hold** existed to prove cleanup of a customer order |
| pg_cron encrypted-delivery purge | `apex-retail-delivery-purge-v1` active, every five minutes; 164 completed records observed in last 24h, zero non-success statuses in that window | Scheduled purge is active, but no terminal customer delivery record existed to prove real customer data removal |
| Public storefront inventory | 5 saved products, 5 inventory records, **0 published products, 0 public stores** | Catalog count of five is **intentional**; no supplier catalog may be auto-published to create a test order |

The cron run counts are a point-in-time **window sample**. They are not a forward-looking guarantee or proof that jobs processed non-empty batches. Check current `cron.job_run_details`, backlog, and alerting before release.

## Payment/checkout separation

1. The customer cart at `/cart` already calls a server-side quote endpoint, validates current prices/stock/promotions, computes shipping, collects optional reviewed delivery details locally, and does not create a purchase merely by displaying an estimate.
2. `POST /api/checkout/nonpayable/v1` exists but is **separately and explicitly default OFF**. Even a release of its application flags would still require separate permission for the private database engine. Its only authorized future output is a temporary **unpaid** stock hold and minimal order reference.
3. `POST /api/checkout/handoff/v1` (legacy payable handoff) is **unconditionally HTTP 503**. BTCPay invoice creation, independent settlement verification, Prism payouts, paid-order eligibility and USPS shipment are separate unfinished capabilities.
4. The admin dashboard now distinguishes the two paths. Any server environment acknowledgement is **not evidence** of a live PostgreSQL gate state or independent firewall/Auth/maintenance validation. The UI cannot enable anything.

## Next development and operator work

- **Catalog prerequisite:** identify one genuinely authorized, approved product suitable for a test checkout; validate supplier publish intent, administrator holds, public category/showcase state, inventory and current price. Keep original five-product catalog as intended; do not auto-publish or change an item merely to make tests green.
- **Cart readiness:** test quantity adjustment, real server quote/stock recheck, discount and free-shipping thresholds, automatically selected padded envelope versus Medium USPS box, and changed-cart invalidation. Keep the browser from treating estimates as payable orders.
- **Auth/security:** finish actual Supabase provider-side signup/abuse policy, CAPTCHA, leaked-password protection review, and customer/supplier/admin route & RPC denial tests. Single-address Apex app signup does not globally restrict the public Supabase Auth API.
- **Abuse/retention:** exercise the installed WAF rule with approved synthetic requests, verify 429 behavior and rollback, validate encrypted-delivery terminal one-hour purge, expiry stock restoration and alerting with disposable non-production records; independently audit privileged `SECURITY DEFINER` RPC permissions.
- **Nonpayable end-to-end:** first complete disposable SQL + Node cross-tenant and replay tests; obtain explicit operator approval before enabling **either** public release flags or the private DB gate. Never submit real customer delivery data to the disabled endpoint for testing.
- **Payments:** verify one shared BTCPay store, store-scoped invoice write credentials, signed webhook event/replay protection, independent invoice settlement and reversals, exact order/payment reconciliation, three-way Apex/Lily/Tierra Prism wallet proofs and immutable versioned splits. No live provider API write should be used as a smoke test before approval.
- **Fulfillment:** only independently paid/eligible orders may enter supplier shipping queues, carrier label creation or sealed-address access. Historical held review plans are not eligible orders.

## Precise next slice / test instructions

- Review `/admin/checkout-integration` and `/admin/checkout-production-readiness` with a real platform admin session: the nonpayable path should be **Not requested** and the permanently disabled payable path should be reported separately.
- Verify customer quote and delivery-review UI at `/cart` without submitting or saving customer delivery data.
- Query private engine, cron and WAF status **read-only** when deciding on the next release.
- Keep all order release toggles, Prism/BTCPay writes and supplier shipping gates untouched until separate evidence and authorization exist.

### Relevant prior contracts
- [Customer nonpayable submission release](APEX_CUSTOMER_NONPAYABLE_SUBMISSION_RELEASE_20261114.md)
- [Production submission prerequisites](APEX_PRODUCTION_SUBMISSION_READINESS_20261114.md)
- [Authenticated customer admission boundary](APEX_NONPAYABLE_CUSTOMER_ADMISSION_BOUNDARY_20261114.md)
- [Password-recovery and hosted email setup](../email/APEX_PASSWORD_RECOVERY_SETUP_20261114.md)
- [Customer registration and hosted provider policy](APEX_CUSTOMER_REGISTRATION_EMAIL_VERIFICATION_20261114.md)
