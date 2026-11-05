import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 sealPrivateOrderDeliveryV1,openPrivateOrderDeliveryV1,
} from "../src/lib/payments/private-order-delivery-envelope-v1.mjs";

const store="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";
const otherStore="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d2";
const order="a471a688-9a9d-470d-8d9c-3ee8cbb87642";
const otherOrder="a471a688-9a9d-470d-8d9c-3ee8cbb87641";
const key=Buffer.alloc(32,0x31); // Synthetic test-only key.
const otherKey=Buffer.alloc(32,0x32);
const keyReference="apex_test_key_v1";
const delivery=()=>({
 firstName:" Ada ",lastName:" Example ",email:" ADA@Example.com ",
 phone:"",address1:"100 Main Street",address2:"",
 city:"Lubbock",state:"TX",postalCode:"79401",
});
const input=()=>({storeId:store,orderId:order,keyReference,key,
 delivery:delivery()});
const open=(envelope,props={})=>openPrivateOrderDeliveryV1({
 storeId:store,orderId:order,keyReference,key,envelope,...props,
});
const denies=fn=>assert.throws(fn,/Protected delivery record unavailable/);

test("private delivery data is AES-GCM-sealed, round trips and stays held",()=>{
 const e=sealPrivateOrderDeliveryV1(input());
 assert.equal(e.order_id,order);
 assert.equal(e.store_id,store);
 assert.equal(e.envelope_format,"aes-256-gcm-v1");
 assert.equal(e.key_reference,keyReference);
 assert.equal(e.nonce.length,12);
 assert.equal(e.auth_tag.length,16);
 assert.ok(e.ciphertext.length>=16 && e.ciphertext.length<=32768);
 assert.equal(e.delivery_verified,false);
 assert.equal(e.shipping_authorized,false);
 assert.equal(open(e).firstName,"Ada");
 assert.equal(open(e).email,"ada@example.com");
 assert.doesNotMatch(e.ciphertext.toString("utf8"),/Main Street|ada@example/);
 assert.doesNotMatch(JSON.stringify({
  store:e.store_id,order:e.order_id,fmt:e.envelope_format,
  keyRef:e.key_reference,
 }),/Main Street/);
});

test("same customer details must use distinct random 96-bit GCM nonces",()=>{
 const first=sealPrivateOrderDeliveryV1(input());
 const second=sealPrivateOrderDeliveryV1(input());
 assert.notDeepEqual(first.nonce,second.nonce);
 assert.notDeepEqual(first.ciphertext,second.ciphertext);
 assert.equal(open(first).postalCode,open(second).postalCode);
});

test("ciphertext is cryptographically bound to exact store, order and key reference",()=>{
 const env=sealPrivateOrderDeliveryV1(input());
 denies(()=>open(env,{storeId:otherStore}));
 denies(()=>open(env,{orderId:otherOrder}));
 denies(()=>open(env,{keyReference:"apex_test_key_v2"}));
 denies(()=>open(env,{key:otherKey}));
 denies(()=>open({...env,store_id:otherStore},{storeId:otherStore}));
 denies(()=>open({...env,order_id:otherOrder},{orderId:otherOrder}));
 denies(()=>open({...env,key_reference:"apex_test_key_v2"},{
  keyReference:"apex_test_key_v2"}));
});

test("modified nonce, tag, ciphertext or surplus metadata cannot be decrypted",()=>{
 const env=sealPrivateOrderDeliveryV1(input());
 for(const field of ["nonce","auth_tag","ciphertext"]){
  const tampered=Buffer.from(env[field]);tampered[0]^=0x01;
  denies(()=>open({...env,[field]:tampered}));
 }
 denies(()=>open({...env,shipping_authorized:true}));
 denies(()=>open({...env,delivery_verified:true}));
 denies(()=>open({...env,recipient_name:"leak"}));
 denies(()=>open({...env,nonce:Buffer.alloc(11)}));
 denies(()=>open({...env,auth_tag:Buffer.alloc(15)}));
 denies(()=>open({...env,ciphertext:Buffer.alloc(1)}));
 denies(()=>open({...env,ciphertext:Buffer.alloc(32769)}));
});

test("reject invalid delivery, extra fields, weak keys and improper IDs",()=>{
 denies(()=>sealPrivateOrderDeliveryV1({...input(),key:Buffer.alloc(16)}));
 denies(()=>sealPrivateOrderDeliveryV1({...input(),key:"not-a-key"}));
 denies(()=>sealPrivateOrderDeliveryV1({...input(),storeId:"invalid"}));
 denies(()=>sealPrivateOrderDeliveryV1({...input(),orderId:"invalid"}));
 denies(()=>sealPrivateOrderDeliveryV1({...input(),keyReference:"../keys"}));
 denies(()=>sealPrivateOrderDeliveryV1({
  ...input(),delivery:{...delivery(),buyerNote:"private"},
 }));
 denies(()=>sealPrivateOrderDeliveryV1({
  ...input(),delivery:{...delivery(),postalCode:"invalid"},
 }));
});

test("private module remains free of checkout, payment or database actions",()=>{
 const source=readFileSync(
  "src/lib/payments/private-order-delivery-envelope-v1.mjs","utf8");
 assert.doesNotMatch(source,/\.insert\(|\.delete\(|\.rpc\(|fetch\(|service_role|NEXT_PUBLIC_/);
 assert.match(source,/aes-256-gcm/);
 assert.match(source,/authTagLength:16/);
 assert.match(source,/shipping_authorized:false/);
 const route=readFileSync("src/app/api/checkout/handoff/v1/route.ts","utf8");
 assert.match(route,/status:503/);
 assert.match(route,/return unavailable\(\)/);
});
