// Read-only supplier catalog reconciliation for the private Products workspace.
// A name match is only a suggestion: it never maps a variant, changes a saved
// product, approves source content, or alters public publishing/checkout.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const SAVED_MATCH_MAX_PRODUCTS=250;
export const MAX_CANDIDATES_PER_PARENT=12;
const cleanName=value=>
 typeof value==="string"
 ?value.normalize("NFKD").toLowerCase()
  .replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"")
 :"";
const savedBase=value=>String(value).split(/\s[—–]\s/,1)[0].trim();

export function reconcileIntakeWithSaved(cards,products){
 if(!Array.isArray(cards)||!Array.isArray(products)||
  cards.length>250||products.length>SAVED_MATCH_MAX_PRODUCTS)return null;
 const parentKeys=new Set(),byKey=new Map();
 for(const card of cards){
  if(!card||typeof card.name!=="string"||!card.name.trim())return null;
  const key=cleanName(card.name);
  if(!key||parentKeys.has(key))return null; // do not guess collisions
  parentKeys.add(key);
 }
 const savedIds=new Set();
 for(const product of products){
  if(!product||typeof product!=="object"||
   typeof product.id!=="string"||!UUID.test(product.id)||
   savedIds.has(product.id)||typeof product.name!=="string"||
   !product.name.trim()||typeof product.sku!=="string"||
   (product.price_cents!==undefined&&
    (!Number.isSafeInteger(Number(product.price_cents))||
      Number(product.price_cents)<0)))return null;
  savedIds.add(product.id);
  const key=cleanName(savedBase(product.name));
  if(!key)continue;
  const arr=byKey.get(key)??[];
  arr.push({
   id:product.id,name:product.name,sku:product.sku,
   priceCents:product.price_cents==null?null:Number(product.price_cents),
  });
  byKey.set(key,arr);
 }
 const joined=[];
 for(const card of cards){
  const suggestions=byKey.get(cleanName(card.name))??[];
  // Never truncate candidate identities silently. A parent with too many
  // potential saved records needs manual investigation before linking.
  if(suggestions.length>MAX_CANDIDATES_PER_PARENT)return null;
  joined.push({
   ...card,savedMatches:[...suggestions].sort((a,b)=>
    a.name.localeCompare(b.name)||a.id.localeCompare(b.id)),
  });
 }
 return joined;
}

export function supplierIntakeMatchSummary(cards){
 if(!Array.isArray(cards))return null;
 return {
  proposedParents:cards.length,
  parentsWithCandidates:cards.filter(c=>c.savedMatches?.length>0).length,
  savedCandidates:cards.reduce((count,c)=>count+(c.savedMatches?.length??0),0),
  withoutCandidates:cards.filter(c=>!c.savedMatches?.length).length,
  heldParents:cards.filter(c=>c.held>0).length,
 };
}
