// Match a completed private draft save against the exact values submitted.
// A user may edit a card while a network request is in flight; never label
// those newer local edits as saved, or enable a publish preview for them.
const draftFields=Object.freeze([
 "name","sku","description","price","comparePrice","sourceCost",
 "categoryId","isActive","linkedSource",
]);

export function reconcileSavedBulkRow(current,submitted,confirmed){
 if(!submitted||!confirmed?.ok||!confirmed.id)return current;
 const unchanged=draftFields.every(field=>current[field]===submitted[field]);
 // A new draft may receive a generated persisted SKU. Keep it unless the
 // supplier has explicitly edited SKU since the request was submitted.
 const sku=current.sku===submitted.sku
  ?(confirmed.sku||current.sku)
  :current.sku;
 return {...current,id:confirmed.id,sku,needsSave:!unchanged};
}
