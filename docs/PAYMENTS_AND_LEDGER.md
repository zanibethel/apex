# Bitcoin checkout, payout allocation and accounting

**Current status: development candidate only.** BTCPay Server + Prism is the selected implementation to test, **not an approved live payment processor or verified direct split**.

## Desired user experience
1. Eligible product/order subtotal is calculated in USD cents and a BTC quote snapshot is taken with expiry.
2. Customer sees one BTC invoice and QR code from BTCPay.
3. The payment backend verifies status using server-authenticated events and blockchain confirmation policy.
4. A configured **90% supplier / 10% platform** allocation is computed for eligible product revenue; payout processing can forward BTC later, not necessarily in the incoming transaction.
5. The system records what is **owed**, what was **initiated**, and what is actually **paid/confirmed** to each destination as separate states.
6. Supplier sees their settlement; operator sees platform-wide earnings, paid vs outstanding shares and reconciliation exceptions.

## Accounting rules to implement
- All BTC arithmetic in **integer satoshis**; record price/fee/FX reference as snapshots and avoid floating-point calculations for monetary values.
- The exact commission base needs signed terms. Proposal: eligible product subtotal **after discounts and refunds**, excluding tax and separately charged shipping. Do not assume refunds automatically reverse an already-sent commission.
- Document whether the 90/10 allocation is calculated before or after network fees, and who absorbs each transaction fee.
- Use immutable ledger rows and idempotency keys for invoice creation, webhooks, split entitlement, payouts and refund events.
- Persist blockchain transaction IDs, destination identifiers (securely, avoid public logs), invoice state, payout state, confirmations and timestamps.
- Never count a payment as settled because the browser lands on a success page.

## States and exception paths
- Order: draft -> placed -> accepted -> fulfilled / cancelled / refund-pending / refunded.
- Incoming payment: created -> awaiting -> detected -> confirmed, with expired / underpaid / overpaid / failed branches.
- Payout: owed -> queued -> submitted -> verified, with delayed / failed / retriable / manually-reviewed branches.
- Handle confirmation reorgs, retries, duplicate callbacks, price expiry, invoice underpayment, split rounding, network costs, and manual adjustments.
- Reconcile a completed invoice against incoming BTC and separately against **each** outgoing allocation; alert if sums diverge or destination transfer is missing.

## Refund model (proposal, not a substitute for law or agreement)
Supplier is proposed to fund ordinary eligible order-related customer refunds, including amounts that were already forwarded as commission. Refund rights and platform-caused errors need distinct treatment under written terms and applicable law. Do not create a customer-facing promise of refunds or a debit capability without designing the actual funded refund workflow.

## Test gate
Before any live funds: isolated Bitcoin test network, repeatable two-destination payout test, tamper/replay test, delayed payout tests, failure/recovery test, backup/restore, secure signer architecture and review of merchant eligibility / money-transmission exposure. **Fail closed** when reconciliation or authorization is uncertain.
