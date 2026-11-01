# Checkout mobile pass — iOS no-zoom and searchable state picker (Nov 1, 2026)

User iPhone screenshots showed viewport auto-zoom on focus of the tiny two-letter State text input. This small independent UI fix changes only the **nontransactional live demo** at `/checkout/preview`:

- All text fields (including coupon and state search) use minimum CSS `font-size:16px` to prevent iOS Safari/WebView automatic zoom on keyboard focus. There is **no** `maximum-scale` or `user-scalable=no` restriction; users retain pinch zoom.
- The State field is now a clear button displaying the selected name and abbreviation. Tap to open an accessible `role=dialog` picker with 50 states + D.C.; scroll inside the list or type a full/partial state name or abbreviation to filter.
- Select a result to fill the canonical two-letter abbreviation in the draft form. The picker supports Escape, backdrop close and Enter on an unambiguous typed state. Search is in browser memory only.
- State validation accepts a recognized full name or abbreviation rather than arbitrary two-letter text. Existing user information and sample values stay local to React state, with no network call or persistence.
- Styling remains Apex dark/crimson and responsive to small iPhone screens.

**No supplier catalog, live checkout, order, API, BTC wallet, invoice or payout change.** Server environment gate remains exact `APEX_CHECKOUT_MODE=demo`; `live` is unimplemented and fails closed.

Acceptance: full exact-head GitHub quality + PostgreSQL, production deployment READY after review, Apex domain alias points to that deployment. Manually verify iOS focus no longer autozooms, list scrolls while open, state search and selection work with the keyboard, and checkout sample can progress normally.
