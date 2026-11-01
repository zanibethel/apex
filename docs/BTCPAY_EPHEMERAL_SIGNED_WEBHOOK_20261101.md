# BTCPay signed webhook acceptance — isolated CI pass (2026-11-01)

**State: DRAFT / NO PRODUCTION DEPLOYMENT.** This pass extends the real Bitcoin Core regtest invoice settlement PR #111 with a signed **HTTP webhook** on a disposable GitHub-hosted runner. It does NOT add a public Apex Next.js webhook route or modify production Supabase.

## Real integration flow
1. Start official BTCPay dependencies on loopback, verify Bitcoin Core is `regtest`, start the BTCPay developer web server.
2. Create an ephemeral synthetic administrator, BTCPay store and regtest-only watch-only receiving wallet.
3. Start a Node HTTP listener bound to `127.0.0.1` on an ephemeral port, with a fresh in-memory secret.
4. Register a BTCPay Greenfield webhook via authenticated local administrator, subscribed **only to `InvoiceSettled`**. No public webhook destination or persistent secret.
5. Create a real on-chain BTC test invoice and bind the exact BTCPay invoice ID to the receiving journal.
6. Mine worthless regtest Bitcoin, pay that invoice and confirm blocks. Poll Greenfield until `Settled` + `additionalStatus=None`.
7. Wait for the actual signed `BTCPay-Sig: sha256=...` callback. Verify HMAC over **raw bytes** (not parsed JSON), expected store, event, delivery ID, invoice ID, order reference, BTC amount and authoritative Greenfield status.
8. Replay the exact delivery and verify it is idempotent. Send a payload with an invalid signature and a *validly signed, wrong-store* payload; neither may add an observation.
9. Close loopback listener and delete all temporary Docker regtest volumes in the workflow cleanup.

## Limitations and security requirements
- This is **test-only in-memory event recording**, not a durable transaction log. PR #107 models the proposed append-only receipt journal and RLS but no new SQL is applied to hosted Supabase here.
- The receiving test harness never marks an Apex order paid or fulfilled and never triggers an actual payout. Even signed webhook delivery requires independently authenticated Greenfield invoice status and future durable atomic idempotency rules.
- **Disposable runner SSRF exception only:** BTCPay normally blocks localhost webhook delivery. In this GitHub job only, the developer BTCPay process uses `BTCPAY_SSRFEXCEPTIONS=127.0.0.1:48173` and the temporary callback binds `127.0.0.1:48173`. General SSRF protection stays enabled; this exact loopback exception must never be copied into production/Vercel configuration. It is not needed for the future public HTTPS webhook endpoint.
- A successful real regtest webhook still does **not** prove Prism 90/10 forwarding, production suitability, or merchant payment approval.
- Do not print webhook secret, API key, synthetic wallet mnemonic or unredacted webhook bodies. The code keeps all ephemeral material only in process memory.
- Keep the consumer checkout disabled; branded modal UX is documented separately in `docs/BTCPAY_SEAMLESS_CHECKOUT_UX_PLAN_20261031.md`.

## CI evidence
- PR #111 regtest invoice confirmed: https://github.com/zanibethel/apex/actions/runs/41271679304
- The new webhook CI runs only on the GitHub-hosted disposable workflow, with no separate VPS subscription.
