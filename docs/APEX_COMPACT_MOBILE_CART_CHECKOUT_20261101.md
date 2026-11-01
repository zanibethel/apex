# Apex mobile density and interaction highlight update — 2026-11-01

**Scope:** demo-only mobile storefront UI. No BTCPay integration, real catalog cart admission, order creation, user data storage, or server gate change.

## User observations and fixes

- The original cart drawer used 100% viewport height, leaving substantial empty space for a one-item cart. On phones, it is now **content-height**, max 354px wide with a small side margin, capped by the viewport height with scrollable line items; compact typography, controls and footer.
- The header cart and menu were two adjacent 44px bordered boxes. They are now **separate SVG icons without borders/background blocks**, with 12–14px spacing and the same 44px interactive targets. Menu logic and cart badge remain unchanged.
- Checkout information fields were excessively tall. The mobile form now uses 9px row spacing, 44px input height and less padding, **16px text** (to avoid iOS focus zoom), first/last name on one row, and State/ZIP on one row.
- The large amber/gold oval around State appears to be **outside the declared application focus styles**: replacing gold CSS outlines with crimson in PR #132 did not remove it on the user's iPhone. This update removes the State trigger's `apex-preview-state` ID and label-ID association to avoid address-form autofill heuristics and ensures its wrapper has no background or focus oval. The button retains accessible label and visible crimson keyboard outline, and the searchable, scrollable picker remains. **The actual cause of the oval is not confirmed**; native browser/OS overlays may be beyond page CSS control.

## Acceptance

- Exact-head GitHub Actions application quality and disposable PostgreSQL/RLS tests.
- Protected Vercel preview READY, reviewed changes merged into `main` only on green checks; verify production alias on the exact merge SHA.
- On iPhone: inspect header icon separation, check cart with one and multiple demo items, scroll its content, close by backdrop/Escape; enter checkout, verify compact two-column name and State/ZIP rows, open State picker, and confirm no keyboard-induced page zoom. Ask for another screenshot if amber oval persists.

**Test only:** no customer payments, shipments or real merchant orders.
