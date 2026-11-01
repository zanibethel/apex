# Apex checkout experience — staged Bitcoin checkout (2026-10-31)

**State: UX CONTRACT ONLY, NOT DEPLOYED.** No buyer can pay Apex yet. The linked payment test CI uses worthless regtest coins. This plan does not authorize production orders or any product transaction.

## Experience objective
Apex controls product selection, itemized order review, buyer identity/guest details, shipping information, and order status. BTCPay securely displays the Bitcoin invoice on the **same storefront page in a branded modal** when supported. The full-screen BTCPay checkout link is the fallback. Do not rebuild BTCPay signing or QR/amount logic in the storefront.

### Customer states
1. **Cart review:** Server validates public products, currently permitted status, inventory and discount codes; freezes an authoritative server-side order snapshot in exact integer cents. No browser supplied purchase price.
2. **Contact/shipping:** Guest checkout or signed-in customer. Collect only genuinely required fields, validate on the server, and avoid sending unnecessary buyer information to BTCPay; use opaque `metadata.orderId` for correlation.
3. **Awaiting payment:** Create a BTCPay invoice exactly once per checkout attempt, save its ID on the order before showing the signed invoice's `checkoutLink`. Default a BTCPay-provided modal; if it is blocked/unavailable, show the secure invoice page link. Mobile displays QR + Copy Address/Amount + Pay-in-wallet supported by BTCPay. Show real invoice expiration without extending it in browser code.
4. **Payment detected:** Show `Processing` as *Payment received—awaiting confirmations*. Customer may close the window; a reliable order status page continues showing the pending payment. No automatically fulfilled order.
5. **Settled:** Only a verified backend transition (authenticated BTCPay Greenfield invoice re-fetch + matching order snapshot, confirmed network/payment policy, durable idempotent receipt) marks a checkout paid. Display receipt and supplier processing status. A client modal event or redirect is presentation only.
6. **Exceptions:** Invoice expired, invalid, partial/late/overpaid, exchange-rate expiration, wallet rejection and connection errors should show helpful, non-alarming copy with a new-invoice or contact-support path. Avoid charging twice; use idempotency keys and fetch existing order first.

### UX and accessibility rules
- Modal must be responsive, keyboard accessible, focus-trapped, ESC/close behavior clear and with a visible alternative "Open secure Bitcoin checkout" link.
- Display item/discount/shipping/tax breakdown and requested BTC amount without deceptive rounding.
- On payment detection, show what happens next, that confirmation is not instant, and how to recover the order from the account or guest receipt.
- Keep wallet addresses/amounts from the trusted BTCPay invoice only; never place secret API keys in browser, JavaScript, metadata or browser localStorage.
- Pin BTCPay script origin to the authorized production payment hostname. Verify origin and expected event shape for any modal postMessage handler; treat events as UI signals only, not authorization.
- Use server-side rate limits, CSRF protections where needed, short-lived order status tokens for guests, webhook signature verification, replay protection and no PII in status URLs.
- On-chain BTC is wallet-based, not a card-like one-tap checkout. Offer a full-page fallback on unsupported browsers.
- Keep this behind demo/testing-only flags until merchant/payment authorizations and production readiness are explicitly approved.

## Development order
1. **Current:** GitHub-hosted ephemeral local regtest: real BTCPay Greenfield test invoice paid with worthless BTC; assert `Settled` after synthetic confirmations. No Prism forwarding.
2. Greenfield signed webhook, same-store matching, durable receipt ID / duplicate delivery handling, error/reorg/late-payment negative cases.
3. Prism regtest test wallets: 90/10 forwarding, fee responsibility, retry and refund reconciliation. Not equal to in-transaction split.
4. Design responsive checkout modal and order-status screen with fake invoice fixtures and accessibility testing, without a production checkout API route.
5. Reviewed database order/receipt migration and server API routes; demo-only and authorized to deploy only after tested.
6. One production VPS when technical and business gates are complete. New mainnet wallets; never reuse regtest keys.

## BTCPay references
- https://docs.btcpayserver.org/Development/ecommerce-integration-guide/
- https://docs.btcpayserver.org/Users/invoices/
- https://docs.btcpayserver.org/Developers/api/invoice-metadata/
- https://docs.btcpayserver.org/API/Greenfield/v1/
