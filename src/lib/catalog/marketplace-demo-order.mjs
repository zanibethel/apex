// Test-only checkout/order/fulfillment state machine.
// Pure functions: no database, HTTP, email, payment processor, or carrier I/O.
// The private staff UI supplies a throwaway demo order ID and clock value.
// NONE of these results are real orders, receipts, charges, shipments or sales.
import {showroomCartSummary} from "./supplier-showroom-preview.mjs";

export const DEMO_SHIPPING=Object.freeze({standard:599,priority:1199});
export const DEMO_FREE_SHIPPING_CENTS=20000;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const clean=(value,max)=>typeof value==="string"?value.trim().slice(0,max):"";

export function computeDemoTotals(products,visibility,cart,shippingMethod="standard",promo=""){
 const summary=showroomCartSummary(products,visibility,cart);
 if(summary.count<=0)return {ok:false,error:"Add at least one visible in-stock sample to the test cart."};
 if(!Object.hasOwn(DEMO_SHIPPING,shippingMethod))return {ok:false,error:"Choose a valid simulated shipping method."};
 const discountCents=clean(promo,20).toUpperCase()==="DEMO10"?Math.round(summary.subtotalCents*.1):0;
 const discountedSubtotalCents=summary.subtotalCents-discountCents;
 const shippingCents=discountedSubtotalCents>=DEMO_FREE_SHIPPING_CENTS?0:DEMO_SHIPPING[shippingMethod];
 const totalCents=discountedSubtotalCents+shippingCents;
 return {ok:true,count:summary.count,subtotalCents:summary.subtotalCents,discountCents,
  discountedSubtotalCents,shippingCents,totalCents,shippingMethod,items:summary.items};
}

export function makeDemoOrder({
 products,visibility,cart,shippingMethod="standard",promo="",customer,
 orderId,at
}){
 if(typeof orderId!=="string"||!orderId.startsWith("DEMO-")||!UUID.test(orderId.slice(5))||
    typeof at!=="string"||!Number.isFinite(Date.parse(at)))
  return {ok:false,error:"Invalid demo order reference."};
 const checkout=computeDemoTotals(products,visibility,cart,shippingMethod,promo);
 if(!checkout.ok)return checkout;
 const safeCustomer={
  name:clean(customer?.name,80),
  email:clean(customer?.email,120),
  address:clean(customer?.address,160),
  city:clean(customer?.city,80),
  region:clean(customer?.region,40),
  postalCode:clean(customer?.postalCode,20),
 };
 if(!safeCustomer.name||!safeCustomer.email.includes("@")||
    !safeCustomer.address||!safeCustomer.city||!safeCustomer.region||!safeCustomer.postalCode)
  return {ok:false,error:"Complete the simulated customer and delivery details."};
 const productMap=new Map(products.map(p=>[p.id,p]));
 const items=checkout.items.map(i=>{
  const p=productMap.get(i.id);
  return {id:i.id,name:i.name,sku:p?.sku??"",quantity:i.quantity,
   unitPriceCents:i.priceCents,lineTotalCents:i.quantity*i.priceCents};
 });
 return {ok:true,order:{
  id:orderId,createdAt:at,kind:"isolated_ui_simulation_v1",customer:safeCustomer,
  items,subtotalCents:checkout.subtotalCents,discountCents:checkout.discountCents,
  shippingCents:checkout.shippingCents,totalCents:checkout.totalCents,
  shippingMethod,codeApplied:checkout.discountCents>0?"DEMO10":null,
  paymentState:"not_processed",fulfillmentState:"not_started",trackingReference:null,
  events:[{event:"demo_order_created",at}],
 }};
}

const permitted={
 simulate_payment:{payment:"not_processed",fulfillment:"not_started",nextPayment:"simulated_paid",nextFulfillment:"not_started"},
 start_packing:{payment:"simulated_paid",fulfillment:"not_started",nextPayment:"simulated_paid",nextFulfillment:"packing"},
 mark_shipped:{payment:"simulated_paid",fulfillment:"packing",nextPayment:"simulated_paid",nextFulfillment:"shipped"},
 mark_delivered:{payment:"simulated_paid",fulfillment:"shipped",nextPayment:"simulated_paid",nextFulfillment:"delivered"},
};
export function advanceDemoOrder(order,action,at){
 if(!order||order.kind!=="isolated_ui_simulation_v1"||
    typeof order.id!=="string"||!order.id.startsWith("DEMO-")||
    typeof at!=="string"||!Number.isFinite(Date.parse(at)))
  return {ok:false,error:"Unrecognized demo order."};
 const step=permitted[action];
 if(!step)return {ok:false,error:"Unknown demo order transition."};
 if(order.paymentState!==step.payment||order.fulfillmentState!==step.fulfillment)
  return {ok:false,error:"This step cannot be completed in the current demo order state."};
 return {ok:true,order:{
  ...order,paymentState:step.nextPayment,fulfillmentState:step.nextFulfillment,
  trackingReference:action==="mark_shipped"?"DEMO-TRACK-"+order.id.slice(-8):order.trackingReference,
  events:[...order.events,{event:action,at}],
 }};
}
