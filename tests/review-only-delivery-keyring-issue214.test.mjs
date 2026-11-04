import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createReviewOnlyDeliveryKeyring} from '../src/lib/supplier/review-only-delivery-keyring.mjs';

const store='62000000-0000-0000-0000-000000000001';
const otherStore='62000000-0000-0000-0000-000000000002';
const sale='65000214-0000-4000-8000-000000000001';
const product='64000000-0000-0000-0000-000000000001';
const signingKey=Buffer.alloc(32,19);
const key1=Buffer.alloc(32,21),key2=Buffer.alloc(32,22);
const at='1793799000', nowMs=Number(at)*1000;
const event={
 version:1,store_id:store,sale_id:sale,order_reference:'SYNTHETIC-KEY-214',
 purchased_at:'2026-11-04T10:00:00Z',payment_state:'confirmed',
 gross_cents:10500,currency:'USD',shipping_cents:1500,discount_cents:1000,
 lines:[{source_line_reference:'line1',product_id:product,sku:'SYNTH',
 title:'Synthetic card',variant:'',quantity:2,unit_price_cents:5000}],
 delivery:{recipient_name:'Synthetic Example',address_1:'123 Placeholder Street',
 city:'Lubbock',region:'TX',postal_code:'79401',country:'US'},
};
const rawEvent=JSON.stringify(event);
const signature='v1='+createHmac('sha256',signingKey)
 .update('apex.order-detail.v1\n'+at+'\n'+rawEvent).digest('hex');
const request={
 rawEvent,signature,signedAt:at,signingSecret:signingKey,nowMs,
 authorizedStoreId:store,recordedSale:{id:sale,store_id:store,
 order_reference:'SYNTHETIC-KEY-214',occurred_at:'2026-11-04T10:00:00+00:00',
 sale_state:'confirmed',gross_cents:10500,currency:'USD'},
 products:[{id:product,store_id:store}],
};
const keys=(states)=>createReviewOnlyDeliveryKeyring({testOnly:true,entries:states.map(
 ([keyReference,state,keyBytes])=>({storeId:store,keyReference,state,keyBytes})
)});
const identity={store_id:store,sale_id:sale,
 source_order_reference:'SYNTHETIC-KEY-214',
 original_purchased_at:'2026-11-04T10:00:00Z'};
const errorCode=(code)=>err=>err.code===code&&
 err.message==='Delivery key lifecycle review denied';
test('only active key seals new order, and output never includes key or plaintext address',()=>{
 const ring=keys([['key_2026_v1','active',key1],['key_2025_v1','decrypt_only',key2]]);
 const result=ring.prepareHeldOrder(request);
 assert.equal(result.deliveryEnvelope.key_reference,'key_2026_v1');
 assert.equal(ring.checkIntegrity({envelope:result.deliveryEnvelope,identity}),true);
 const serialized=JSON.stringify({...result,keyring:ring.metadata});
 assert.doesNotMatch(serialized,/Synthetic Example|123 Placeholder Street|79401/);
 assert.doesNotMatch(serialized,/deliveryKey|keyBytes|signingKey|signingSecret/);
 assert.equal(result.persistence_enabled,false);
 assert.equal(result.header.payment_authorized,false);
 assert.equal(result.deliveryEnvelope.shipping_authorized,false);
});
test('rotation is explicit; old decrypt-only key validates previous sealed records',()=>{
 const before=keys([['key_2025_v1','active',key1]]);
 const sealed=before.prepareHeldOrder(request).deliveryEnvelope;
 const after=keys([
  ['key_2025_v1','decrypt_only',key1],
  ['key_2026_v1','active',key2],
 ]);
 assert.equal(after.checkIntegrity({envelope:sealed,identity}),true);
 const fresh=after.prepareHeldOrder(request).deliveryEnvelope;
 assert.equal(fresh.key_reference,'key_2026_v1');
 assert.equal(after.checkIntegrity({envelope:fresh,identity}),true);
 const retired=keys([
  ['key_2025_v1','retired',key1],
  ['key_2026_v1','active',key2],
 ]);
 assert.throws(()=>retired.checkIntegrity({envelope:sealed,identity}),
  errorCode('key_unavailable'));
});
test('tampered GCM bytes or mismatched identity fail without exposing destination',()=>{
 const ring=keys([['key_2026_v1','active',key1]]);
 const envelope=ring.prepareHeldOrder(request).deliveryEnvelope;
 const tag=Buffer.from(envelope.auth_tag_base64,'base64');
 tag[0]^=1;
 assert.throws(()=>ring.checkIntegrity({
  envelope:{...envelope,auth_tag_base64:tag.toString('base64')},identity,
 }),errorCode('authentication_failed'));
 assert.throws(()=>ring.checkIntegrity({
  envelope,identity:{...identity,sale_id:'65000214-0000-4000-8000-000000000002'},
 }),errorCode('authentication_failed'));
 assert.throws(()=>ring.checkIntegrity({
  envelope,identity:{...identity,store_id:otherStore},
 }),errorCode('invalid_envelope'));
 assert.throws(()=>ring.checkIntegrity({
  envelope:{...envelope,nonce_base64:'bad'},identity,
 }),errorCode('invalid_envelope'));
});
test('callers cannot override encryption key or choose stale key reference',()=>{
 const ring=keys([['key_2026_v1','active',key1]]);
 assert.throws(()=>ring.prepareHeldOrder({...request,deliveryKey:key2}),
  errorCode('caller_key_override'));
 assert.throws(()=>ring.prepareHeldOrder({...request,keyReference:'key_2025_v1'}),
  errorCode('caller_key_override'));
 assert.throws(()=>ring.prepareHeldOrder({...request,authorizedStoreId:otherStore}),
  errorCode('unbound_store'));
});
test('invalid key lifecycle registrations fail closed',()=>{
 assert.throws(()=>createReviewOnlyDeliveryKeyring({
  testOnly:false,entries:[{storeId:store,keyReference:'key_2026_v1',
   keyBytes:key1,state:'active'}],
 }),errorCode('disposable_only'));
 assert.throws(()=>keys([['key_2026_v1','active',key1],
  ['key_2027_v1','active',key2]]),errorCode('multiple_active_keys'));
 assert.throws(()=>keys([['key_2026_v1','decrypt_only',key1]]),
  errorCode('missing_active_key'));
 assert.throws(()=>keys([['key_2026_v1','active',key1],
  ['key_2026_v1','decrypt_only',key2]]),errorCode('duplicate_key_reference'));
 assert.throws(()=>keys([['key_2026_v1','active',Buffer.alloc(16)]]),
  errorCode('invalid_key_entry'));
 assert.throws(()=>keys([['key_2026_v1','invalid_state',key1]]),
  errorCode('invalid_key_entry'));
});
test('no real KMS, environment secret loading, public decryption endpoint or transport',()=>{
 const code=readFileSync('src/lib/supplier/review-only-delivery-keyring.mjs','utf8');
 assert.doesNotMatch(code,/process\.env|NEXT_PUBLIC_|createClient|fetch\(|\.rpc\(|writeFile|createServer|decryptAddress|sendMail|purchaseLabel/i);
 assert.match(code,/testOnly!==true/);
 assert.match(code,/decrypt_only/);
 assert.match(code,/decrypted\?\.fill\(0\)/);
});
