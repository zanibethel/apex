import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
 classifyCurrentPurchaseSource,assessProposedApexPurchaseCapture,
} from '../src/lib/checkout/authoritative-purchase-source-contract.mjs';
import {prepareHeldOrderIntake} from '../src/lib/supplier/verified-order-ingest.mjs';

const store='62000000-0000-0000-0000-000000000001';
const otherStore='62000000-0000-0000-0000-000000000002';
const sale='65000214-0000-4000-8000-000000000001';
const product='64000000-0000-0000-0000-000000000001';
const secret=Buffer.alloc(32,11),deliveryKey=Buffer.alloc(32,22);
const signedAt='1793799000';
const event={
 version:1,store_id:store,sale_id:sale,order_reference:'SOURCE-CONTRACT-SYNTHETIC-1',
 purchased_at:'2026-11-04T10:00:00Z',payment_state:'confirmed',
 gross_cents:10500,currency:'USD',shipping_cents:1500,discount_cents:1000,
 lines:[
 {source_line_reference:'l1',product_id:product,sku:'TEST-1',
  title:'Synthetic item 1',variant:'',quantity:2,unit_price_cents:4000},
 {source_line_reference:'l2',product_id:product,sku:'TEST-2',
  title:'Synthetic item 2',variant:'alternate',quantity:1,unit_price_cents:2000},
 ],
 delivery:{recipient_name:'Private Synthetic Recipient',address_1:'123 Example Road',
 city:'Exampleville',region:'TX',postal_code:'79401',country:'US'},
};
const rawEvent=JSON.stringify(event);
const signature='v1='+createHmac('sha256',secret)
 .update('apex.order-detail.v1\n'+signedAt+'\n'+rawEvent).digest('hex');
function proposal(){
 const held=prepareHeldOrderIntake({
  rawEvent,signature,signedAt,signingSecret:secret,
  recordedSale:{id:sale,store_id:store,order_reference:event.order_reference,
   occurred_at:'2026-11-04T10:00:00+00:00',sale_state:'confirmed',
   gross_cents:10500,currency:'USD'},
  authorizedStoreId:store,products:[{id:product,store_id:store}],
  deliveryKey,keyReference:'ci_synthetic_review_key',
  nowMs:Number(signedAt)*1000,
 });
 return {
  header:{...held.header},lines:held.lines.map(line=>({...line})),
  deliveryEnvelope:{...held.deliveryEnvelope},
  accounting:{...held.accounting},
  capture:{
   origin:'apex_server_purchase_capture_proposal_v1',
   source_record_id:'67000000-0000-4000-8000-000000000001',
   independent_source_attested:false,durable_capture_verified:false,
  },
 };
}
const refused=(fn,code)=>assert.throws(fn,e=>
 e?.message==='Purchase source contract denied'&&e?.code===code);
