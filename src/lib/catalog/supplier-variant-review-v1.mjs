// Private supplier review contract for already-resolved parent/option rows.
// This module has no persistence, publication, inventory, checkout or provider writes.
// Raw supplier workbooks and retail prices must never be committed as fixtures.
export const SUPPLIER_VARIANT_REVIEW_VERSION = 1;
export const SUPPLIER_VARIANT_REVIEW_LIMIT = 500;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SKU = /^[A-Z0-9][A-Z0-9._-]{0,59}$/;
const PRICE = /^\$?(\d{1,7})(?:\.(\d{1,2}))?$/;
const OPTIONS = Object.freeze(["MCT", "GSO", ""]);
const DANGEROUS_SHEET_CELL = /^[\s\u0000-\u001f]*[=+@\-]/u;
const EXACT_KEYS = Object.freeze([
  "sourceRow", "parentTitle", "strength", "size", "carrierOil",
  "retailPrice", "sku", "requiresClarification",
]);
const EXISTING_KEYS = Object.freeze([
  "id", "storeId", "parentTitle", "strength", "size", "carrierOil",
  "retailPriceCents", "sku",
]);
const exact = (x, keys) => x !== null && typeof x === "object" &&
  !Array.isArray(x) && Object.keys(x).length === keys.length &&
  Object.keys(x).every(key => keys.includes(key));
const fail = reason => Object.freeze({ ok: false, reason, rows: Object.freeze([]), blockers: Object.freeze([]) });
const text = (value, max = 120) => {
  if (typeof value !== "string" || value.length > max * 2) return null;
  const trimmed = value.normalize("NFKC").trim().replace(/\s+/g, " ");
  return trimmed.length <= max ? trimmed : null;
};
const token = x => x.toLocaleLowerCase("en-US");
const cents = value => {
  if (typeof value !== "string") return null;
  const m = PRICE.exec(value.trim());
  if (!m) return null;
  const amount = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(amount) && amount > 0 && amount <= 999999999 ? amount : null;
};
const isCents = n => Number.isSafeInteger(n) && n > 0 && n <= 999999999;
const variantKey = (storeId, parentTitle, strength, size, carrierOil) =>
  JSON.stringify([storeId.toLowerCase(), token(parentTitle), token(strength), token(size), carrierOil]);
const blocked = (sourceRow, reason) => Object.freeze({ sourceRow, reason });

function normalizedCandidate(input, storeId) {
  const sourceRow = input && Number.isSafeInteger(input.sourceRow) && input.sourceRow >= 2 &&
    input.sourceRow <= 1000000 ? input.sourceRow : null;
  if (!exact(input, EXACT_KEYS) || sourceRow === null) return { blocker: blocked(sourceRow, "invalid_row_shape") };
  const parentTitle = text(input.parentTitle);
  const strength = text(input.strength, 100);
  const size = text(input.size, 60);
  const carrierOil = text(input.carrierOil, 20);
  const sku = input.sku === "" ? null : text(input.sku, 60)?.toUpperCase();
  const retailPriceCents = cents(input.retailPrice);
  if (!parentTitle || strength === null || size === null || carrierOil === null ||
    [parentTitle,strength,size].some(v => DANGEROUS_SHEET_CELL.test(v)) ||
    !OPTIONS.includes(carrierOil) || (sku !== null && !SKU.test(sku)) ||
    typeof input.requiresClarification !== "boolean" ||
    // Slash-delimited options are not one resolved variant. The reviewer must
    // assign a price to each actual option; never Cartesian-expand these here.
    strength.includes("/") || size.includes("/"))
    return { blocker: blocked(sourceRow, "unresolved_or_invalid_options") };
  if (input.requiresClarification || retailPriceCents === null)
    return { blocker: blocked(sourceRow, "needs_supplier_price_or_option_confirmation") };
  return { candidate: Object.freeze({
    sourceRow, parentTitle, strength, size, carrierOil, sku,
    retailPriceCents,
    variantKey: variantKey(storeId, parentTitle, strength, size, carrierOil),
  }) };
}

