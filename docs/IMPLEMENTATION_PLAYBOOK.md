# Implementation playbook

This project uses the same small-pass discipline as our other repositories: **inspect, plan, implement one bounded change, test, open PR, review, then merge**.

The **authoritative daily/weekly work schedule** is [EXECUTION_PLAN_6_WEEKS.md](EXECUTION_PLAN_6_WEEKS.md). Record a daily check-in and Day 7 gate using [WEEKLY_CHECKIN_TEMPLATE.md](WEEKLY_CHECKIN_TEMPLATE.md). No unplanned feature jumps.

## Every work session
1. Read `docs/PROJECT_STATUS.md`, the open PR/issue list and `docs/ROADMAP.md`.
2. Pick the smallest deliverable with an observable acceptance test.
3. Pull latest changes (`git pull`) and start local dev when a Next.js app exists (`npm run dev`).
4. Implement with tests; use demo/sample data until supplier and payment approvals.
5. Run lint, typecheck, tests and basic security checks where available.
6. Commit and push: `git add .`, `git commit -m "scope: change"`, `git push`.
7. Open PR with scope, risks, test output, screenshots as applicable, and rollback notes.
8. Update `PROJECT_STATUS.md` and `DECISIONS.md` when a decision changes.

## Planned PR sequence after documentation
- PR A: Next.js/TypeScript application skeleton, scripts, CI, .env.example **placeholders**, safe mock content.
- PR B: design tokens, responsive layout, navigation and catalog views.
- PR C: Supabase schema/RLS/auth and explicit supplier isolation tests.
- PR D: order/cart/inventory flow and transactional email abstraction.
- PR E: reporting and immutable ledger design with test fixtures.
- PR F: isolated Bitcoin **testnet** adapter plus BTCPay/Prism integration spike and documented limitations.
- PR G: hardening, monitoring, restore test and launch readiness checklist.

## Guardrails
- No real BTC, live inventory or production launch on a planning approval alone.
- Never disclose secrets in issues, PR diffs, screenshots or CI output.
- Keep technical scope narrow during six-week sprint; record later enhancements without shipping them.
- Avoid claiming automatic two-wallet **direct** settlement until verified. Prism may use delayed payout forwarding.
- Never merge broken tests or deploy without review.
