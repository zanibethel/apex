// Treat SQL admin-only cart observations as untrusted structured input.
// Observations never confer customer-facing quotation or order/payment rights.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHECK_KEYS=[
 "supplier_requested","admin_clear","identity_clear","content_review_clear",
 "product_setup_complete","supplier_authorized","product_authorized",
 "public_release_enabled",
];
function cents(value){
 if(typeof value!=="string"||!/^(0|[1-9][0-9]{0,9})$/.test(value))
  return null;
 const number=Number(value);
 return Number.isSafeInteger(number)&&number<=999999999?number:null;
}
export function parseAdminPrivateCartValidation(raw,storeId,productId,quantity){
 if(!UUID.test(storeId)||!UUID.test(productId)||
  !Number.isSafeInteger(quantity)||quantity<1||quantity>10||
  !raw||typeof raw!=="object"||Array.isArray(raw)||
  raw.schema_version!==1||raw.state!=="private_cart_observation"||
  raw.store_id!==storeId||raw.currency!=="USD"||
  raw.total_units!==quantity||
  raw.can_quote!==false||raw.can_reserve_stock!==false||
  raw.can_create_order!==false||raw.can_create_invoice!==false||
  raw.can_pay!==false||raw.shipping_calculated!==false||
  raw.tax_calculated!==false||
  !Array.isArray(raw.items)||raw.items.length!==1)return null;
 const item=raw.items[0];
 if(!item||typeof item!=="object"||Array.isArray(item)||
  item.product_id!==productId||item.quantity!==quantity||
  typeof item.name!=="string"||item.name.length<1||item.name.length>300||
  typeof item.sku!=="string"||item.sku.length<1||item.sku.length>120||
  item.currency!=="USD"||
  typeof item.release_status_code!=="string"||
  item.release_status_code.length<1||item.release_status_code.length>100||
  typeof item.saved_price_valid!=="boolean"||
  typeof item.quantity_available!=="boolean"||
  item.can_order!==false||item.can_pay!==false||
  !item.release_checks||typeof item.release_checks!=="object"||
  Array.isArray(item.release_checks)||
  CHECK_KEYS.some(k=>typeof item.release_checks[k]!=="boolean")||
  (item.available_units!==null&&(!Number.isSafeInteger(item.available_units)||
     item.available_units<0||item.available_units>1000000000)))
  return null;
 const unit=item.saved_price_valid?cents(item.unit_price_cents):null;
 const line=item.saved_price_valid?cents(item.line_subtotal_cents):null;
 const total=cents(raw.observed_subtotal_cents);
 if(total===null||
  (item.saved_price_valid&&(unit===null||unit<1||line!==unit*quantity||
   total!==line))||
  (!item.saved_price_valid&&(item.unit_price_cents!==null||
   item.line_subtotal_cents!==null||total!==0))||
  item.quantity_available!==
   (item.available_units!==null&&item.available_units>=quantity&&
    item.available_units>0))
  return null;
 return Object.freeze({
  status:"blocked",name:item.name,quantity,availableUnits:item.available_units,
  priceCents:unit,observedSubtotalCents:total,
  stockSufficient:item.quantity_available,
  releaseStatus:item.release_status_code,
  checks:Object.freeze(CHECK_KEYS.map(key=>Object.freeze({
   key,passed:item.release_checks[key],
  }))),
  canOrder:false,canPay:false,
 });
}