test('every existing Apex data feed is individually insufficient for a purchase',()=>{
 const kinds=['browser_cart','browser_delivery_form','cart_quote',
  'admin_locked_preflight','sales_history','sales_review_csv',
  'btcpay_invoice_event'];
 for(const kind of kinds){
  const result=classifyCurrentPurchaseSource(kind);
  assert.equal(result.kind,kind);
  assert.equal(result.source_authoritative,false);
  assert.ok(result.missing.length>0);
  for(const flag of ['canMintOrderPermit','canCreateOrder','canCollectPayment',
   'canReserveInventory','canShip'])assert.equal(result[flag],false);
  assert.equal(Object.isFrozen(result),true);
 }
 refused(()=>classifyCurrentPurchaseSource('unknown_paid_order'),'unknown_source');
 refused(()=>classifyCurrentPurchaseSource('__proto__'),'unknown_source');
});
test('sealed complete synthetic proposal passes SHAPE only, never grants order authority',()=>{
 const result=assessProposedApexPurchaseCapture(proposal());
 assert.equal(result.status,'structural_capture_contract_only');
 assert.equal(result.sealed_shape_checked,true);
 assert.equal(result.monetary_reconciliation_checked,true);
 assert.equal(result.complete_line_count,2);
 assert.equal(result.source_authoritative,false);
 assert.equal(result.historical_sale_independently_checked,false);
 assert.equal(result.gcm_authentication_verified,false);
 assert.ok(result.missing.includes('reviewed_transactional_capture_implementation'));
 assert.ok(result.missing.includes('secure_delivery_key_management'));
 for(const flag of ['canMintOrderPermit','canCreateOrder','canCollectPayment',
  'canReserveInventory','canShip'])assert.equal(result[flag],false);
 assert.equal(Object.isFrozen(result),true);
 const output=JSON.stringify(result);
 assert.doesNotMatch(output,/Private Synthetic Recipient|123 Example Road|79401|Synthetic item|ci_synthetic_review_key/);
});
test('untrusted or forged provenance is refused even if all other fields look complete',()=>{
 const p=proposal();
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,capture:{...p.capture,independent_source_attested:true},
 }),'untrusted_origin_claim');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,capture:{...p.capture,durable_capture_verified:true},
 }),'untrusted_origin_claim');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,capture:{...p.capture,origin:'btcpay_invoice_event'},
 }),'untrusted_origin_claim');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,capture:{...p.capture,client_claimed_paid:true},
 }),'invalid_shape');
});
test('source has immutable identity, strict purchase timestamp and held flags',()=>{
 const p=proposal();
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,header:{...p.header,store_id:otherStore},
 }),'invalid_purchase_lines');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,header:{...p.header,original_purchased_at:'tomorrow'},
 }),'invalid_purchase_header');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,header:{...p.header,payment_authorized:true},
 }),'invalid_purchase_header');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,header:{...p.header,record_status:'shipped'},
 }),'invalid_purchase_header');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,header:{...p.header,plaintext_address:'private'},
 }),'invalid_shape');
});
test('all lines are required with unique ordered references and withheld eligibility',()=>{
 const p=proposal();
 refused(()=>assessProposedApexPurchaseCapture({...p,lines:p.lines.slice(0,1)}),
  'amount_mismatch');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,lines:[p.lines[0],{...p.lines[1],source_line_reference:p.lines[0].source_line_reference}],
 }),'invalid_purchase_lines');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,lines:[p.lines[0],{...p.lines[1],line_number:9}],
 }),'invalid_purchase_lines');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,lines:[{...p.lines[0],quantity:0},p.lines[1]],
 }),'invalid_purchase_lines');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,lines:[{...p.lines[0],shipping_authorized:true},p.lines[1]],
 }),'invalid_purchase_lines');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,lines:[{...p.lines[0],product_eligibility:'approved'},p.lines[1]],
 }),'invalid_purchase_lines');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,lines:[{...p.lines[0],customer_name:'injected'},p.lines[1]],
 }),'invalid_shape');
});
test('gross must equal complete item subtotal plus shipping minus discount, no tax field',()=>{
 const p=proposal();
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,accounting:{...p.accounting,shipping_cents:2500},
 }),'amount_mismatch');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,accounting:{...p.accounting,discount_cents:0},
 }),'amount_mismatch');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,accounting:{...p.accounting,source_gross_cents:0},
 }),'amount_mismatch');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,accounting:{...p.accounting,tax_cents:100},
 }),'invalid_shape');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,header:{...p.header,source_gross_cents:10501},
 }),'amount_mismatch');
});
test('only sealed delivery components with canonical ciphertext format are accepted',()=>{
 const p=proposal();
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,deliveryEnvelope:{...p.deliveryEnvelope,store_id:otherStore},
 }),'invalid_sealed_delivery');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,deliveryEnvelope:{...p.deliveryEnvelope,nonce_base64:'fake='},
 }),'invalid_sealed_delivery');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,deliveryEnvelope:{...p.deliveryEnvelope,auth_tag_base64:''},
 }),'invalid_sealed_delivery');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,deliveryEnvelope:{...p.deliveryEnvelope,delivery_verified:true},
 }),'invalid_sealed_delivery');
 refused(()=>assessProposedApexPurchaseCapture({
  ...p,deliveryEnvelope:{...p.deliveryEnvelope,recipient_address:'123 private'},
 }),'invalid_shape');
});
test('contract contains no network/DB writer, payment, label, or secret loading',()=>{
 const source=readFileSync('src/lib/checkout/authoritative-purchase-source-contract.mjs','utf8');
 assert.doesNotMatch(source,/fetch\(|process\.env|\.rpc\(|createClient|createServer|purchaseLabel|grant\s+execute|NEXT_PUBLIC_/i);
 assert.match(source,/source_authoritative:false/);
 assert.match(source,/canMintOrderPermit:false/);
 assert.match(source,/canShip:false/);
});
