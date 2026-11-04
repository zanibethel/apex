import test from 'node:test';
import assert from 'node:assert/strict';
import {createDecipheriv,createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {prepareHeldOrderIntake,classifyOrderReplay} from '../src/lib/supplier/verified-order-ingest.mjs';

const store='62000000-0000-0000-0000-000000000001';
const otherStore='62000000-0000-0000-0000-000000000002';
const sale='65000214-0000-4000-8000-000000000001';
const product='64000000-0000-0000-0000-000000000001';
const secret=Buffer.alloc(32,11),key=Buffer.alloc(32,22);
const at='1793799000',nowMs=Number(at)*1000; // synthetic clock only
const recordedSale={id:sale,store_id:store,order_reference:'SYNTHETIC-214-1',
 occurred_at:'2026-11-04T10:00:00+00:00',sale_state:'confirmed',gross_cents:10500,currency:'USD'};
const event={version:1,store_id:store,sale_id:sale,order_reference:'SYNTHETIC-214-1',
 purchased_at:'2026-11-04T10:00:00Z',payment_state:'confirmed',gross_cents:10500,
 currency:'USD',shipping_cents:1500,discount_cents:1000,
 lines:[
  {source_line_reference:'1',product_id:product,sku:'SYN-1',title:'Synthetic item A',variant:'',quantity:2,unit_price_cents:4000},
  {source_line_reference:'2',product_id:product,sku:'SYN-2',title:'Synthetic item B',variant:'2-pack',quantity:1,unit_price_cents:2000},
 ],
 delivery:{recipient_name:'Synthetic Recipient',address_1:'123 Example Road',
 city:'Exampleville',region:'TX',postal_code:'79401',country:'US'},
};
const signing=(raw,signedAt=at,signingSecret=secret)=>'v1='+createHmac('sha256',signingSecret)
 .update('apex.order-detail.v1\n'+signedAt+'\n'+raw,'utf8').digest('hex');
const options=(e=event)=>{
 const rawEvent=JSON.stringify(e);
 return {rawEvent,signature:signing(rawEvent),signedAt:at,signingSecret:secret,
  nowMs,authorizedStoreId:store,recordedSale,products:[{id:product,store_id:store}],
  deliveryKey:key,keyReference:'key_2026_review_01'};
};
const prepare=(e=event)=>prepareHeldOrderIntake(options(e));
const denies=(opts,code)=>assert.throws(()=>prepareHeldOrderIntake(opts),error=>
 error.code===code&&error.message==='Verified order intake denied'&&
 !JSON.stringify(error).includes('Recipient'));

test('valid signed synthetic event becomes held immutable snapshots and exact net accounting',()=>{
 const output=prepare();
 assert.equal(output.header.sale_id,sale);
 assert.equal(output.header.original_purchased_at,event.purchased_at);
 assert.equal(output.header.source_gross_cents,10500);
 assert.deepEqual(output.accounting,{line_subtotal_cents:10000,shipping_cents:1500,
  discount_cents:1000,source_gross_cents:10500});
 assert.deepEqual(output.lines.map(l=>l.line_number),[1,2]);
 assert.equal(output.lines[0].product_eligibility,'not_verified');
 assert.equal(output.lines[0].shipping_authorized,false);
 assert.equal(output.header.fulfillment_authorized,false);
 assert.equal(output.header.payment_authorized,false);
 assert.equal(output.persistence_enabled,false);
 assert.equal(Object.isFrozen(output.header),true);
 assert.equal(Object.isFrozen(output.lines),true);
 assert.equal(Object.isFrozen(output.deliveryEnvelope),true);
 assert.equal(output.deliveryEnvelope.envelope_format,'aes-256-gcm-v1');
 assert.equal(output.deliveryEnvelope.delivery_verified,false);
 assert.equal(output.deliveryEnvelope.shipping_authorized,false);
 assert.equal(Buffer.from(output.deliveryEnvelope.nonce_base64,'base64').length,12);
 assert.equal(Buffer.from(output.deliveryEnvelope.auth_tag_base64,'base64').length,16);
 const serialized=JSON.stringify(output);
 assert.ok(!serialized.includes('Synthetic Recipient'));
 assert.ok(!serialized.includes('123 Example Road'));
 assert.ok(!serialized.includes('79401'));
});
test('AES-256-GCM sealed destination is authenticated and bound to store/sale/purchase',()=>{
 const envelope=prepare().deliveryEnvelope;
 const iv=Buffer.from(envelope.nonce_base64,'base64'),tag=Buffer.from(envelope.auth_tag_base64,'base64');
 const ciphertext=Buffer.from(envelope.ciphertext_base64,'base64');
 const aad='apex.delivery.v1\n'+store+'\n'+sale+'\nSYNTHETIC-214-1\n2026-11-04T10:00:00Z';
 const d=createDecipheriv('aes-256-gcm',key,iv);
 d.setAAD(Buffer.from(aad));d.setAuthTag(tag);
 const plain=Buffer.concat([d.update(ciphertext),d.final()]);
 assert.equal(JSON.parse(plain.toString()).recipient_name,'Synthetic Recipient');
 const changed=createDecipheriv('aes-256-gcm',key,iv);
 changed.setAAD(Buffer.from(aad.replace(store,otherStore)));changed.setAuthTag(tag);
 assert.throws(()=>Buffer.concat([changed.update(ciphertext),changed.final()]));
 assert.notEqual(prepare().deliveryEnvelope.nonce_base64,envelope.nonce_base64);
});
test('unsigned, stale or modified source events are denied without exposure',()=>{
 const good=options();
 denies({...good,signature:'v1='+('a'.repeat(64))},'invalid_signature');
 denies({...good,signedAt:String(Number(at)-301)},'stale_source_event');
 denies({...good,signingSecret:Buffer.alloc(31)},'missing_source_auth');
 denies({...good,deliveryKey:null},'missing_delivery_key');
 denies({...good,rawEvent:good.rawEvent+' '},'invalid_signature');
 denies({...good,signature:'v1=nothex'},'missing_source_auth');
 denies({...good,rawEvent:' '.repeat(65537)},'invalid_event_size');
});
test('trusted historical sale, authenticated store and product tenant must match',()=>{
 denies({...options(),authorizedStoreId:otherStore},'unauthorized_store');
 denies({...options(),recordedSale:{...recordedSale,id:'65000214-0000-4000-8000-000000000002'}},'source_sale_mismatch');
 denies({...options(),recordedSale:{...recordedSale,occurred_at:'2026-11-04T11:00:00+00:00'}},'source_sale_mismatch');
 denies({...options(),recordedSale:{...recordedSale,store_id:otherStore}},'source_sale_mismatch');
 denies({...options(),recordedSale:{...recordedSale,sale_state:'pending'}},'source_sale_mismatch');
 denies({...options(),recordedSale:{...recordedSale,gross_cents:1}},'source_sale_mismatch');
 denies({...options(),products:[{id:product,store_id:otherStore}]},'invalid_product_scope');
 denies({...options(),products:[]},'invalid_line');
});
test('incomplete lines, duplicate lines, wrong shipping/discount or tax field fail',()=>{
 denies(options({...event,gross_cents:10000}),'source_sale_mismatch');
 denies(options({...event,shipping_cents:2500}),'amount_mismatch');
 denies(options({...event,discount_cents:500}),'amount_mismatch');
 denies(options({...event,discount_cents:5000000000}),'amount_mismatch');
 denies(options({...event,lines:event.lines.slice(0,1)}),'amount_mismatch');
 denies(options({...event,lines:[event.lines[0],event.lines[0]]}),'invalid_line');
 denies(options({...event,lines:[{...event.lines[0],quantity:0},event.lines[1]]}),'invalid_line');
 denies(options({...event,lines:[{...event.lines[0],unit_price_cents:-1},event.lines[1]]}),'invalid_line');
 denies(options({...event,lines:[]}), 'invalid_event');
 denies(options({...event,lines:Array(51).fill(event.lines[0])}), 'invalid_event');
 denies(options({...event,tax_cents:500}), 'invalid_shape');
 denies(options({...event,lines:[{...event.lines[0],customer_address:'private'},event.lines[1]]}), 'invalid_shape');
});
test('delivery is minimal and validated before sealing',()=>{
 denies(options({...event,delivery:{...event.delivery,postal_code:'!!!'}}),'invalid_delivery');
 denies(options({...event,delivery:{...event.delivery,region:'XX'}}),'invalid_delivery');
 denies(options({...event,delivery:{...event.delivery,country:'CA'}}),'invalid_delivery');
 denies(options({...event,delivery:{...event.delivery,address_1:'123\nAnything'}}),'invalid_delivery');
 denies(options({...event,delivery:{...event.delivery,phone:'123'}}),'invalid_shape');
 denies(options({...event,delivery:null}),'invalid_shape');
 denies({...options(),keyReference:'unsafe key string'},'invalid_key_reference');
});
test('exact repeats are idempotent; same-source hash changes or cross-store replays conflict',()=>{
 const p=prepare();
 assert.equal(classifyOrderReplay(null,p),'new');
 assert.equal(classifyOrderReplay({...p.header},p),'identical_replay');
 assert.throws(()=>classifyOrderReplay({...p.header,source_event_sha256:'a'.repeat(64)},p),
  err=>err.code==='conflicting_replay');
 assert.throws(()=>classifyOrderReplay({...p.header,store_id:otherStore},p),
  err=>err.code==='conflicting_replay');
});
test('module has no API, database credentials, write or commerce integration',()=>{
 const source=readFileSync('src/lib/supplier/verified-order-ingest.mjs','utf8');
 assert.doesNotMatch(source,/createClient|supabase\.|\.rpc\(|fetch\(|process\.env|NEXT_PUBLIC_|setInventory|purchaseLabel/i);
 assert.match(source,/createHmac/);assert.match(source,/timingSafeEqual/);
 assert.match(source,/createCipheriv\('aes-256-gcm'/);assert.match(source,/randomBytes\(12\)/);
 assert.match(source,/persistence_enabled:false/);
});
