const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=999999999;
export function parseCheckoutRulesOverview(input,storeId){
 if(!UUID.test(storeId)||!input||typeof input!=="object"||
  input.store_id!==storeId||typeof input.store_name!=="string"||
  input.store_name.length<1||!Array.isArray(input.products)||
  input.products.length>250||input.checkout_enabled!==false||
  !input.shipping||typeof input.shipping!=="object"||
  typeof input.shipping.charge_shipping!=="boolean"||
  !money(input.shipping.flat_shipping_cents)||
  (input.shipping.free_shipping_min_subtotal_cents!==null&&
    (!money(input.shipping.free_shipping_min_subtotal_cents)||
      input.shipping.free_shipping_min_subtotal_cents<1))||
  (!input.shipping.charge_shipping&&
    (input.shipping.flat_shipping_cents!==0||
    input.shipping.free_shipping_min_subtotal_cents!==null)))
  return null;
 const ids=new Set();
 const products=[];
 for(const p of input.products){
  if(!p||!UUID.test(p.id)||ids.has(p.id)||
   typeof p.name!=="string"||!p.name.trim()||
   p.name.length>250||typeof p.sku!=="string"||
   p.sku.length>120||typeof p.collect_sales_tax!=="boolean")
   return null;
  ids.add(p.id);
  products.push({id:p.id,name:p.name,sku:p.sku,
   collectSalesTax:p.collect_sales_tax});
 }
 return Object.freeze({
  storeId:storeId,storeName:input.store_name,
  products:Object.freeze(products),shipping:Object.freeze(input.shipping),
  checkoutEnabled:false,
 });
}
