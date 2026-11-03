# Apex BTCPay private Greenfield connection check (PR #187)

## Purpose
Review the real production provider connection from an authenticated Apex platform-admin page without publicly exposing the supplier catalog or initiating payments.

The server-only route `/admin/btcpay` obtains private Apex store identities through the existing verified-admin Supabase RPC and, for each configured store, performs **one HTTPS GET** to its exact Greenfield `/api/v1/stores/{providerStoreId}` endpoint. It verifies the returned provider store ID and USD default currency. Redirects are denied. Connection errors and provider response bodies are never exposed. No API tokens are rendered. The route never creates orders, invoices, wallet requests, payouts, or public checkout links.

## Production configuration (set only in Vercel project environment variables)

`APEX_BTCPAY_BINDINGS_JSON` is a JSON array containing up to 20 records. Example with a sample UUID and placeholder provider:
```json
[
  {
    "apexStoreId": "bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3",
    "providerUrl": "https://pay.example.org",
    "providerStoreId": "REPLACE_WITH_REAL_PROVIDER_STORE_ID",
    "keyEnv": "APEX_BTCPAY_KEY_PRIMARY"
  }
]
```
Set a **separate encrypted server-only** Vercel secret `APEX_BTCPAY_KEY_PRIMARY` to the actual provider key. The connection-check key needs only the store-scoped `btcpay.store.canviewstoresettings:PROVIDER_STORE_ID` permission. Do not put that secret in the JSON mapping, `NEXT_PUBLIC_*` variables, GitHub source, or the ChatGPT conversation.

For future independent Apex supplier storefronts, give each a distinct provider store mapping and distinct `APEX_BTCPAY_KEY_*` variable. Duplicate Apex store IDs, duplicate scoped provider stores, or credential references are rejected before network calls.

## What a green read means
A **Store read verified** result means only:
1. The configured HTTPS endpoint responded to a read-only Greenfield request without redirects.
2. The supplied key had permission to read the expected provider store.
3. The response store ID and default USD currency matched Apex configuration.

It does **not** confirm invoice-writing scope, payment method/wallet setup, webhook verification, order persistence, split reconciliation, custody, or product eligibility. Test workers and production keys remain separate. The checkout release gate and public product listing approvals remain unchanged. The older PR #173 worker isolation still applies to **disposable regtest fixtures only** and must not be treated as a production payment processor.

## Further work before genuine checkout
Provision separate scoped invoice writer credentials, verify provider wallet and webhook endpoint signatures, add durable server-side order/invoice reservation and reconciliation with duplicate-POST protections, and complete independent product/public release checks. The admin read-only verifier is intentionally not the checkout backend. Keep actual customer checkout disabled until all gates pass.

Official docs: https://docs.btcpayserver.org/Developers/api/ and https://docs.btcpayserver.org/BTCPayServer/greenfield-authorization/
