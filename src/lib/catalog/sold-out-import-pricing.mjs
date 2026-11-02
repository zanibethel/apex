// Wholesaler pricing proposal for PRIVATE, non-purchasable gallery preview.
// Multiply exact integer cents: retail x2 and proposed compare x2.5,
// round half cents upward. Never return wholesale cost in public catalog JSON.
export function proposedSoldOutPricing(cost) {
 const text=typeof cost==="bigint"?cost.toString():
  typeof cost==="number"&&Number.isSafeInteger(cost)?String(cost):cost;
 if(typeof text!=="string"||!/^[1-9][0-9]{0,8}$/.test(text))return null;
 const source=BigInt(text);
 const sale=source*2n,compare=(source*5n+1n)/2n;
 if(compare>999999999n||sale>999999999n)return null;
 return Object.freeze({
  sourceCostCents:Number(source),
  salePriceCents:Number(sale),
  compareAtCents:Number(compare),
  listedStock:0,
  canAddToCart:false,
  canCheckout:false,
  priceReferenceVerified:false,
 });
}
export function formatPrivatePreviewUsd(cents){
 return Number.isSafeInteger(cents)&&cents>=0
  ?new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100)
  :"Unavailable";
}
