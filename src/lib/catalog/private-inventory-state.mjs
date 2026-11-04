// Derive PRIVATE inventory state only from authenticated saved counters.
// This never grants public visibility or customer ordering.
export function privateInventoryState(item){
 if(!item||typeof item!=="object"||
  !Number.isSafeInteger(item.quantity_on_hand)||
  !Number.isSafeInteger(item.quantity_reserved)||
  item.quantity_on_hand<0||item.quantity_reserved<0||
  item.quantity_reserved>item.quantity_on_hand)
  return Object.freeze({kind:"unverified",label:"Inventory unavailable",availableUnits:null,
   canPublish:false,canOrder:false});
 const available=item.quantity_on_hand-item.quantity_reserved;
 return Object.freeze({
  kind:available>0?"available":"sold_out",
  label:available>0?`Stock: ${available} available`:"Stock: Sold Out",
  availableUnits:available,
  // Publishing intent and actual public release remain separate checks.
  canPublish:false,canOrder:false,
 });
}
