// Deterministic chat-edit proposals. Pure and read-only: authenticated
// supplier route enforces tenant scope, CAS checks, and writes.
const money=c=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(c/100);
const stop=new Set(["set","change","update","edit","make","mark","the","my","a","an","product","item","listing","price","pricing","stock","inventory","quantity","on","hand","to","at","of","for","please","this","in","out","sold","available","units","items","pieces","now","as","is","from","with","and","be","it"]);
export function parseSupplierEdit(message){
 if(typeof message!=="string"||message.length>300)return null;
 const q=message.trim().toLowerCase();
 const editing=/\b(set|change|update|edit|make|mark)\b/.test(q);
 if(!editing)return null;
 const price=/\b(price|pricing)\b/.test(q);
 const stock=/\b(stock|inventory|quantity|sold out)\b/.test(q);
 if(!price&&!stock)return null;
 if(price&&stock)return {kind:"multiple",error:"For now, make one confirmed change at a time: first update price, then stock, then request publication."};
 if(price){
  const value=q.match(/\b(?:to|at|=)\s*\$?(\d{1,7}(?:\.\d{1,2})?)(?![\d.])/);
  if(!value)return {kind:"invalid",error:"Specify a price, for example: set price of Demo Cotton T-Shirt to $24.99."};
  const number=Number(value[1]),cents=Math.round(number*100);
  if(!Number.isSafeInteger(cents)||cents<1||cents>999999999)
   return {kind:"invalid",error:"Choose a valid product price between $0.01 and $9,999,999.99."};
  return {kind:"price",target:cents};
 }
 if(/\b(?:out of stock|sold out)\b/.test(q))return {kind:"stock",target:0};
 const amount=q.match(/\b(?:stock|inventory|quantity)(?:\s+on\s+hand)?\s*(?:to|at|=)\s*(\d{1,7})(?![\d.])/)||
  q.match(/\b(?:to|at)\s*(\d{1,7})\s*(?:units?|pieces?|items?)?(?:\s+(?:in stock|on hand))?(?![\d.])/);
 if(!amount)return {kind:"invalid",error:"Specify an exact on-hand quantity. For example: set stock of Demo Cotton T-Shirt to 10. To mark sold out, say mark Demo Cotton T-Shirt out of stock."};
 const target=Number(amount[1]);
 if(!Number.isSafeInteger(target)||target<0||target>1000000)
  return {kind:"invalid",error:"Stock quantity must be from 0 to 1,000,000."};
 return {kind:"stock",target};
}
function normalized(value){return String(value??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();}
function candidates(message,rows){
 const q=normalized(message);
 const direct=rows.filter(p=>
  (normalized(p.name).length>0&&q.includes(normalized(p.name)))||
  (normalized(p.sku).length>0&&q.includes(normalized(p.sku))));
 if(direct.length)return direct;
 const terms=q.split(" ").filter(t=>t.length>1&&!stop.has(t)&&!/^\d+$/.test(t));
 if(!terms.length)return [];
 return rows.filter(p=>terms.every(t=>normalized(p.name+" "+p.sku).split(" ").some(part=>part.includes(t))));
}
export function proposeSupplierEdit(message,products=[]){
 const request=parseSupplierEdit(message);
 if(!request)return null;
 if(request.kind==="invalid"||request.kind==="multiple")
  return {answer:request.error,items:[],source:"apex-supplier-code-v1"};
 const rows=Array.isArray(products)?products.filter(p=>
  p&&typeof p.id==="string"&&typeof p.name==="string"&&typeof p.sku==="string"&&
  Number.isSafeInteger(p.priceCents)&&typeof p.productUpdatedAt==="string"&&
  (p.stockOnHand===null||Number.isSafeInteger(p.stockOnHand))):[];
 const found=candidates(message,rows);
 if(found.length!==1)return {answer:found.length>1?
  "Multiple products match. Use the exact product name or SKU to avoid changing the wrong product.":
  "I couldn't identify one saved product. Include its exact name or SKU with the new price or stock quantity.",
  items:[],source:"apex-supplier-code-v1"};
 const p=found[0];
 if(p.published)return {answer:"This product is already publicly published. Use the authorized Products editor for a controlled update.",items:[],source:"apex-supplier-code-v1"};
 if(request.kind==="price"){
  if(request.target===p.priceCents)return {answer:"That is already the saved price for "+p.name+". No change is needed.",items:[],source:"apex-supplier-code-v1"};
  if(p.compareAtCents!==null&&p.compareAtCents!==undefined&&request.target>=p.compareAtCents)
   return {answer:"The new price must remain below the saved compare-at price. Update the compare-at price in Products first.",items:[],link:"/supplier/catalog/bulk",source:"apex-supplier-code-v1"};
 }else{
  if(p.stockOnHand===null)return {answer:"No stock ledger is available for this product. Use the Products inventory editor to repair it first.",items:[],source:"apex-supplier-code-v1"};
  if(request.target===p.stockOnHand)return {answer:"That is already the recorded on-hand quantity for "+p.name+". No change is needed.",items:[],source:"apex-supplier-code-v1"};
  if(request.target<(p.stockReserved??0))return {answer:"The requested stock is below the quantity already reserved. Review inventory in Products first.",items:[],source:"apex-supplier-code-v1"};
 }
 const from=request.kind==="price"?money(p.priceCents):String(p.stockOnHand);
 const to=request.kind==="price"?money(request.target):String(request.target);
 const item={id:p.id,name:p.name,sku:p.sku,price:money(p.priceCents),
  availability:p.active?(p.stockOnHand===0?"Sold out":"Stock recorded"):"Inactive draft",
  href:"/supplier/catalog/preview/"+p.id,
  requested:p.requested,held:p.held,
  action:request.kind==="price"?"edit_price":"edit_stock",
  editKind:request.kind,editTarget:request.target,
  editExpected:request.kind==="price"?p.priceCents:p.stockOnHand,
  productUpdatedAt:p.productUpdatedAt,
  controlChangedAt:p.controlChangedAt??null
 };
 return {answer:"Review proposed change for "+p.name+": "+(request.kind==="price"?"price":"on-hand stock")+
  " "+from+" → "+to+". Select Review change, then confirm. This updates only the authorized private product; it does not publish the item or activate checkout.",
  items:[item],link:"/supplier/catalog/bulk",source:"apex-supplier-code-v1"};
}
