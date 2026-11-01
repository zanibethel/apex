// The bulk editor keeps at most 250 private product cards in one session.
// Query one extra record to detect overflow rather than silently hiding a
// saved product after reload (which could also break CSV SKU matching).
export const SUPPLIER_BULK_PRODUCT_CAPACITY=250;
export const SUPPLIER_BULK_PRODUCT_QUERY_LIMIT=SUPPLIER_BULK_PRODUCT_CAPACITY+1;

export function supplierBulkProductWindowStatus(products){
 if(!Array.isArray(products))return "unavailable";
 return products.length>SUPPLIER_BULK_PRODUCT_CAPACITY?"over-limit":"complete";
}
