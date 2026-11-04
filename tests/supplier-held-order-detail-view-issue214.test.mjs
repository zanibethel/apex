import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseSupplierHeldOrderDetails} from '../src/lib/supplier/held-order-detail-view.mjs';

const store='62000000-0000-0000-0000-000000000001';
const other='62000000-0000-0000-0000-000000000002';
const baseLine=Object.freeze({
 line_number:1,sku:'SYNTH-1',title:'Ordinary synthetic product',
 variant:'',quantity:2,unit_price_cents:'4000',line_total_cents:'8000',
});
const lineTwo=Object.freeze({
 ...baseLine,line_number:2,sku:'SYNTH-2',quantity:1,
 unit_price_cents:'2000',line_total_cents:'2000',
});
const complete=Object.freeze({
 order_id:'66000214-0000-4000-8000-000000000001',
 order_reference:'APEX-TEST-ORDER-001',
 purchased_at_utc:'2026-11-04T10:00:00.000Z',
 recorded_sale_state:'confirmed',
 display_status:'held_unverified',destination_sealed:true,
 lines:[baseLine,lineTwo],
 subtotal_cents:'10000',shipping_cents:'1500',
 discount_cents:'1000',gross_cents:'10500',
 can_ship:false,can_pay:false,can_decrypt:false,
});
const incomplete=Object.freeze({
 ...complete,order_id:'66000214-0000-4000-8000-000000000002',
 order_reference:'APEX-TEST-ORDER-002',
 purchased_at_utc:'2026-11-04T11:00:00.000Z',
 recorded_sale_state:'pending',
 display_status:'incomplete_held_record',
 destination_sealed:false,lines:[],subtotal_cents:null,
 shipping_cents:null,discount_cents:null,gross_cents:null,
});
function response(rows=[incomplete,complete],extra={}){
 return {schema_version:1,store_id:store,
 source:'private_held_order_snapshots',
 total:rows.length,offset:0,limit:25,has_more:false,
 orders:rows,detail_status:'held_unverified',
 shipping_enabled:false,payment_enabled:false,
 delivery_decryption_enabled:false,...extra};
}
const parse=(x,s=store,args={})=>parseSupplierHeldOrderDetails(x,s,args);
test('original immutable line items and amounts survive as read-only safe display',()=>{
 const data=parse(response());
 assert.ok(data);
 assert.equal(data.total,2);
 assert.equal(data.orders.length,2);
 assert.equal(data.orders[0].readiness,'incomplete');
 assert.equal(data.orders[0].totals,null);
 assert.equal(data.orders[0].lines.length,0);
 assert.equal(data.orders[1].readiness,'held');
 assert.equal(data.orders[1].lines[0].quantity,2);
 assert.equal(data.orders[1].lines[1].sku,'SYNTH-2');
 assert.deepEqual({...data.orders[1].totals},{
  subtotalCents:10000,shippingCents:1500,discountCents:1000,
  grossCents:10500,
 });
 assert.equal(data.orders[1].recordedSaleState,'confirmed');
 assert.equal(data.orders[1].destinationProtected,true);
 for(const flag of ['canShip','canPay','canDecrypt','sourceAuthoritative'])
  assert.equal(data[flag],false);
 assert.equal(Object.isFrozen(data),true);
 assert.equal(Object.isFrozen(data.orders[1].lines[0]),true);
});
test('strict supplier identity and fixed field allowlists reject extraneous sensitive payloads',()=>{
 assert.equal(parse(response(),other),null);
 assert.equal(parse(response(),''),null);
 assert.equal(parse(response(),store,{offset:1}),null);
 assert.equal(parse(response(),store,{limit:51}),null);
 assert.equal(parse({...response(),delivery_key:'sensitive'}),null);
 assert.equal(parse(response([complete],{orders:[{...complete,customer_address:'secret'}]})),null);
 assert.equal(parse(response([complete],{orders:[{
  ...complete,lines:[{...baseLine,customer_email:'private'},lineTwo],
 }]})),null);
 assert.equal(parse(response([complete],{orders:[{
  ...complete,lines:[{...baseLine,title:'Hi\nthere'},lineTwo],
 }]})),null);
});
test('incomplete snapshots never display even one partial item or financial total',()=>{
 for(const changes of [
  {lines:[baseLine]},
  {gross_cents:'1000'},
  {destination_sealed:true},
  {can_ship:true},
  {display_status:'held_unverified'},
 ]){
  assert.equal(parse(response([incomplete],{orders:[{...incomplete,...changes}]})),null);
 }
});
test('line integrity: duplicate numbers, altered amounts, shipping/discount mismatch fail closed',()=>{
 const checks=[
  {lines:[baseLine,{...lineTwo,line_number:1}]},
  {lines:[baseLine,{...lineTwo,quantity:3}]},
  {lines:[baseLine,{...lineTwo,line_total_cents:'4000'}]},
  {lines:[baseLine,{...lineTwo,unit_price_cents:'3000'}]},
  {lines:[baseLine,{...lineTwo,sku:''}]},
  {lines:[baseLine,{...lineTwo,shipping_authorized:true}]},
  {shipping_cents:'1501'},
  {discount_cents:'500'},
  {gross_cents:'9999'},
  {destination_sealed:false},
  {can_decrypt:true},
  {display_status:'ready_to_ship'},
 ];
 for(const changes of checks)
  assert.equal(parse(response([complete],{orders:[{...complete,...changes}]})),null);
});
test('canonical pagination, no duplicate IDs or fabricated missing rows',()=>{
 const one=response([complete],{limit:1,total:2,has_more:true});
 assert.equal(parse(one,{...store}[0]),null); // Invalid store argument
 const parsed=parse(one,store,{limit:1});
 assert.equal(parsed.hasMore,true);
 assert.equal(parsed.offset,0);
 const second=response([complete],{limit:1,offset:1,total:2,has_more:false});
 assert.equal(parse(second,store,{limit:1,offset:1}).hasMore,false);
 assert.equal(parse(response([complete,complete])),null);
 assert.equal(parse(response([complete,incomplete])),null); // descending order
 assert.equal(parse(response([],{total:1,has_more:true})),null);
 assert.equal(parse(response([complete],{total:2,has_more:false})),null);
 assert.equal(parse(response([complete],{limit:0})),null);
});
test('nothing leaks address, encryption material, source hashes or payment authority',()=>{
 const output=JSON.stringify(parse(response()));
 for(const secret of ['key_reference','nonce_base64','ciphertext_base64',
  'auth_tag_base64','source_event_sha256','customer_address','recipient_name'])
  assert.equal(output.includes(secret),false);
 const code=readFileSync('src/lib/supplier/held-order-detail-view.mjs','utf8');
 assert.doesNotMatch(code,/process\.env|fetch\(|\.rpc\(|createClient|purchaseLabel|createInvoice/);
 assert.match(code,/canShip:false,canPay:false/);
});
