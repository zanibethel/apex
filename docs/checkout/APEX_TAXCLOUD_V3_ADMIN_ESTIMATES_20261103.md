# Apex — TaxCloud v3 private estimate adapter (PR #195)

## Provider selection and supported API

TaxCloud v3 exposes a `GET /tax/connections/{connectionId}/ping` connection check and a `POST /tax/connections/{connectionId}/carts` tax-estimation workflow using `X-API-KEY`. TaxCloud's docs describe **cart creation** separately from converting carts into taxable orders. This PR implements **only Ping and Cart creation**. It never calls `/carts/orders`, creates an Apex order, reserves inventory, captures a payment, or posts a BTCPay invoice.

Official docs:
- https://docs.taxcloud.com/guides/getting-started/setup-and-authentication
- https://docs.taxcloud.com/guides/workflows/real-time-api/calculate-taxes-with-cart
- https://docs.taxcloud.com/guides/workflows/real-time-api/handling-discounts
- https://docs.taxcloud.com/api-v-3/api-reference/api-reference/sales-tax-api/cart/create-cart

## Admin experience

- `/admin/tax` — verified platform administrator only. Reports TaxCloud setup status. When credentials exist, attempts a **read-only Ping**, checking the expected success response without exposing secrets.
- `/admin/checkout-review` — the existing destination and promotion estimate has optional **city and full street address**. It still computes the merchandise/shipping preview from the saved database snapshot.
- When fully configured and switched on, an administrator can request a **TaxCloud cart tax estimate** from a **full delivery address**. Only the private server action can make the call.
- Server validates: saved Apex price/tax flag, exact product-store identity, real shipping fee, applied discount, full origin and destination, currency, approved TaxCloud TIC, returned connection, product, discount-adjusted merchandise, shipping line TIC, and individual product/shipping tax. Any mismatch fails closed.
- TaxCloud estimates are **not final payment totals**. No durable signed/expiring tax quote is stored yet, and no checkout is enabled. The UI only shows provider-estimated tax/total separately, labeled informational.

## Configuration

Provision merchant credentials **privately**, in Vercel (not GitHub, browser, chat, or customer profile):

`APEX_TAXCLOUD_BINDINGS_JSON` is an encrypted server-only JSON array. One entry per private Apex store:

```json
[
  {
    "apexStoreId": "YOUR_APEX_STORE_UUID",
    "connectionId": "YOUR_TAXCLOUD_CONNECTION_UUID",
    "keyEnv": "APEX_TAXCLOUD_KEY_PRIMARY",
    "origin": {
      "countryCode": "US",
      "line1": "YOUR_REAL_SHIPPING_ORIGIN_STREET",
      "city": "YOUR_ORIGIN_CITY",
      "state": "TX",
      "zip": "YOUR_ORIGIN_ZIP"
    },
    "productRules": {
      "YOUR_PRODUCT_UUID": {
        "tic": 0,
        "reviewed": true
      }
    }
  }
]
```

This is a **structural example only**. Do not copy `tic:0` for unreviewed products; the correct product taxability information code must be approved for each SKU. For a product with **Collect sales tax unchecked**, a separate **`taxFreeBasisRef`** to a documented and reviewed classification is required; the provider still independently determines tax. Merely unchecking the box never authorizes a zero tax amount.

Set `APEX_TAXCLOUD_KEY_PRIMARY` as a separate encrypted secret containing the corresponding API key. Use a different connection and key environment variable for every supplier store; shared credentials and duplicate mappings are rejected.

`APEX_TAXCLOUD_PRIVATE_ESTIMATES_ENABLED` defaults to **off**. Set it to `true` only after completing TaxCloud merchant legal/business registration, fulfillment-origin address, nexus settings, product taxability classifications and required API credentials.

**No key or connection has been provisioned in this PR. No provider request will occur by default.** A Ping success verifies the connection, **not** that the seller's tax/nexus/compliance settings are correct. A merchant with no configured nexus can get 0 tax despite otherwise valid connectivity, so no 0 tax may be interpreted as automatically exempt.

## Response trust boundary

- Fixed HTTPS origin `https://api.v3.taxcloud.com`; only `ping` and `carts` operations allowed.
- Credentials remain private server environment variables; 5-second timeout, no automatic redirects, no caching; bounded JSON response.
- Backend sends a **product line** with its reviewed TIC and a separate **shipping line** with TIC 11010 if shipping charges apply.
- Discount is represented as TaxCloud native `orderDiscount` of the exact saved integer-cents discount amount. Product price/quantity and TaxCloud returned original/discounted amounts must reconcile exactly. A TaxCloud rounding difference rejects the quote instead of silently changing the payable amount.
- ZIP/state and street format checks do not prove address validity, nexus, product classification or legitimacy; the connected provider must return the matching full address.
- The provider can retain its cart for up to 180 days; this admin preview does not store the address in Apex. Only use real customer addresses with appropriate notice/consent when enabled.
- The returned object permanently declares `quoteFinalized=false`, `canCreateOrder=false`, `canCreateInvoice=false`, `canPay=false`. No provider invoice/order completion endpoint is available.

## Remaining rollout steps

1. Obtain a TaxCloud merchant account and API key with separate connections for the required supplier stores. Verify account onboarding, nexus, and product restrictions with the provider.
2. Independently verify taxability codes for all product categories and any asserted tax-free classifications; store reviewed records and future versioned classifications under access control, not in user editable metadata.
3. Configure the real fulfillment origin(s) and jurisdictional nexus. Select a tested tax/seller operating model and ensure the buyer's delivery address is validated.
4. Implement a durable short-lived, tamper-resistant server quote tied to the atomic reservation transaction, including TaxCloud cart order conversion/refunds only after authorized sales and provider reconciliation.
5. Validate any TaxCloud price-rounding differences, multi-item allocation, shipping exemptions and approved seller/product restrictions before considering customer checkout.

This PR is a secure connection/preview integration, **not activation of customer checkout or collection of tax**.
