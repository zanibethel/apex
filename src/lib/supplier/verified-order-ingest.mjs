/**
 * Issue #214 phase 2 — held-only, side-effect-free server ingestion contract.
 * DO NOT import into a browser bundle or expose as an API route. No persistence,
 * commerce, payment, inventory, customer reads or shipping is performed here.
 * The signing key, delivery key, source sale and product membership MUST come
 * from independent trusted server configuration/database lookups.
 */
import {createCipheriv, createHmac, createHash, randomBytes, timingSafeEqual} from 'node:crypto';

const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const HEX_SIGNATURE=/^v1=[0-9a-f]{64}$/;
const STATES=new Set(['pending','confirmed','refunded','cancelled']);
const REGIONS=new Set(('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC PR GU VI AS MP').split(' '));
const EXACT_EVENT=['version','store_id','sale_id','order_reference','purchased_at','payment_state','gross_cents','currency','shipping_cents','discount_cents','lines','delivery'];
const EXACT_LINE=['source_line_reference','product_id','sku','title','variant','quantity','unit_price_cents'];
const REQUIRED_DELIVERY=['recipient_name','address_1','city','region','postal_code','country'];
const OPTIONAL_DELIVERY=['address_2'];
const MAX_EVENT_BYTES=65536;
const MAX_CLOCK_SKEW_SECONDS=300;

// All errors deliberately omit event content, customer data, signatures and keys.
function deny(code){const error=new Error('Verified order intake denied');error.code=code;throw error;}
function record(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
function fields(value,required,optional=[]){
 if(!record(value)||!required.every(k=>Object.hasOwn(value,k))||
   Object.keys(value).some(k=>!required.includes(k)&&!optional.includes(k)))deny('invalid_shape');
}
function text(value,min,max){
 return typeof value==='string'&&value.length>=min&&value.length<=max&&
  value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);
}
function cents(value,max=500000000000){return Number.isSafeInteger(value)&&value>=0&&value<=max;}
function timestamp(value){
 if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value))deny('invalid_timestamp');
 const ms=Date.parse(value);
 if(!Number.isFinite(ms))deny('invalid_timestamp');
 // Require canonical UTC timestamps, to avoid equivalent-but-different replays.
 const canonical=new Date(ms).toISOString().replace(/\.000Z$/,'Z');
 if(value!==canonical&&value!==new Date(ms).toISOString())deny('invalid_timestamp');
 return ms;
}
function keyBytes(key){
 if(!Buffer.isBuffer(key)||key.length!==32)deny('missing_delivery_key');
 return key;
}
function checkSourceAuth(rawEvent,signature,signedAt,signingSecret,nowMs){
 if(typeof rawEvent!=='string'||Buffer.byteLength(rawEvent,'utf8')>MAX_EVENT_BYTES||
    Buffer.byteLength(rawEvent,'utf8')<2)deny('invalid_event_size');
 if(!HEX_SIGNATURE.test(signature??'')||typeof signedAt!=='string'||
   !/^\d{10}$/.test(signedAt)||!Buffer.isBuffer(signingSecret)||signingSecret.length<32)
  deny('missing_source_auth');
 const seconds=Number(signedAt);
 if(!Number.isSafeInteger(nowMs)||Math.abs(Math.floor(nowMs/1000)-seconds)>MAX_CLOCK_SKEW_SECONDS)
  deny('stale_source_event');
 const digest=createHmac('sha256',signingSecret)
  .update('apex.order-detail.v1\n'+signedAt+'\n'+rawEvent,'utf8').digest();
 const supplied=Buffer.from(signature.slice(3),'hex');
 if(!timingSafeEqual(digest,supplied))deny('invalid_signature');
}
function validateDelivery(value){
 fields(value,REQUIRED_DELIVERY,OPTIONAL_DELIVERY);
 const allowed={recipient_name:120,address_1:160,address_2:160,city:90};
 for(const [k,max] of Object.entries(allowed)){
  const min=k==='address_2'?0:1;
  if(!text(value[k]??(k==='address_2'?'':null),min,max))deny('invalid_delivery');
 }
 if(!REGIONS.has(value.region)||value.country!=='US'||
  typeof value.postal_code!=='string'||/^[0-9]{5}(?:-[0-9]{4})?$/.test(value.postal_code)===false)
  deny('invalid_delivery');
 return {recipient_name:value.recipient_name,address_1:value.address_1,
  address_2:value.address_2??'',city:value.city,region:value.region,
  postal_code:value.postal_code,country:'US'};
}
function trustedProductSet(products,storeId){
 if(!Array.isArray(products)||products.length>500)deny('invalid_product_scope');
 const ids=new Set();
 for(const product of products){
  fields(product,['id','store_id']);
  if(!UUID.test(product.id??'')||product.store_id!==storeId||ids.has(product.id))
   deny('invalid_product_scope');
  ids.add(product.id);
 }
 return ids;
}
function associatedData(event){
 return Buffer.from('apex.delivery.v1\n'+event.store_id+'\n'+event.sale_id+'\n'+event.order_reference+'\n'+event.purchased_at,'utf8');
}
function sealDestination(delivery,key,keyReference,event){
 if(!text(keyReference,5,80)||!/^[A-Za-z0-9_-]+$/.test(keyReference))deny('invalid_key_reference');
 const nonce=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',keyBytes(key),nonce);
 cipher.setAAD(associatedData(event));
 const ciphertext=Buffer.concat([cipher.update(Buffer.from(JSON.stringify(delivery),'utf8')),cipher.final()]);
 const tag=cipher.getAuthTag();
 return Object.freeze({store_id:event.store_id,envelope_format:'aes-256-gcm-v1',
  key_reference:keyReference,nonce_base64:nonce.toString('base64'),
  ciphertext_base64:ciphertext.toString('base64'),auth_tag_base64:tag.toString('base64'),
  delivery_verified:false,shipping_authorized:false});
}
/**
 * Validate an authenticated signed event against separately fetched historical
 * sale/product records, then prepare *unpersisted* immutable snapshots. It is
 * intentionally not callable from any route, job or supplier UI.
 */
