# Track 2: Private order delivery AES-256-GCM envelope (v1)

**Status:** code and unit tests only. No hosted schema update, live checkout, payment, order creation, recipient disclosure or shipping authorization.

## Existing schema compatibility

The previously deployed private `apex_internal.order_delivery_envelopes` table has columns `order_id`, `store_id`, `envelope_format`, `key_reference`, `nonce`, `ciphertext`, `auth_tag`, `delivery_verified`, and `shipping_authorized`. PR #214/243 already deployed this schema; **do not reapply the migration**.

`sealPrivateOrderDeliveryV1` from `src/lib/payments/private-order-delivery-envelope-v1.mjs` produces one object with those fields, using a secure random 12-byte AES-GCM nonce, 16-byte authentication tag, encrypted normalized address/contact fields and a mandatory 32-byte key Buffer.

The authenticated additional data binds the ciphertext to the exact `(store_id, order_id, key_reference)`. Copying a delivery envelope to a different store, canonical order or key version is rejected. The format is `aes-256-gcm-v1`. No sensitive name, email, phone or postal address is intentionally included outside the ciphertext.

`openPrivateOrderDeliveryV1` is **not a public or supplier read contract**. It is a privileged cryptographic primitive, not its own authorization mechanism. Its caller must separately verify exact supplier-store membership, authorized order purpose, recipient-data access policy, retention, access audit and key version before decrypting. Read-side access remains unimplemented and blocked in the app.

## Key lifecycle requirements

A 256-bit encryption key must come from an approved secret manager, not a browser, GitHub repository, public URL, provider invoice or database. A non-secret `key_reference` identifies the active key version. Do not derive keys from passwords or reuse this fixture test key. Define rotation, deletion/retention, backup and encrypted access audit before operational use. Preserve old keys securely for authorized reads of older envelopes; rotating a key must not alter immutable source order facts.

## Transactional boundary

The sealed result is **not** an authorized or created order. When an independently reviewed order writer is implemented, it must:
1. Bind an authenticated user and verified product/store eligibility, lock and verify current saved pricing and stock, and allocate a canonical UUID and UTC purchase time **in a single database transaction**.
2. Encrypt customer delivery using this adapter before inserting the envelope in that same transaction, without emitting address or HMAC fields to public logs or BTCPay metadata.
3. Persist immutable lines, stock reservation, delivery envelope and duplicate-safe request identity atomically; deny incomplete or duplicate conflicting commits.
4. Keep payment/fulfillment gates off until independent authorizations and payment settlement evidence are verified.

This utility cannot satisfy the atomic transaction or payment gates by itself. The existing server endpoint `POST /api/checkout/handoff/v1` stays HTTP 503. Track 3 may consume only the existing supplier-scoped read-only held-order headers until a separate, authorized, privacy-preserving detail projection is verified.

## Acceptance

Node test suite covers encrypt/decrypt round-trip, unique nonces, same-store/order/key binding, forged metadata, modified ciphertext, nonce, tag, bad keys, malformed delivery and public checkout disabled. CI must pass lint/typecheck/Node/Next build and existing isolated RLS checks at the exact PR head. Vercel preview must be READY; no automatic production commercial activation is permitted.
