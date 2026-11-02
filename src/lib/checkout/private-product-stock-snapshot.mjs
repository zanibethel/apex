/**
 * Server-side parser for private price+inventory readbacks.
 * Never makes a product sellable; it only helps authorized admins inspect
 * a private, non-transactional observation of existing database rows.
 */
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function safeAmount(value){
 if(typeof value!=="string"||!/^(?:0|[1-9][0-9]{0,11})$/.test(value))return null;
 const cents=Number(value);
 return Number.isSafeInteger(cents)?cents:null;
}
function formatUsd(cents){
 return new Intl.NumberFormat("en-US",{
  style:"currency",currency:"USD",
 }).format(cents/100);
}
export function readPrivateCheckoutSnapshot(raw,storeId,productId){
 const blocked=()=>Object.freeze({
  status:"unavailable",
  observed:false,canQuote:false,canOrder:false,canPay:false,
  priceLabel:"Not verified",availableUnits:null,
  blockers:Object.freeze(["private_snapshot_unavailable","order_admission_disabled"]),
 });
 if(!UUID.test(storeId)||!UUID.test(productId)||
  !raw||typeof raw!=="object"||Array.isArray(raw)||
  raw.schema_version!==1||raw.state!=="observed_private"||
  raw.store_id!==storeId||raw.product_id!==productId||
  raw.currency!=="USD"||typeof raw.name!=="string"||
  raw.name.length<1||raw.name.length>300||
  raw.can_quote!==false||raw.can_order!==false||raw.can_pay!==false||
  !Number.isFinite(Date.parse(raw.observed_at))||
  !Number.isFinite(Date.parse(raw.price_observed_updated_at))||
  typeof raw.is_published!=="boolean"||
  typeof raw.store_is_public!=="boolean"||
  (raw.category_is_published!==null&&typeof raw.category_is_published!=="boolean")||
  typeof raw.inventory_observed!=="boolean")
  return blocked();
 const cents=safeAmount(raw.price_cents);
 if(cents===null)return blocked();
 let availableUnits=null;
 if(raw.inventory_observed){
  const n=raw.quantity_on_hand,r=raw.quantity_reserved,a=raw.quantity_available;
  if(![n,r,a].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=1_000_000_000)||
    r>n||a!==n-r||
    !Number.isFinite(Date.parse(raw.inventory_observed_updated_at)))
   return blocked();
  availableUnits=a;
 }else if(raw.quantity_on_hand!==null||raw.quantity_reserved!==null||
          raw.quantity_available!==null)
  return blocked();
 const blockers=["order_admission_disabled","public_release_gate_disabled"];
 if(cents===0)blockers.push("price_missing");
 if(availableUnits===null)blockers.push("inventory_not_observed");
 else if(availableUnits===0)blockers.push("no_available_stock");
 if(!raw.is_published)blockers.push("product_draft");
 if(!raw.store_is_public)blockers.push("store_private");
 if(raw.category_is_published!==true)blockers.push("category_not_published");
 return Object.freeze({
  status:"observed_private",observed:true,
  canQuote:false,canOrder:false,canPay:false,
  priceLabel:formatUsd(cents),availableUnits,
  blockers:Object.freeze(blockers),
 });
}
