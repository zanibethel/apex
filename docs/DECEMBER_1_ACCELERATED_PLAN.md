# Apex — December 1 accelerated technical readiness schedule

**Planning status (October 29, 2026): proposed stretch target, pending supplier funding and project inputs.** The existing six-week roadmap remains the contingency. This plan is for a technically reviewable demonstration, not a guarantee of live commercial launch.

## Conditions
- Proposed kickoff by October 30 once funding, agreed scope and initial supplier materials are actually received.
- Developer work target: **3–4 focused hours daily**, approximately **90–120 hours** over the available period.
- Prioritize the founding supplier's one branded storefront, catalog navigation, authenticated administration, inventory, demo orders, reports, accessibility, and production-readiness testing.
- Additional features, including holiday flash sales, remain optional until the core acceptance tests pass.
- Third-party approvals, security reviews and any required legal clearances remain independent launch gates.

## Dated sprint checkpoints

| Sprint | Dates | Reviewable deliverable |
|---|---|---|
| 1 | October 30–November 5 | Project setup, basic app, automated checks, brand foundation, and external-dependency assessment |
| 2 | November 6–12 | Mobile storefront, searchable sample catalog, sign-in and protected supplier workspace |
| 3 | November 13–19 | Demo order management, inventory changes, clear daily/weekly sales reporting and payment-architecture decision |
| 4 | November 20–26 | Test integrations, security and authorization checks, backup/restore rehearsal, and reporting verification |
| 5 | November 27–December 1 | Mobile QA, regression testing, supplier demonstration, documentation and technical signoff |

## Daily work contract
1. **15 minutes:** inspect open PRs and issues, pick today's highest-priority bounded outcome.
2. **2–2.5 hours:** develop and integrate one reviewable improvement.
3. **30–45 minutes:** run tests, document evidence and commit or update the current PR.
4. Use remaining time for blocker research, quality assurance and partner review.
5. End every sprint with a demonstration, a recorded pass/blocked status, and a written next-sprint plan.

## Hard gates
- **November 5:** working app with continuous checks; track funding or missing content openly.
- **November 12:** partner walkthrough of storefront and an explicit decision on integration feasibility.
- **November 19:** end-to-end demo-order flow and trustworthy reporting; unresolved payment mechanics documented, not portrayed as working.
- **November 26:** freeze optional features; resolve critical defects and complete security/recovery checks.
- **December 1:** partner accepts a technically reviewable site or receives a transparent blocker list and updated milestone.

## Scope control
- Defer advanced campaigns, AI browsing helpers, additional suppliers, and nonessential animations before compromising core testing.
- Keep sensitive business records and credentials out of this public GitHub repository.
- Do not activate real-money checkout without all relevant authorizations and documented payment-security approval.
- If kickoff is delayed, recalculate the dates rather than silently reducing verification.
