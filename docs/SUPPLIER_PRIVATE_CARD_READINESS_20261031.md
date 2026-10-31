# Supplier card readiness cues — October 31, 2026

Scope: Private, authenticated bulk product workspace at `/supplier/catalog/bulk`. Based on merged PR #90, which supplies title/SKU search and status filters.

## Supplier experience

Each saved or unsaved product card shows a compact, neutral status pill beside its title. A native collapsed **Status details** or **N setup items remaining** disclosure contains an explanation and, when available, the exact missing draft fields. The disclosure is keyboard and mobile accessible and stays collapsed until selected; it does not create another sticky overlay.

Status priority is:
1. New / locally changed unsaved draft. Do not claim that server checks reflect edits still in the browser.
2. Unavailable server state. Fail closed; never call a product ready when listing data is missing.
3. Administrative hold (wins over local or persisted request).
4. Required administrator review (wins over local or persisted request).
5. Private publication request recorded. Do not call this live.
6. Missing draft setup fields, including persisted image/stock. Show the count and missing labels from the existing server-side eight-field checklist.
7. Complete private draft ready to *request* publication, not approved for public sale.
8. Unrecognized/ineligible server state: unavailable fallback.

**Important**: The supplier readiness helper is only a presentation utility. Neither a completed draft nor a saved supplier request establishes legal authorization, public release, storefront visibility, checkout, or payable inventory. The existing server-side membership check, catalog RPC, listing hold precedence and disabled public release gate remain authoritative.

## Verification

- Unit tests for each state, admin hold over request priority, unavailable fail-closed handling, incomplete draft setup and no implicit public publication.
- Source checks assert statuses originate from existing authenticated server checks and only populate private card display.
- App lint, TypeScript, Node tests and Next build plus isolated PostgreSQL RLS integration must pass on exact PR head.
- On iPhone, review a synthetic saved product with missing image/stock and expand status details; confirm useful labels, no horizontal overflow or sticky action-bar overlap.
- Check admin hold and review state in authorized accounts; verify the private Publish action stays disabled on those products.
- Verify a newly edited unsaved card says **Unsaved edits** rather than implying its stored state is current.

No database migrations, no production data edits, no product/public visibility flag changes, no new public storage policy, no orders, and no payment activation. Leave the PR for review until exact-head checks are green.
