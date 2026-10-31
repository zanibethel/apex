/** Pure allocation preview engine. No payment processing or settlement side effects. */
const MAX_SATS = 2100000000000000n;
const ID = /^[a-zA-Z0-9_-]{1,100}$/;
export function allocateSats(totalSats, allocations) {
  if (typeof totalSats !== "string" || !/^\d+$/.test(totalSats)) throw new Error("Amount must be an integer satoshi string");
  const total = BigInt(totalSats);
  if (total > MAX_SATS) throw new Error("Amount exceeds Bitcoin supply");
  if (!Array.isArray(allocations) || allocations.length === 0 || allocations.length > 1000) throw new Error("Invalid allocation count");
  const ids = new Set();
  let sum = 0;
  const parts = allocations.map(({recipientId, basisPoints}) => {
    if (typeof recipientId !== "string" || !ID.test(recipientId) || ids.has(recipientId)) throw new Error("Invalid or duplicate recipient");
    ids.add(recipientId);
    if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10000) throw new Error("Invalid percentage");
    sum += basisPoints;
    const numerator = total * BigInt(basisPoints);
    return {recipientId, basisPoints, sats: numerator / 10000n, remainder: numerator % 10000n};
  });
  if (sum !== 10000) throw new Error("Allocation percentages must total 100%");
  let residual = total - parts.reduce((acc, p) => acc + p.sats, 0n);
  const ordered = [...parts].sort((a,b) => a.remainder === b.remainder ? a.recipientId.localeCompare(b.recipientId, "en") : a.remainder > b.remainder ? -1 : 1);
  for (const p of ordered) { if (residual === 0n) break; p.sats += 1n; residual -= 1n; }
  return {totalSats:total.toString(), allocations:parts.map(p=>({recipientId:p.recipientId,basisPoints:p.basisPoints,amountSats:p.sats.toString()}))};
}
export function selectRule(rules, {storefrontId,supplierId,productId,at}) {
  const now = new Date(at);
  if (Number.isNaN(now.valueOf())) throw new Error("Invalid effective time");
  const priority = {product:3,supplier:2,storefront:1};
  const ids = {product:productId,supplier:supplierId,storefront:storefrontId};
  const matches = rules.filter(r=>r.status==="active" && priority[r.scopeType] && ids[r.scopeType] === r.scopeId && new Date(r.effectiveFrom) <= now && (!r.effectiveTo || now < new Date(r.effectiveTo)));
  matches.sort((a,b)=>priority[b.scopeType]-priority[a.scopeType]);
  if (!matches.length) throw new Error("No active allocation rule");
  if (matches.length>1 && matches[0].scopeType===matches[1].scopeType) throw new Error("Overlapping active allocation rules");
  return matches[0];
}
