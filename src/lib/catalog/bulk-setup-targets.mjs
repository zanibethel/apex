// Private supplier bulk-editor navigation only. These links point to fields
// on the same already-authorized product card, not to server actions.
const suffixByMissingField=Object.freeze({
 "Product name":"name",
 "Unique SKU":"sku",
 "Product description":"description",
 "Product category":"category",
 "Saved product image":"media",
 "Purchase price":"price",
 "Active in internal catalog":"active",
 "Confirmed stock on hand":"media",
});
export function bulkSetupTarget(label,rowKey){
 const suffix=suffixByMissingField[label];
 if(!suffix||typeof rowKey!=="string"||!/^[a-zA-Z0-9_-]{1,80}$/.test(rowKey))
  return null;
 return "bulk-fix-"+rowKey+"-"+suffix;
}
export function bulkSetupHref(label,rowKey){
 const target=bulkSetupTarget(label,rowKey);
 return target?"#"+target:null;
}