function indexExisting(rows, storeId) {
  const byKey = new Map(), bySku = new Map(), byId = new Set();
  const ambiguousKeys = new Set(), ambiguousSkus = new Set();
  for (const row of rows) {
    if (!exact(row, EXISTING_KEYS) || !UUID.test(row.id) ||
      typeof row.storeId !== "string" || row.storeId.toLowerCase() !== storeId ||
      !isCents(row.retailPriceCents) || !SKU.test(row.sku) ||
      byId.has(row.id.toLowerCase())) return null;
    byId.add(row.id.toLowerCase());
    const normalized = normalizedCandidate({
      sourceRow: 2, parentTitle: row.parentTitle, strength: row.strength,
      size: row.size, carrierOil: row.carrierOil,
      retailPrice: String(Math.floor(row.retailPriceCents / 100)) + "." +
        String(row.retailPriceCents % 100).padStart(2, "0"),
      sku: row.sku, requiresClarification: false,
    }, storeId);
    if (!normalized.candidate) return null;
    const k = normalized.candidate.variantKey;
    if (byKey.has(k)) ambiguousKeys.add(k);
    else byKey.set(k, row);
    const s = row.sku;
    if (bySku.has(s)) ambiguousSkus.add(s);
    else bySku.set(s, row);
  }
  return { byKey, bySku, ambiguousKeys, ambiguousSkus };
}

// All rows are proposals only. It is invalid for this contract to authorize
// public publication, stock adjustment, order admission, or a payment.
export function buildSupplierVariantReviewV1(payload) {
  if (!exact(payload, ["schemaVersion", "storeId", "rows", "existingVariants"]) ||
    payload.schemaVersion !== SUPPLIER_VARIANT_REVIEW_VERSION ||
    typeof payload.storeId !== "string" || !UUID.test(payload.storeId) ||
    !Array.isArray(payload.rows) || !payload.rows.length ||
    payload.rows.length > SUPPLIER_VARIANT_REVIEW_LIMIT ||
    !Array.isArray(payload.existingVariants) || payload.existingVariants.length > 2000)
    return fail("invalid_review_request");
  const storeId = payload.storeId.toLowerCase();
  const existing = indexExisting(payload.existingVariants, storeId);
  if (!existing) return fail("invalid_or_cross_store_existing_snapshot");
  const input = [];
  const blockers = [];
  for (const row of payload.rows) {
    const parsed = normalizedCandidate(row, storeId);
    if (parsed.blocker) blockers.push(parsed.blocker);
    else input.push(parsed.candidate);
  }
  // Canonical option identity is independent of retail price. If two source
  // rows disagree, hold ALL occurrences rather than trusting input order.
  const byKey = new Map();
  const bySku = new Map();
  for (const row of input) {
    if (!byKey.has(row.variantKey)) byKey.set(row.variantKey, []);
    byKey.get(row.variantKey).push(row);
    if (row.sku) {
      if (!bySku.has(row.sku)) bySku.set(row.sku, new Set());
      bySku.get(row.sku).add(row.variantKey);
    }
  }
  const reviewRows = [];
  let duplicatesSuppressed = 0;
  for (const [key, group] of byKey) {
    const row = group[0];
    const conflictingInputs = group.some(other =>
      other.retailPriceCents !== row.retailPriceCents || other.sku !== row.sku);
    if (conflictingInputs) {
      for (const r of group) blockers.push(blocked(r.sourceRow, "conflicting_source_option"));
      continue;
    }
    duplicatesSuppressed += group.length - 1;
    if ((row.sku && (bySku.get(row.sku).size > 1 ||
      existing.ambiguousSkus.has(row.sku))) || existing.ambiguousKeys.has(key) ||
      existing.ambiguousSkus.has(existing.byKey.get(key)?.sku)) {
      blockers.push(blocked(row.sourceRow, "duplicate_sku_or_existing_option"));
      continue;
    }
    const matched = existing.byKey.get(key);
    const sameSkuElsewhere = row.sku && existing.bySku.get(row.sku);
    if ((sameSkuElsewhere && sameSkuElsewhere.id !== matched?.id) ||
      (matched && row.sku && matched.sku !== row.sku)) {
      blockers.push(blocked(row.sourceRow, "sku_option_identity_conflict"));
      continue;
    }
    const status = !matched ? "proposed_new" :
      matched.retailPriceCents === row.retailPriceCents ? "existing_unchanged" : "proposed_edit";
    reviewRows.push(Object.freeze({
      ...row,
      sku: row.sku ?? matched?.sku ?? null,
      existingId: matched?.id ?? null,
      status,
      sourceCostCents: null, verifiedOnHand: null,
      canPublish: false, canPlaceOrder: false, canAdjustStock: false,
    }));
  }
  return Object.freeze({
    ok: true, schemaVersion: SUPPLIER_VARIANT_REVIEW_VERSION,
    storeId, inputCount: payload.rows.length,
    duplicatesSuppressed, rows: Object.freeze(reviewRows),
    blockers: Object.freeze(blockers),
    hasUnresolvedIssues: blockers.length > 0,
    canApplyChanges: false, canPublish: false,
  });
}
