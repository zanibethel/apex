# Apex — CoOperative Embedded Chat v1 (read-only)

**Status:** Review-only branch. No deployment or live-commerical release authorization.

## Scope
- Text-only floating widget in the shared Apex layout, available to visitors and signed-in suppliers.
- \`POST /api/assistant\` validates a short request, applies a best-effort per-instance rate limit, then reads ONLY \`readApprovedSoldOutCatalog()\` (at most three pages / 72 approved public listings).
- This uses the same independently authorized, public \`get_public_inventory_catalog\` projection as the catalog page. If its release gate is disabled, errors, or the feed is unavailable, the assistant discloses unavailability and shows **no** product/pricing facts.
- No cart, invoice, product mutation, account data, supplier drafts, internal costs, stock quantities, images, uploads, web browsing, or payments.
- Deterministic code handles the first stage; no paid LLM calls, automatic AI fallback, or CoOperative balance usage.
- UI chat history remains in this browser session's React state only; no server conversation storage.
- Suggestions are limited to browsing and comparing the public listing fields; no personalized medical advice.

## Integration contract
CoOperative PR \`feat/cooperative-apex-embedded-chat-v1\` exposes a private, authenticated \`POST /api/embed/apex/chat\` endpoint. Both apps use the same versioned deterministic responder.

**Apex server-only environment variables** (do not prefix with NEXT_PUBLIC):
- \`COOPERATIVE_APEX_CHAT_URL\` — full HTTPS endpoint URL (not a browser-accessible route).
- \`COOPERATIVE_APEX_CHAT_TOKEN\` — shared random secret, >=32 characters.

**CoOperative server-only variable:**
- \`COOPERATIVE_APEX_EMBED_TOKEN\` — the same shared secret, >=32 characters.

The payload is \`{ version: 1, message, catalogState, products }\`, where each product contains ONLY \`id, name, priceCents, currency, availability, categoryName\` from the approved public projection. No account identity, cookies, supplier role, private pricing, or user auth tokens are added by Apex. Because the visitor types freeform text, their own message could contain personal details; do not submit sensitive information. The server rejects unauthenticated requests. Apex validates returned content and only permits internal catalog/supplier links.

Until both PRs are verified, merged, deployed, and environment variables configured, Apex uses the matching deterministic local fallback. Do not advertise a *connected* CoOperative service or an AI model until the remote endpoint has been tested end-to-end.

## Manual review steps
1. On the unmerged Apex preview, open home, catalog, and supplier sign-in pages on mobile and desktop; open/close chat and verify no layout interference.
2. Ask \`hello\`, \`shipping\`, \`checkout\`, \`create a product\`, and a dosage question. Verify bounded, non-transactional replies and no actions.
3. With the public catalog release gate off, ask for product prices. Expect no listing cards and no guessed prices. Verify supplier drafts remain private.
4. With a separately approved synthetic public feed, verify exact product name, price, availability, and an internal details link. Do not enable real product publishing to test this.
5. Verify request length rejection, per-instance 429 throttling, and no secrets in browser network requests.
6. After separately configuring remote credentials in a test deployment, verify CoOperative returns \`source: cooperative-code-v1\`; remove the token to verify local failover returns \`source: apex-local-code-v1\`.
7. Run \`npm run check\` and \`node --test tests/apex-cooperative-embed.test.mjs\` in Apex; run \`node --test tests/apex-embed.test.mjs\` and typecheck/build in CoOperative.

## Next gates
Persistent distributed quota / abuse protection, audit/privacy review, optional genuinely free qualified text-model routing with execution-time cost guardrails, and authenticated supplier-specific draft tools are separate reviewed changes. Publishing, sales, and fulfillment gates remain unchanged.
