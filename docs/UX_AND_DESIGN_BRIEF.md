# Partner feedback — premium storefront UX brief

_Last updated: 2026-10-29. Captures anonymized partner feedback; no screenshot, Telegram identifiers, or private communications are stored here._

## What the founding partner wants
A **next-level, clean, beautiful, very easy-to-navigate storefront** that makes finding a product and completing a purchase feel simple. The partner values the clarity of the team's existing website demos and considers streamlined navigation a potential commercial advantage. Brand styling is considered an asset, not a substitute for usable design.

The partner mentioned **Healthy Hippocrates** as a reference for an easy buying journey and **Muscle Candy** and **Primal** as visual quality comparisons. These are *subjective stakeholder impressions*, not a verified competitive audit, endorsement, or request to copy any site's distinctive design.

## Design principles, in priority order
1. **Find it fast:** On mobile, visitors can locate product groups, use search and browse filters without hunting through nested menus.
2. **Low-friction path:** Clear product detail, price, availability, cart and checkout summary; minimize unnecessary steps and distracting promotions.
3. **Premium, consistent appearance:** restrained black / metallic silver / crimson palette; excellent spacing, typography, imagery and contrast.
4. **Clarity before decoration:** no animations, pop-ups or visual effects that delay product discovery or obscure primary actions.
5. **Mobile first, desktop polished:** test phone-sized layouts first, then tablet and desktop.
6. **Trustworthy information:** concise, accurate listings, transparent policies, and no unverified clinical or medical claims.
7. **Fast and accessible:** semantic controls, keyboard support, screen-reader labels, clear focus states, readable text, tested loading states and meaningful empty/error states.

## Proposed screens and structure (initial supplier)
- **Landing:** compact brand navigation, one strong headline, product-category links, selected catalog cards and accessible search.
- **Catalog:** categories, searchable products, compact filter controls and unambiguous prices/stock status.
- **Product details:** clear media, structured description, quantity, stock, shipping-policy link, prominent action.
- **Cart and checkout:** order summary, totals, shipping information, secure BTC invoice status; avoid unnecessary account creation unless legally required.
- **Supplier dashboard:** operational simplicity—orders needing action, stock changes and sales at a glance.
- **Operator dashboard:** daily/weekly sales, commissions and unresolved payments surfaced without clutter.

## Brand tokens (working palette)
- Ink black `#0B0B0E`
- Metallic silver `#BBC2CC`
- Crimson `#A31530`
Final typography, imagery, contrast ratios, buttons and spacing require visual review on real responsive screens; brand is not legally finalized.

## Testable design acceptance checks
- [ ] A first-time tester can locate the catalog from the home screen in **one deliberate action**.
- [ ] A first-time tester can find a sample product using category navigation or search without instructions.
- [ ] Product price, availability and primary action are visually clear on mobile and desktop.
- [ ] A mock checkout has an understandable sequence, transparent totals and useful payment status/error states.
- [ ] No horizontal overflow at common small-phone widths; mobile header/navigation does not overlap content.
- [ ] Keyboard and screen-reader paths are operable; focus indicator and contrast are checked.
- [ ] A partner walkthrough of staging is included in the Week 2 demo and Week 6 acceptance.
- [ ] Actual usability findings are recorded and addressed; a polished appearance alone isn't treated as proof of conversion performance.

## Timeline boundaries
This brief refines the **existing six-week MVP**, rather than adding a new standalone design phase. Week 2 delivers the branded interactive storefront; Week 5 tests accessibility/usability; Week 6 includes partner design acceptance. Keep advanced animations, complex promotional systems and redesign of supplier operations out of MVP unless agreed as a scope tradeoff.

## Future ideas, not week-one dependencies
Previously discussed **code-based** product-finder chat bubble may activate after several seconds of browsing, but should be configurable, dismissible and not interrupt checkout. It is not part of the six-week minimum unless explicitly prioritized against another feature.
