# Apex interactive demo shopping cart — November 1, 2026

## Scope
Test-only public UX pass. A small basket counter is now shown alongside the hamburger menu on the existing live Apex site while `APEX_CHECKOUT_MODE=demo`. It opens a black/crimson mobile drawer with a clear empty state, sample item quantity controls (0–5), remove/clear, sample subtotal, "Continue shopping" and "Continue to demo checkout". All forms and payment statuses are simulated.

The catalog receives **a separately labeled fictional merchandise shelf**, with "Add to demo cart" buttons for an Apex Demo Shirt and Apex Demo Bottle. **Published supplier products are not added to the cart:** the current read-only public catalog has no authoritative approved price/shipping/stock record exposed and may contain regulated inventory. Adding those items or accepting real money requires a separately approved commerce/merchant/legal and server-side pricing plan, not a UI change.

## Shared state, no transactions
- One `DemoCartProvider` surrounds the existing root layout, header and pages, preserving cart state through Next.js page transitions.
- The browser persists **only** whitelisted demo SKU ID and 0–5 quantity in `localStorage` (`apex_demo_cart_v1`) so a reload keeps the sample cart; schema version, count and unknown IDs are validated on load. Guest email, shipping address, phone and payment state are **never persisted**.
- The checkout demo reads that shared cart; no longer preloads $59 of fictitious items in advance. Empty cart can't continue; visitors return to the sample catalog to add items.
- Reset after the simulated confirmation clears the sample cart. All item prices are hardcoded within the fictional sample model and calculated using integer cents.
- Only `APEX_CHECKOUT_MODE=demo` renders the header cart and demo shelf. The existing server-side checkout gate continues to reject `live`, unknown or unset settings.
- No network request, Supabase mutations, provider API calls, wallets, QR codes, order records, invoices, payouts or shipments. This is a **demo**, not a functional marketplace cart.

## Quality and acceptance
- Tests: quantity/ID strict allowlist, storage roundtrip and schema invalidation, cart subtotal, shared state wiring, no external network APIs, accessible drawer with Escape/tab/backdrop, and existing checkout/security/DB regressions.
- Responsive: compact cart button at right of logo next to hamburger on iPhone; panel is full-screen width on mobile, fixed-right on desktop, with sticky summary and native scrolling.
- Check with users on real iPhones (incl. embedded browser): add shirt then bottle, reopen drawer, change quantities/remove/clear, navigate to checkout, refresh and verify local-only quantities persist, use coupon and test payment status. Confirm the original published supplier cards remain read-only and NO sale is possible.
- Deployment: exact-head GitHub CI green before merging. Vercel production READY and apexanabolics.co alias checked on the merged SHA.

Next review: partner feedback on mobile drawer size/position before new real product eligibility, checkout and pricing work. All payment PRs remain separate and unmerged.
