/**
 * Issue #214 Phase 5 — review-only key rotation/integrity contract.
 * No vault/KMS, production secret loading, DB/HTTP access, shipping label,
 * PII export, or privileged decryption path. Test keys are in-memory only.
 */
import {createDecipheriv} from 'node:crypto';
import {prepareHeldOrderIntake} from './verified-order-ingest.mjs';

const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const KEY_REF=/^[A-Za-z0-9_-]{5,80}$/;
const STATES=new Set(['active','decrypt_only','retired']);
function deny(code){
 const err=new Error('Delivery key lifecycle review denied');
 err.code=code;
 throw err;
}
function unpack(base64,min,max){
 if(typeof base64!=='string'||base64.length>44000||
   !/^[A-Za-z0-9+/]+={0,2}$/.test(base64))deny('invalid_envelope');
 const bytes=Buffer.from(base64,'base64');
 if(bytes.length<min||bytes.length>max||bytes.toString('base64')!==base64)
  deny('invalid_envelope');
 return bytes;
}
function aadata(context){
 if(!context||typeof context!=='object'||
  !UUID.test(context.store_id??'')||!UUID.test(context.sale_id??'')||
  typeof context.source_order_reference!=='string'||
  typeof context.original_purchased_at!=='string')deny('invalid_context');
 return Buffer.from('apex.delivery.v1\n'+context.store_id+'\n'+context.sale_id+
  '\n'+context.source_order_reference+'\n'+context.original_purchased_at,'utf8');
}
/** A deterministic, test-only registry demonstrating key IDs and lifecycle.
 * Entry material is cloned and never exposed through an accessor.
 * Vault implementation, rotation ceremony, retention and revocation audits
 * must be independently reviewed before any production integration.
 */
export function createReviewOnlyDeliveryKeyring({testOnly,entries}){
 if(testOnly!==true||!Array.isArray(entries)||entries.length<1||entries.length>16)
  deny('disposable_only');
 const all=new Map(), activeByStore=new Map();
 for(const entry of entries){
  if(!entry||typeof entry!=='object'||
    Object.keys(entry).sort().join('|')!=='keyBytes|keyReference|state|storeId'||
    !UUID.test(entry.storeId??'')||!KEY_REF.test(entry.keyReference??'')||
    !STATES.has(entry.state)||!Buffer.isBuffer(entry.keyBytes)||
    entry.keyBytes.length!==32)deny('invalid_key_entry');
  const key=entry.storeId+':'+entry.keyReference;
  if(all.has(key))deny('duplicate_key_reference');
  if(entry.state==='active'){
   if(activeByStore.has(entry.storeId))deny('multiple_active_keys');
   activeByStore.set(entry.storeId,entry.keyReference);
  }
  all.set(key,{status:entry.state,material:Buffer.from(entry.keyBytes)});
 }
 if([...all.keys()].some(key=>!activeByStore.has(key.slice(0,36))))
  deny('missing_active_key');
 const statuses=Object.freeze([...all.entries()].map(([id,e])=>Object.freeze({
  store_id:id.slice(0,36),key_reference:id.slice(37),status:e.status,
 })));
 return Object.freeze({
  metadata:statuses,
  /** Never takes a client-supplied encryption key or key reference. */
  prepareHeldOrder(request){
   if(!request||typeof request!=='object'||
      Object.hasOwn(request,'deliveryKey')||
      Object.hasOwn(request,'keyReference'))deny('caller_key_override');
   const store=request.authorizedStoreId;
   const ref=activeByStore.get(store);
   if(!ref)deny('unbound_store');
   const entry=all.get(store+':'+ref);
   if(entry.status!=='active')deny('encryption_key_not_active');
   return prepareHeldOrderIntake({...request,
    deliveryKey:entry.material,keyReference:ref});
  },
  /** Private integrity check only: validates GCM with original identity and
   * does NOT return any customer destination information.
   */
  checkIntegrity({envelope,identity}){
   if(!envelope||typeof envelope!=='object'||identity?.store_id!==envelope.store_id||
    envelope.envelope_format!=='aes-256-gcm-v1')deny('invalid_envelope');
   const entry=all.get(identity.store_id+':'+envelope.key_reference);
   if(!entry||entry.status==='retired')deny('key_unavailable');
   const iv=unpack(envelope.nonce_base64,12,12);
   const tag=unpack(envelope.auth_tag_base64,16,16);
   const ciphertext=unpack(envelope.ciphertext_base64,16,32768);
   const aad=aadata(identity);
   let decrypted;
   try {
    const decipher=createDecipheriv('aes-256-gcm',entry.material,iv);
    decipher.setAAD(aad);decipher.setAuthTag(tag);
    decrypted=Buffer.concat([decipher.update(ciphertext),decipher.final()]);
    return decrypted.length>0;
   }catch{deny('authentication_failed');}
   finally{decrypted?.fill(0);}
  },
 });
}
