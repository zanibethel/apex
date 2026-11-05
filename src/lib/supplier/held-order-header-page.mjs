/**
 * Issue #246: bounded, deterministic navigation for supplier HELD headers.
 * Query parameters are not used as a store selector or database identity.
 */
export const HELD_HEADER_PAGE_SIZE=25;
export const HELD_HEADER_LAST_PAGE=40;
const PATH="/supplier/reports/order-foundation/headers";

export function parseHeldHeaderPage(value){
 if(typeof value!=="string"||!/^(0|[1-9][0-9]?)$/.test(value))
  return 0;
 const page=Number(value);
 return page<=HELD_HEADER_LAST_PAGE?page:0;
}
export function heldHeaderPageHref(page){
 if(!Number.isSafeInteger(page)||page<0||page>HELD_HEADER_LAST_PAGE)
  throw new RangeError("Held header page out of range");
 return page===0?PATH:PATH+"?page="+String(page);
}
