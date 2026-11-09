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

## Authenticated preview handshake — November 9, 2026

- The preview-only secret was installed in both Vercel projects, and Apex's preview-only endpoint URL was configured. All three variables are scoped strictly to these two feature branches, not production.
- Apex preview made a server-to-server POST with \`{version:1,message:"hello",catalogState:"unavailable",products:[]}\` using only the encrypted server-side credential.
- Its temporary, preview-only diagnostic returned \`{"connected":true,"status":200,"source":"cooperative-code-v1"}\`. This confirms an actual remote response, not the built-in Apex fallback.
- The diagnostic route was deleted immediately afterward, before merge. The initial GitHub-hosted HTTP smoke test failed with 401 because GitHub Actions was not authorized to enter the protected Vercel preview; it was removed and is not evidence of a service error.
- Both previews previously reported READY. Apex's full quality checks passed on its recent feature commits; confirm checks again after the final cleanup commit. CoOperative's focused embed test passed, while its existing broad CI remains blocked by unrelated lint errors.
- This is evidence for cross-service connectivity and basic text protocol, **not** approval to enable live product release, checkout, supplier mutations, or production credentials. Never set production secrets or merge without the remaining review checks.

## FAQ / zero-model routing update — 2026-11-09

Phase 1 now provides a versioned, reviewable rule bank in \`src/lib/chat/apex-knowledge.mjs\` (mirrored in CoOperative as \`lib/runtime/embed-apex-knowledge.mjs\`). It covers 23 intent families with tested phrasings: greetings, capabilities, bot identity, account access and password recovery, supplier access, draft/product changes and inventory, supplier reports, privacy, discounts, shipping, returns, order tracking, checkout/payment readiness, stock/restock, product-use safety, pricing/tax uncertainty, catalog navigation, public hours/pickup uncertainty, support, and launch timing.

**Request decision path:**
1. Validate size, rate-limit and text; use \`answerApexKnowledge\` first. If matched, answer locally without public catalog I/O or CoOperative network requests.
2. Otherwise use only the existing approved public catalog projection for product search and prices; never use unpublished supplier data or invent prices/stock.
3. Remote CoOperative code-only fallback is disabled unless a server-only \`COOPERATIVE_APEX_REMOTE_FALLBACK=enabled\` flag is explicitly set. The existing remote integration still requires the shared secret and response integrity validation.
4. Unknown or unavailable questions return a bounded, non-generative explanation and public navigation link. There is **no automatic AI/provider escalation** and no model charge by default.
5. Rule ordering is intentional: medical/use refusals, supplier mutations, auth/privacy and transaction limits must precede broad product searches. Update both copies of the rule bank and run each repo's focused tests whenever an intent changes.

**Release truth:** These written replies describe the current checkout-disabled site. Before enabling commerce or shipping, review every claim and change the FAQ along with published policies; do not ship outdated hard-coded checkout/payment claims. Future admin-managed FAQ editing would need an authorization, preview, audit and policy-approval workflow; this PR adds no unsafe public content editing.

**Coverage limits:** No fixed FAQ table can anticipate every user sentence. Misses use a safe local fallback and can be added as tested rules later. Do not add external AI calls just because a pattern was missed.


## Supplier owner/manager catalog chat — PR #313

The shared floating **Apex Assistant / Powered by CoOperative Chat** recognizes signed-in supplier owner/manager roles through server-derived membership. For supplier operations, it calls the Apex-local \`/api/assistant/supplier\` endpoint only. **Private product names, SKUs, prices, and listing state are never forwarded to CoOperative or any model.**

- **Ask**: "show my products", "find [product name]", "show prices", "publish [product name]", or "unpublish [product name]". Results link to authenticated supplier product preview; only a small set of matched saved products is returned per reply.
- **Request publication**: select a product's *Review publish request* button, examine the exact product and non-public warning, then press *Confirm request*. Supplier owner/manager verification, one-private-store scope, session, product revision, listing state and same-origin restrictions are rechecked on the server.
- **Persist**: the existing audited \`set_supplier_listing_intent\` RPC saves supplier preference and enforces content completeness and admin hold rules. The user sees the returned status and is reminded that **public release is separate**.
- **Withdraw**: choose a requested product and confirm *Review unpublish request*. Stale or replayed confirmations fail; use a fresh product query.
- **No bulk/public release**: the RPC never modifies \`products.is_published\`, supplier/product eligibility authorizations, the global public-release gate, purchases, shipments, stock, or prices. A supplier request is not an authorization to list regulated products or a public listing.
- **Feature flag**: \`APEX_DRAFT_CATALOG_WRITES_ENABLED=true\` remains required for listing intent changes. Read-only product questions work independently when authorized.
- **Multi-store**: fail closed if the signed-in owner/manager has more than one private supplier store in this initial scope; use the existing Products workspace to select and manage store changes. No client-controlled store IDs.
- **Zero model cost**: supplier requests are local, deterministic Supabase reads + existing RPC. No CoOperative service request or AI call.

### Manual acceptance

1. Sign out, open chat and ask "publish product": it must show only public FAQ and must not reveal draft products.
2. Sign in as supplier owner or manager, open chat and ask "show my products": only the assigned saved records should appear.
3. Ask "publish [exact product]". Select *Review publish request*; **Cancel** must make no change. Re-open and **Confirm request** for a complete non-held product. Verify the supplier preference and audited event in Products; verify public catalog remains gated.
4. Reuse the same confirmation, change product details in another session before confirming, or try a product belonging to another supplier: no state change.
5. An admin-held product and inactive products must not be offered an actionable publication request; an unverified or incomplete product must be rejected by the existing RPC.
6. Ask to "unpublish [product]" and confirm. Verify only supplier request status changed. Verify older chat copies cannot repeat an action without a fresh review.
7. Check mobile chat header, text box focus (iPhone input 16px), and keyboard while the confirmation is open.

### Limitations

This is **supplier-side publication intent**, not live public publishing. Production public release remains disabled until separate product/supplier approval, regulated-product authorization, release migration, and documented launch verification. This first slice does not create/edit products through free text, does not infer an arbitrary target from ambiguity, and does not perform unconfirmed bulk changes.
