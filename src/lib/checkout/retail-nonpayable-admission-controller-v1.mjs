/**
 * Private, injectable admission controller for NONPAYABLE order holds.
 *
 * This is NOT an HTTP route. Production POST /api/checkout/handoff/v1
 * remains HTTP 503. Real admission requires independently reviewed durable
 * per-subject abuse control, server-derived store resolver, and approval to
 * change that route AND the separately default-OFF DB order-engine gate.
 *
 * The trusted route must supply a cookie-scoped Supabase Auth client,
 * a server-created least-privilege PostgreSQL pool, and protected keys.
 * Neither the browser nor its request may supply a store ID, identity,
 * totals, rate-limit result, currency, or payment authority.
 *
 * No request body, delivery plaintext, SQL parameters, secrets, HMAC values,
 * or PostgreSQL errors may be written to logs.
 */
import {verifyPrivateRetailCustomerSessionV1}
 from "./verified-customer-session-v1.mjs";
import {readNonpayableCheckoutRequestV1}
 from "./retail-nonpayable-request-boundary-v1.mjs";
import {createRetailPostgresTransactionV1}
 from "./retail-postgres-transaction-v1.mjs";
import {preparePrivateRetailHoldWithDeliveryV1}
 from "./private-retail-hold-coordinator-v1.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const reject=(code)=>Object.freeze({
 ok:false,code,accepted:false,canPay:false,canShip:false,
 invoiceCreated:false,paymentConfirmed:false,
});
const UNAVAILABLE="NONPAYABLE_ADMISSION_UNAVAILABLE";

export async function admitPrivateNonpayableRetailOrderV1({
 request,authClient,pool,consumeDurableAdmissionBudget,
 resolveTrustedRetailStore, fingerprintKey,deliveryKeyReference,deliveryKey,
}={}){
 // Required durable collaborators are absent in production today. Fail
 // closed before the body is read or a PostgreSQL write is attempted.
 if(!request||!authClient||!pool||
  typeof consumeDurableAdmissionBudget!=="function"||
  typeof resolveTrustedRetailStore!=="function")
  return reject(UNAVAILABLE);
 let session;
 try{
  session=await verifyPrivateRetailCustomerSessionV1(authClient);
 }catch{
  return reject("CUSTOMER_AUTH_REQUIRED");
 }
 let budget;
 try{
  // A durable cross-instance limiter must count malformed attempts too,
  // including attempts that will later fail product/format validation.
  budget=await consumeDurableAdmissionBudget(Object.freeze({
   subjectId:session.subjectId,operation:"nonpayable_retail_order_v1",
  }));
 }catch{
  return reject(UNAVAILABLE);
 }
 if(!budget||budget.allowed!==true||budget.durable!==true)
  return reject("ADMISSION_RATE_LIMITED");

 const parsed=await readNonpayableCheckoutRequestV1(request);
 if(!parsed.ok)return reject("INVALID_CHECKOUT_REQUEST");

 let scope;
 try{
  // The resolver must independently derive a *single* store from the
  // approved saved products. No store ID appears in client transport.
  scope=await resolveTrustedRetailStore(Object.freeze({
   items:parsed.request.cart.items,
   subjectId:session.subjectId,
  }));
 }catch{return reject(UNAVAILABLE);}
 if(!scope||scope.verified!==true||
  typeof scope.storeId!=="string"||!UUID.test(scope.storeId))
  return reject(UNAVAILABLE);

 try{
  const withTransaction=createRetailPostgresTransactionV1({pool});
  const receipt=await preparePrivateRetailHoldWithDeliveryV1(
   parsed.request,{
    trustedStoreId:scope.storeId,
    fingerprintKey,verifiedSession:session,
    deliveryKeyReference,deliveryKey,withTransaction,
   });
  // The coordinator must confirm a private nonpayable immutable hold,
  // encrypted delivery, and explicitly false payment/shipping evidence.
  if(!receipt||receipt.deliverySealed!==true||
   receipt.canPay!==false||receipt.canShip!==false||
   receipt.invoiceCreated!==false||receipt.paymentConfirmed!==false)
   return reject(UNAVAILABLE);
  return Object.freeze({
   ok:true,accepted:true,schemaVersion:1,
   orderId:receipt.orderId,status:receipt.status,
   createdAt:receipt.createdAt,expiresAt:receipt.expiresAt,
   totalCents:receipt.totalCents,currency:receipt.currency,
   replayed:receipt.replayed,deliverySealed:true,
   canPay:false,canShip:false,invoiceCreated:false,
   paymentConfirmed:false,
  });
 }catch{
  return reject(UNAVAILABLE);
 }
}
