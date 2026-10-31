// Strict, display-only conversion for live unsaved product previews.
// An empty or invalid price must not appear as $0.00 or a fake discount.
export function previewUsdCents(value){
 if(typeof value!=="string"||!/^\d{1,7}(?:\.\d{1,2})?$/.test(value)||Number(value)<=0)
  return NaN;
 return Math.round(Number(value)*100);
}
export function previewCompareAtCents(priceCents,compareAtValue){
 if(!Number.isSafeInteger(priceCents)||priceCents<=0||!compareAtValue)return null;
 const compare=previewUsdCents(compareAtValue);
 return Number.isSafeInteger(compare)&&compare>priceCents?compare:null;
}