export function prepareHeldOrderIntake({rawEvent,signature,signedAt,signingSecret,
  recordedSale,products,authorizedStoreId,deliveryKey,keyReference,nowMs=Date.now()}){
 checkSourceAuth(rawEvent,signature,signedAt,signingSecret,nowMs);
 let event;
 try{event=JSON.parse(rawEvent);}catch{deny('invalid_json');}
 fields(event,EXACT_EVENT);
 if(event.version!==1||!UUID.test(event.store_id??'')||!UUID.test(event.sale_id??'')||
  !text(event.order_reference,1,200)||!STATES.has(event.payment_state)||
  event.currency!=='USD'||!cents(event.gross_cents)||
  !cents(event.shipping_cents,10000000)||!cents(event.discount_cents)||
  !Array.isArray(event.lines)||event.lines.length<1||event.lines.length>50)
  deny('invalid_event');
 timestamp(event.purchased_at);
 if(!UUID.test(authorizedStoreId??'')||authorizedStoreId!==event.store_id)
  deny('unauthorized_store');
 fields(recordedSale,['id','store_id','order_reference','occurred_at','sale_state','gross_cents','currency']);
 if(recordedSale.id!==event.sale_id||recordedSale.store_id!==event.store_id||
    recordedSale.order_reference!==event.order_reference||
    typeof recordedSale.occurred_at!=='string'||
    !Number.isFinite(Date.parse(recordedSale.occurred_at))||
    Date.parse(recordedSale.occurred_at)!==timestamp(event.purchased_at)||
    recordedSale.sale_state!==event.payment_state||
    recordedSale.currency!==event.currency||recordedSale.gross_cents!==event.gross_cents)
  deny('source_sale_mismatch');
 const productIds=trustedProductSet(products,event.store_id);
 const references=new Set();
 let subtotal=0;
 const lines=event.lines.map((line,index)=>{
  fields(line,EXACT_LINE);
  if(!text(line.source_line_reference,1,140)||references.has(line.source_line_reference)||
    !UUID.test(line.product_id??'')||!productIds.has(line.product_id)||
    !text(line.sku,1,160)||!text(line.title,1,240)||
    !text(line.variant,0,140)||!Number.isSafeInteger(line.quantity)||
    line.quantity<1||line.quantity>100||!cents(line.unit_price_cents,99999999))
   deny('invalid_line');
  references.add(line.source_line_reference);
  const amount=line.quantity*line.unit_price_cents;
  if(!Number.isSafeInteger(amount))deny('invalid_amount');
  subtotal+=amount;
  if(!Number.isSafeInteger(subtotal))deny('invalid_amount');
  return Object.freeze({store_id:event.store_id,source_line_reference:line.source_line_reference,
   line_number:index+1,product_id:line.product_id,sku_at_purchase:line.sku,
   title_at_purchase:line.title,variant_at_purchase:line.variant,
   quantity:line.quantity,unit_price_cents:line.unit_price_cents,currency:'USD',
   source_line_sha256:createHash('sha256').update(JSON.stringify(line)).digest('hex'),
   product_eligibility:'not_verified',shipping_authorized:false});
 });
 if(event.discount_cents>subtotal+event.shipping_cents||
    subtotal+event.shipping_cents-event.discount_cents!==event.gross_cents)
  deny('amount_mismatch');
 const delivery=validateDelivery(event.delivery);
 // Do not retain, return or log the plaintext destination in the result.
 const envelope=sealDestination(delivery,deliveryKey,keyReference,event);
 const eventHash=createHash('sha256').update(rawEvent,'utf8').digest('hex');
 return Object.freeze({
  header:Object.freeze({store_id:event.store_id,sale_id:event.sale_id,
   source_order_reference:event.order_reference,original_purchased_at:event.purchased_at,
   source_payment_state:event.payment_state,source_gross_cents:event.gross_cents,
   currency:'USD',source_event_sha256:eventHash,record_status:'held_unverified',
   fulfillment_authorized:false,payment_authorized:false}),
  lines:Object.freeze(lines),deliveryEnvelope:envelope,
  accounting:Object.freeze({line_subtotal_cents:subtotal,shipping_cents:event.shipping_cents,
   discount_cents:event.discount_cents,source_gross_cents:event.gross_cents}),
  persistence_enabled:false,
 });
}
/** First compare stable identities, then the signed source bytes' hash. The
 * future DB transaction must also enforce both unique constraints atomically.
 */
export function classifyOrderReplay(existing,proposal){
 if(existing==null)return 'new';
 if(!record(existing)||!record(proposal)||!record(proposal.header))deny('invalid_replay');
 const h=proposal.header;
 if(existing.store_id!==h.store_id||existing.sale_id!==h.sale_id||
    existing.source_order_reference!==h.source_order_reference||
    existing.source_event_sha256!==h.source_event_sha256)
  deny('conflicting_replay');
 return 'identical_replay';
}
