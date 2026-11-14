import {buildCartReview,normalizeCartSelections} from "./customer-cart.mjs";

// Never stored in Supabase. This isolated ADMIN QA fixture uses the same
// server-priced quote calculator as the public cart, but has no order, stock,
// payment, shipping-label or public catalog write path.
export const QA_PRODUCT_ID="f4000000-0000-4000-8000-000000000201";
export const QA_PRODUCT_NAME="QA Fitness Water Bottle (synthetic only)";
export const QA_PRICE_CENTS=5999;
export const QA_AVAILABLE_UNITS=4;
export const QA_SHIPPING=Object.freeze({
 charge_shipping:true,flat_shipping_cents:1500,
 medium_flat_shipping_cents:2580,
 free_shipping_min_subtotal_cents:20001,
 envelope_max_items:2,
});
const DENY=Object.freeze({ok:false,reason:"Invalid controlled test cart",
 canPlaceOrder:false,canPay:false});
const promo=(code)=>{
 if(code!=="TEST10"&&code!=="SHIPFREE")return null;
 return {
  code,is_active:true,
  discount_kind:code==="TEST10"?"percentage":"free_shipping",
  discount_value:code==="TEST10"?10:1,
  min_subtotal_cents:0,starts_at:null,ends_at:null,
  usage_limit:null,redemption_count:0,
 };
};

/** No external caller may supply a price, stock count, or shipping fee. */
export function buildControlledCartQaReview({items,code="",boxSize="auto"}={}){
 const selected=normalizeCartSelections(items);
 if(selected.length!==1||selected[0].product_id!==QA_PRODUCT_ID||
  typeof code!=="string"||
  (code!==""&&!/^[A-Z0-9_-]{3,24}$/.test(code))||
  boxSize!=="auto")return DENY;
 const count=selected[0].quantity;
 const source={
  schema_version:1,state:"rechecked_inventory_cart",
  items:[{
   product_id:QA_PRODUCT_ID,name:QA_PRODUCT_NAME,quantity:count,
   unit_price_cents:String(QA_PRICE_CENTS),
   availability:count<=QA_AVAILABLE_UNITS?"in_stock":"insufficient_stock",
   can_checkout:false,
  }],
  shipping:{...QA_SHIPPING},requested_code:code,promotion:promo(code),
  can_place_order:false,can_create_invoice:false,
  can_reserve_stock:false,can_pay:false,
 };
 return buildCartReview(source,{items:selected,code,boxSize});
}
