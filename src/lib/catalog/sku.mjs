import { randomUUID } from "node:crypto";
import {draftSkuFromUuid} from "./sku-format.mjs";

// Supplier-facing SKUs are store-scoped identifiers, not product publication IDs.
// New draft SKU creation stays on the server; never trust a client-generated value.
const skuPattern = /^[A-Z0-9][A-Z0-9._-]{0,59}$/;

export function normalizeSku(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return skuPattern.test(trimmed) ? trimmed : null;
}

export function generateDraftSku(name, createId = randomUUID) {
  return draftSkuFromUuid(name,String(createId()));
}

// Blank on create means automatic. Blank on edit is invalid, so a saved SKU
// cannot disappear from an existing product.
export function chooseNewSku(input, name) {
  if (input === "") return generateDraftSku(name);
  return normalizeSku(input);
}
