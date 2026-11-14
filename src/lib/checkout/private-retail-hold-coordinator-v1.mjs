/**
 * SERVER ONLY — trusted transactional coordinator for nonpayable retail holds.
 *
 * This is not a public checkout endpoint or a database adapter. The consumer
 * must provide an independently authenticated/verified checkout session and a
 * real PostgreSQL transaction runner capable of issuing all 4 DB steps on the
 * SAME transaction/client before COMMIT. The SQL deferred delivery constraint
 * rejects a hold if its encrypted envelope was never attached.
 *
 * Never log arguments: delivery, HMACs and encryption keys are protected.
 */
import {createHmac} from "node:crypto";
import {prepareTrack1CheckoutHandoffForTrack2V1}
 from "./track1-to-track2-adapter-v1.mjs";
import {buildCartReview} from "../cart/customer-cart.mjs";
import {sealPrivateOrderDeliveryV1}
 from "../payments/private-order-delivery-envelope-v1.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHA=/^[0-9a-f]{64}$/;
const KEY_REF=/^[A-Za-z0-9_-]{5,80}$/;
const HOLD_STATUS=new Set([
 "held_no_payment","cancelled_no_payment","expired_no_payment",
]);
const CURRENCY="USD";
const invalid=()=>new Error("Private checkout hold unavailable");
const requireStringUuid=(value)=>typeof value==="string"&&UUID.test(value);
const cents=value=>typeof value==="string"&&
 /^[1-9][0-9]{0,8}$/.test(value)&&Number(value)<=999999999;
const own=(value,key)=>Object.hasOwn(value,key);
const exact=(value,fields)=>value&&typeof value==="object"&&
 !Array.isArray(value)&&Object.keys(value).length===fields.length&&
 fields.every(key=>own(value,key));

/**
 * The session is trusted data from the server-side auth/session resolver,
 * NOT a browser-auth claim or a user-supplied customer ID. Authenticated or
 * cryptographically bound guest sessions can be supported by this contract.
 */
function validSession(session){
 return exact(session,["verified","subjectId"])&&
  session.verified===true&&requireStringUuid(session.subjectId);
}
function boundFingerprint(key,subjectId,requestFingerprint){
 return createHmac("sha256",key)
  .update("apex:retail-hold:v1:verified-session\n")
  .update(subjectId)
  .update("\n")
  .update(requestFingerprint)
  .digest("hex");
}
function validateHeldResult(v,storeId,quote,expectedReplay){
 return exact(v,[
  "schema_version","order_id","status","replayed","total_cents",
  "can_pay","can_ship","invoice_created",
 ])&&v.schema_version===1&&requireStringUuid(v.order_id)&&
  HOLD_STATUS.has(v.status)&&v.replayed===expectedReplay&&
  cents(v.total_cents)&&Number(v.total_cents)===quote.totalCents&&
  v.can_pay===false&&v.can_ship===false&&v.invoice_created===false;
}
function validReceipt(v,hold,storeId,quote){
 return exact(v,[
  "schema_version","order_id","store_id","created_at","expires_at",
  "status","currency","line_count","unit_count","merchandise_cents",
  "discount_cents","shipping_cents","total_cents","delivery_sealed",
  "can_pay","can_ship","invoice_created","payment_confirmed",
 ])&&v.schema_version===1&&v.order_id===hold.order_id&&
  v.store_id===storeId&&v.status===hold.status&&
  v.currency===CURRENCY&&v.delivery_sealed===true&&
  v.can_pay===false&&v.can_ship===false&&
  v.invoice_created===false&&v.payment_confirmed===false&&
  Number.isInteger(v.line_count)&&v.line_count===quote.items.length&&
  Number.isInteger(v.unit_count)&&v.unit_count===quote.items.reduce((a,b)=>a+b.quantity,0)&&
  cents(v.total_cents)&&Number(v.total_cents)===quote.totalCents&&
  typeof v.created_at==="string"&&Number.isFinite(Date.parse(v.created_at))&&
  typeof v.expires_at==="string"&&Number.isFinite(Date.parse(v.expires_at));
}

/**
 * This method intentionally does NOT accept browser prices or a prebuilt
 * client quote. quoteSource() is a SAME-TRANSACTION database call returning the
 * current nonpayable retailer cart source. reserve() independently recalculates
 * and locks prices and stock in SQL, rejecting stale totals.
 *
 * Any failure must throw from withTransaction's callback, causing ROLLBACK.
 * The result is safe server-only confirmation metadata, NOT proof of payment.
 */
