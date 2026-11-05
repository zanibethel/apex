# Apex customer assistant — code-first plan (2026-10-31)

**Status: PLANNED, NOT IMPLEMENTED.** Save the architecture now; priority remains BTCPay regtest integration and secure payment reconciliation. No LLM host, paid model contract, new chat API route, or public chatbot deployment is authorized by this document.

## Product decision
- The first Apex assistant is **mostly deterministic application code**. It is *not* a generative-model-dependent shopper or an autonomous purchasing agent.
- Use existing storefront/product/category data as the only trusted source for product names, SKU, category, description, price, discount, availability, FAQ and support policies.
- Reuse the intended small, unobtrusive chat bubble after a few seconds of browsing, with an easy close/mute path and a keyboard-accessible mobile design. Respect accessibility and do not obscure checkout or navigation.
- Provide searching and conversational-style multi-step prompts using a rule/intent engine first. Main intents: product finder, exact SKU, category navigation, pricing and compare-price explanations, stock status, shipping/ordering process, account help, human support and unknown request.
- Rank products by deterministic SQL/full-text search and explicit category/attribute filters; do not invent compatibility, efficacy, medical indications, cost, stock or discount. Use server-authorized public catalog queries; preserve supplier tenancy and admin hold/publication gates.
- Keep copy, answers and approved FAQs versioned/editable by admin in a later scoped pass; cache safely with expiry and invalidate when products change.

## CoOperative free chat as *optional* fallback
- When the code engine does not confidently resolve a question, show helpful choices and **offer a free-form conversational follow-up** through CoOperative if the connected service and its free tier actually support the use case.
- Integration must go through a server-side Apex adapter/gateway with service authentication, strict scopes, timeouts, rate limits and request/response redaction. **Do not assume a free tier is unlimited, externally callable, or permitted for commercial use**. Confirm API contract, access rights, per-user quotas, uptime and data retention before implementation.
- The LLM receives only the minimal approved public catalog/FAQ context, **not customer purchase history, payment keys, wallet addresses, unpublished supplier content or internal source cost**. Product links/results are rendered from server-returned structured IDs; never trust generated prices or inventory.
- Fail closed to the deterministic assistant when CoOperative is unavailable, slow or over quota, without disrupting shopping. For cost discipline, no automatic LLM calls on page load or every keystroke.
- Separate private moderation/help policies from the model prompt. No medical diagnosis, treatment/dosing recommendations, unsupported health claims or autonomous purchases, refunds or transfers.

## Future dedicated local/self-hosted model — deferred
- Only consider separate dedicated inference hardware/hosting after measured demand, cost and latency justify it.
- Do **not** run model inference on the BTCPay/Bitcoin Core VPS. BTCPay must remain on isolated compute/network and secret boundaries.
- Keep an abstract, vendor-independent provider interface so CoOperative can be replaced later by a hosted local Ollama/Qwen model without rebuilding the code-based finder.
- Gather anonymous opt-in instrumentation (intent success, fallback rate, latency, model cost, agent refusals), with privacy limits and no wallet/customer-data leakage.

## Proposed delivery sequence (after BTCPay priority passes)
1. Deterministic intent resolver, synonym mappings, safe catalog/FAQ retrieval, structured product-card suggestions and test fixtures.
2. Compact responsive chat interface, keyboard/close behavior, no auto-message without consent, and admin-managed FAQ content.
3. Verify CoOperative free-chat connector contract and allowed commercial usage; introduce explicit, capped fallback as an isolated feature flag only if approved.
4. Privacy/redaction, abuse/rate limits, supplier/catalog visibility tests, manual iPhone accessibility acceptance.
5. Observe usage before considering self-hosted model or a separate GPU instance.

## Explicit exclusions in this plan
No model purchases, GPU provision, autonomous payment processing, live checkout activation, wallet access, diagnosis, dosing guidance, or guaranteed free usage. All new code and deployment require separate tested PRs and review.

## Active project priority
**Proceed with BTCPay VPS test provisioning, Greenfield invoice lifecycle, signed webhook processing, idempotent accounting and Prism test-only feasibility before building the AI fallback.**
