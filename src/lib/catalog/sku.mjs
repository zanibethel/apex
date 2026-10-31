import { randomUUID } from "node:crypto";

// Supplier-facing SKUs are store-scoped identifiers, not product publication IDs.
// New draft SKU creation stays on the server; never trust a client-generated value.
const skuPattern = /^[A-Z0-9][A-Z0-9._-]{0,59}$/;

export function normalizeSku(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toUpperCase();
  return skuPattern.test(trimmed) ? trimmed : null;
}

export function generateDraftSku(name, createId = randomUUID) {
  const base = String(name ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 28)
    .replace(/-+$/g, "") || "PRODUCT";
  const id = String(createId());
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Draft SKU ID must be a UUID");
  }
  return "APX-" + base + "-" + id.slice(0, 8).toUpperCase();
}

// Blank on create means automatic. Blank on edit is invalid, so a saved SKU
// cannot disappear from an existing product.
export function chooseNewSku(input, name) {
  if (input === "") return generateDraftSku(name);
  return normalizeSku(input);
}
