/**
 * Track 2 v1 checkout handoff. SERVER USE ONLY.
 *
 * Accepts customer choices, never client-provided money, stock, timestamps,
 * payout rules or authorization flags. A separate trusted DB transaction must
 * originate the canonical order ID, purchase time and immutable price lines.
 * This module intentionally cannot create an invoice or enable commerce.
 */
import {createHmac} from "node:crypto";
import {validateDeliveryDetails} from "../checkout/delivery-preparation.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CODE=/^[A-Z0-9_-]{3,24}$/;
const SHA=/^[0-9a-f]{64}$/;
const EXACT=(value,keys)=>value!==null&&typeof value==="object"&&
 !Array.isArray(value)&&Object.keys(value).length===keys.length&&
 keys.every(key=>Object.hasOwn(value,key));
const fail=(reason)=>Object.freeze({ok:false,reason,
 canReserveStock:false,canCreateOrder:false,canCreateInvoice:false,canPay:false});
const hmac=(key,domain,payload)=>createHmac("sha256",key)
 .update("apex:checkout:v1:"+domain+"\n","utf8")
 .update(JSON.stringify(payload),"utf8").digest("hex");

/**
 * Track 1 payload (exact keys):
 * {
 *   schema_version:1, store_id:UUID, request_id:UUID,
 *   items:[{product_id:UUID,quantity:1..10}],
 *   box_size:"auto"|"medium", promotion_code:"",
 *   delivery:{firstName,lastName,email,phone,address1,address2,city,state,postalCode}
 * }
 *
 * Expected store ID MUST come from server-side store resolution. The secret is
 * a server-only high-entropy HMAC key, never a NEXT_PUBLIC variable. Do not log
 * the request, canonical delivery or derived fingerprints.
 */
export function prepareCheckoutOrderHandoffV1(payload,{
 trustedStoreId,fingerprintKey,
}={}){
 if(!UUID.test(trustedStoreId??"")||
  typeof fingerprintKey!=="string"||
  Buffer.byteLength(fingerprintKey,"utf8")<32||
  !EXACT(payload,["schema_version","store_id","request_id","items",
   "box_size","promotion_code","delivery"])||
  payload.schema_version!==1||payload.store_id!==trustedStoreId||
  !UUID.test(payload.request_id??"")||
  !["auto","medium"].includes(payload.box_size)||
  typeof payload.promotion_code!=="string"||
  (payload.promotion_code!==""&&!CODE.test(payload.promotion_code))||
  !Array.isArray(payload.items)||payload.items.length<1||
  payload.items.length>8)
  return fail("Invalid or unauthorized checkout handoff");
 const seen=new Set(),lines=[];
 let units=0;
 for(const row of payload.items){
  if(!EXACT(row,["product_id","quantity"])||
   !UUID.test(row.product_id??"")||seen.has(row.product_id)||
   !Number.isInteger(row.quantity)||row.quantity<1||row.quantity>10)
   return fail("Invalid product selection");
  seen.add(row.product_id);
  units+=row.quantity;
  if(units>50)return fail("Cart quantity limit exceeded");
  lines.push(Object.freeze({product_id:row.product_id,quantity:row.quantity}));
 }
 const delivery=validateDeliveryDetails(payload.delivery);
 if(!delivery.valid)return fail("Invalid delivery contact format");
 lines.sort((a,b)=>a.product_id.localeCompare(b.product_id,"en"));
 const items=Object.freeze(lines);
 const requestIdentity={
  store_id:trustedStoreId,request_id:payload.request_id,
 };
 const selected={
  store_id:trustedStoreId,items,box_size:payload.box_size,
  promotion_code:payload.promotion_code,
 };
 const requestFingerprint=hmac(fingerprintKey,"request",{
  ...requestIdentity,...selected,delivery:delivery.details,
 });
 const cartFingerprint=hmac(fingerprintKey,"cart",selected);
 const idempotencyHash=hmac(fingerprintKey,"idempotency",requestIdentity);
 if(![requestFingerprint,cartFingerprint,idempotencyHash].every(v=>SHA.test(v)))
  return fail("Checkout request fingerprint unavailable");
 return Object.freeze({
  ok:true,version:1,status:"validated_not_admitted",
  storeId:trustedStoreId,requestId:payload.request_id,
  items,unitCount:units,boxSize:payload.box_size,
  promotionCode:payload.promotion_code,
  // Opaque only: never send the private delivery data to a payment provider,
  // browser response, audit log or supplier read projection.
  serverOnlyDelivery:delivery.details,
  requestFingerprint,cartFingerprint,idempotencyHash,
  // A format check is NOT a source of authoritative order or payment rights.
  canonicalOrderId:null,originalPurchasedAt:null,
  canReserveStock:false,canCreateOrder:false,canCreateInvoice:false,canPay:false,
 });
}

/**
 * Strictly compares a later trusted transactional readback to this handoff.
 * The DB (not the browser or this module) must generate immutable IDs/times,
 * verify saved prices and stock atomically, and enforce release policy.
 * A held-only readback never grants checkout/fulfillment permission.
 */
export function verifyHeldOrderReadbackV1(handoff,raw){
 if(!handoff?.ok||handoff.version!==1||
  !EXACT(raw,["schema_version","store_id","order_id","original_purchased_at",
   "idempotency_hash","request_fingerprint","cart_fingerprint",
   "line_count","unit_count","currency","state","can_pay","can_ship"])||
  raw.schema_version!==1||raw.store_id!==handoff.storeId||
  !UUID.test(raw.order_id??"")||
  typeof raw.original_purchased_at!=="string"||
  !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(raw.original_purchased_at)||
  !Number.isFinite(Date.parse(raw.original_purchased_at))||
  new Date(raw.original_purchased_at).toISOString()!==
   (raw.original_purchased_at.length===20?raw.original_purchased_at.replace("Z",".000Z"):raw.original_purchased_at)||
  raw.idempotency_hash!==handoff.idempotencyHash||
  raw.request_fingerprint!==handoff.requestFingerprint||
  raw.cart_fingerprint!==handoff.cartFingerprint||
  raw.line_count!==handoff.items.length||
  raw.unit_count!==handoff.unitCount||
  raw.currency!=="USD"||raw.state!=="held_no_payment"||
  raw.can_pay!==false||raw.can_ship!==false)return null;
 return Object.freeze({
  orderId:raw.order_id,storeId:raw.store_id,
  originalPurchasedAt:raw.original_purchased_at,
  state:"held_no_payment",lineCount:raw.line_count,
  canPay:false,canShip:false,
 });
}
