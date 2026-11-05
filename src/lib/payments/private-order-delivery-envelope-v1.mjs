/**
 * Strict AES-256-GCM envelope for private order delivery fields.
 *
 * Server-only primitive. Import only from authenticated, store-scoped order
 * controllers. It never writes records, decrypts on a customer/supplier page,
 * creates payment intents or grants shipping rights.
 */
import {createCipheriv,createDecipheriv,randomBytes} from "node:crypto";
import {validateDeliveryDetails} from "../checkout/delivery-preparation.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY_REF=/^[A-Za-z0-9_-]{5,80}$/;
const FORMAT="aes-256-gcm-v1";
const DENIAL="Protected delivery record unavailable";
const MAX_BYTES=32768;

function reject(){
 // Do not reveal whether a supplied key, nonce, order, store or ciphertext
 // was valid to an untrusted caller.
 throw new Error(DENIAL);
}
function requireContext({storeId,orderId,keyReference,key}={}){
 if(typeof storeId!=="string"||!UUID.test(storeId)||
  typeof orderId!=="string"||!UUID.test(orderId)||
  typeof keyReference!=="string"||!KEY_REF.test(keyReference)||
  !Buffer.isBuffer(key)||key.length!==32)reject();
}
function associatedData(storeId,orderId,keyReference){
 // The authenticated context is immutable: ciphertext copied between stores,
 // orders or key versions cannot authenticate.
 return Buffer.from(
  "apex:delivery:v1\u0000"+storeId+"\u0000"+orderId+"\u0000"+keyReference,
  "utf8");
}
const exactKeys=(value,keys)=>value!==null&&typeof value==="object"&&
 !Array.isArray(value)&&Object.keys(value).length===keys.length&&
 keys.every(key=>Object.hasOwn(value,key));

/**
 * Output fields match existing apex_internal.order_delivery_envelopes exactly.
 * DB insertion must happen in the SAME trusted transaction as the canonical
 * order and immutable line captures, never from a public role.
 */
export function sealPrivateOrderDeliveryV1({
 storeId,orderId,keyReference,key,delivery,
}={}){
 requireContext({storeId,orderId,keyReference,key});
 const parsed=validateDeliveryDetails(delivery);
 if(!parsed.valid||!parsed.details)reject();
 const body=Buffer.from(JSON.stringify({
  schema_version:1,delivery:parsed.details,
 }),"utf8");
 if(body.length<1||body.length>MAX_BYTES)reject();
 const nonce=randomBytes(12);
 const cipher=createCipheriv("aes-256-gcm",key,nonce,{
  authTagLength:16,
 });
 cipher.setAAD(associatedData(storeId,orderId,keyReference));
 const ciphertext=Buffer.concat([cipher.update(body),cipher.final()]);
 const authTag=cipher.getAuthTag();
 if(ciphertext.length<16||ciphertext.length>MAX_BYTES)reject();
 return Object.freeze({
  order_id:orderId,store_id:storeId,envelope_format:FORMAT,
  key_reference:keyReference,nonce,ciphertext,auth_tag:authTag,
  // These flags mirror the existing private-schema constraints. Encryption
  // NEVER certifies delivery eligibility or authorizes fulfillment.
  delivery_verified:false,shipping_authorized:false,
 });
}

/**
 * Privileged read ONLY. Caller MUST independently authorize exact store and
 * purpose, securely retrieve the server-side key by key_reference, audit
 * access, and avoid logging the decrypted return value.
 */
export function openPrivateOrderDeliveryV1({
 storeId,orderId,keyReference,key,envelope,
}={}){
 requireContext({storeId,orderId,keyReference,key});
 if(!exactKeys(envelope,[
   "order_id","store_id","envelope_format","key_reference",
   "nonce","ciphertext","auth_tag","delivery_verified",
   "shipping_authorized",
  ])||envelope.order_id!==orderId||envelope.store_id!==storeId||
  envelope.envelope_format!==FORMAT||
  envelope.key_reference!==keyReference||
  envelope.delivery_verified!==false||
  envelope.shipping_authorized!==false||
  !Buffer.isBuffer(envelope.nonce)||envelope.nonce.length!==12||
  !Buffer.isBuffer(envelope.auth_tag)||envelope.auth_tag.length!==16||
  !Buffer.isBuffer(envelope.ciphertext)||
  envelope.ciphertext.length<16||envelope.ciphertext.length>MAX_BYTES)
  reject();
 try{
  const decipher=createDecipheriv("aes-256-gcm",key,envelope.nonce,{
   authTagLength:16,
  });
  decipher.setAAD(associatedData(storeId,orderId,keyReference));
  decipher.setAuthTag(envelope.auth_tag);
  const clear=Buffer.concat([
   decipher.update(envelope.ciphertext),decipher.final(),
  ]);
  if(clear.length<1||clear.length>MAX_BYTES)reject();
  const decoded=JSON.parse(clear.toString("utf8"));
  if(!exactKeys(decoded,["schema_version","delivery"])||
    decoded.schema_version!==1)reject();
  const delivery=validateDeliveryDetails(decoded.delivery);
  if(!delivery.valid||!delivery.details)reject();
  return delivery.details;
 }catch{
  reject();
 }
}