export async function preparePrivateRetailHoldWithDeliveryV1(raw,{
 trustedStoreId,fingerprintKey,verifiedSession,
 deliveryKeyReference,deliveryKey,withTransaction,
}={}){
 if(!requireStringUuid(trustedStoreId)||
  typeof fingerprintKey!=="string"||
  Buffer.byteLength(fingerprintKey,"utf8")<32||
  !validSession(verifiedSession)||
  typeof deliveryKeyReference!=="string"||
  !KEY_REF.test(deliveryKeyReference)||
  !Buffer.isBuffer(deliveryKey)||deliveryKey.length!==32||
  typeof withTransaction!=="function")throw invalid();

 const handoff=prepareTrack1CheckoutHandoffForTrack2V1(raw,{
  trustedStoreId,fingerprintKey,
 });
 if(!handoff.ok||handoff.items.length<1||handoff.items.length>8||
   !SHA.test(handoff.requestFingerprint))throw invalid();

 const subjectFingerprint=boundFingerprint(fingerprintKey,
  verifiedSession.subjectId,handoff.requestFingerprint);
 if(!SHA.test(subjectFingerprint))throw invalid();

 return withTransaction(async tx=>{
  if(!tx||typeof tx.quoteSource!=="function"||
   typeof tx.reserve!=="function"||
   typeof tx.attachDelivery!=="function"||
   typeof tx.receipt!=="function")throw invalid();
  // IMPORTANT: quoteSource is executed inside the trusted DB transaction,
  // not fetched from the browser or a client-supplied total.
  const source=await tx.quoteSource({
   storeId:trustedStoreId,items:handoff.items,
   code:handoff.promotionCode,
  });
  const review=buildCartReview(source,{
   items:handoff.items,code:handoff.promotionCode,
   boxSize:handoff.boxSize,
  });
  if(!review.ok||review.status!=="stock_observed"||
   review.items.length!==handoff.items.length||
   review.canPlaceOrder!==false||review.canPay!==false||
   !Number.isSafeInteger(review.totalCents)||review.totalCents<1)
   throw invalid();

  const hold=await tx.reserve({
   storeId:trustedStoreId,requestId:handoff.requestId,
   requestFingerprint:subjectFingerprint,
   items:handoff.items,code:handoff.promotionCode,
   boxSize:handoff.boxSize,expectedTotalCents:review.totalCents,
  });
  if(!validateHeldResult(hold,trustedStoreId,review,
    hold?.replayed===true)||(!hold.replayed&&hold.status!=="held_no_payment"))
   throw invalid();

  if(!hold.replayed){
   const envelope=sealPrivateOrderDeliveryV1({
    storeId:trustedStoreId,orderId:hold.order_id,
    keyReference:deliveryKeyReference,key:deliveryKey,
    delivery:handoff.serverOnlyDelivery,
   });
   const sealed=await tx.attachDelivery({
    storeId:trustedStoreId,orderId:hold.order_id,
    keyReference:envelope.key_reference,nonce:envelope.nonce,
    ciphertext:envelope.ciphertext,authTag:envelope.auth_tag,
   });
   if(!exact(sealed,["schema_version","order_id","sealed","replayed",
     "can_pay","can_ship"])||
    sealed.schema_version!==1||sealed.order_id!==hold.order_id||
    sealed.sealed!==true||sealed.replayed!==false||
    sealed.can_pay!==false||sealed.can_ship!==false)throw invalid();
  }

  const receipt=await tx.receipt({
   storeId:trustedStoreId,orderId:hold.order_id,
  });
  if(!validReceipt(receipt,hold,trustedStoreId,review))throw invalid();
  // Never return delivery, ciphertext, HMAC identity, or a payment URL.
  return Object.freeze({
   schemaVersion:1,
   orderId:receipt.order_id,
   createdAt:receipt.created_at,
   expiresAt:receipt.expires_at,
   status:receipt.status,
   totalCents:Number(receipt.total_cents),
   currency:receipt.currency,
   replayed:hold.replayed,
   deliverySealed:true,
   canPay:false,canShip:false,invoiceCreated:false,
   paymentConfirmed:false,
  });
 });
}
