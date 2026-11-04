/**
 * Issue #214, Phase 7: purchase-source selection and canonical-capture
 * acceptance contract. Pure, held-only, review-only — NO purchase ingestion.
 *
 * Existing browser/cart/quote/CSV/history/BTCPay sources are individually
 * insufficient as an authoritative, itemized purchase plus delivery record.
 * A future Apex SERVER transaction must capture the original purchase
 * before a payment provider event can be reconciled.
 *
 * This module never authenticates or mints an ingestion permit and must never
 * be used as checkout, payment, inventory or shipping authorization.
 */
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const KEY_REF=/^[A-Za-z0-9_-]{5,80}$/;
const ISO_UTC=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
const FIELDS=Object.freeze({
  header:['store_id','sale_id','source_order_reference','original_purchased_at',
   'source_payment_state','source_gross_cents','currency','source_event_sha256',
   'record_status','fulfillment_authorized','payment_authorized'],
  line:['store_id','source_line_reference','line_number','product_id',
   'sku_at_purchase','title_at_purchase','variant_at_purchase','quantity',
   'unit_price_cents','currency','source_line_sha256','product_eligibility',
   'shipping_authorized'],
  delivery:['store_id','envelope_format','key_reference','nonce_base64',
   'ciphertext_base64','auth_tag_base64','delivery_verified','shipping_authorized'],
  accounting:['line_subtotal_cents','shipping_cents','discount_cents',
   'source_gross_cents'],
  capture:['origin','source_record_id','independent_source_attested',
   'durable_capture_verified'],
});
const INCOMPLETE_SOURCES=Object.freeze({
  browser_cart:Object.freeze(['server_locked_purchase','immutable_order_reference',
   'purchase_timestamp','complete_item_snapshot','encrypted_delivery','source_attestation']),
  browser_delivery_form:Object.freeze(['server_locked_purchase','immutable_order_reference',
   'complete_item_snapshot','server_owned_delivery','source_attestation']),
  cart_quote:Object.freeze(['durable_purchase','original_purchase_timestamp',
   'server_captured_customer_delivery','transactional_order_identity','source_attestation']),
  admin_locked_preflight:Object.freeze(['durable_purchase','persistent_item_lock',
   'server_captured_customer_delivery','source_attestation']),
  sales_history:Object.freeze(['complete_item_snapshot','encrypted_delivery',
   'independent_purchase_capture','source_attestation']),
  sales_review_csv:Object.freeze(['complete_item_snapshot','encrypted_delivery',
   'verified_purchase_source','tamper_resistant_origin']),
  btcpay_invoice_event:Object.freeze(['itemized_purchase','customer_delivery',
   'canonical_purchase_capture','seller_product_eligibility']),
});
const REQUIRED_BEFORE_CONNECTION=Object.freeze([
 'reviewed_transactional_capture_implementation',
 'independent_store_sale_product_attestation',
 'durable_original_source_identity',
 'independent_payment_reconciliation',
 'secure_delivery_key_management',
 'authorized_product_supplier_fulfillment',
 'source_to_order_recovery_approval',
]);
const FALSE_FLAGS=Object.freeze({
 canMintOrderPermit:false,canCreateOrder:false,canCollectPayment:false,
 canReserveInventory:false,canShip:false,
});

function denied(code){
 const err=new Error('Purchase source contract denied');
 err.code=code;
 throw err;
}
function object(value){
 return value!==null&&typeof value==='object'&&!Array.isArray(value);
}
function shape(value,fields){
 if(!object(value)||Object.keys(value).length!==fields.length||
    !fields.every(f=>Object.hasOwn(value,f)))denied('invalid_shape');
}
function string(value,max=200,min=1){
 return typeof value==='string'&&value.length>=min&&value.length<=max&&
  value.trim()===value&&!/[\u0000-\u001f\u007f]/.test(value);
}
function integer(value,max=500000000000){
 return Number.isSafeInteger(value)&&value>=0&&value<=max;
}
function timestamp(value){
 return typeof value==='string'&&ISO_UTC.test(value)&&
  Number.isFinite(Date.parse(value))&&
  (new Date(value).toISOString()===value||
   new Date(value).toISOString().replace(/\.000Z$/,'Z')===value);
}
function base64Bytes(value,min,max){
 if(typeof value!=='string'||value.length>45000||
   !/^[A-Za-z0-9+/]+={0,2}$/.test(value))return false;
 const bytes=Buffer.from(value,'base64');
 return bytes.length>=min&&bytes.length<=max&&
  bytes.toString('base64')===value;
}
/**
 * Publicly visible source *capabilities* only. Never returns raw source input,
 * customer data or provider credentials. No current source is authoritative.
 */
export function classifyCurrentPurchaseSource(kind){
 if(typeof kind!=='string'||!Object.hasOwn(INCOMPLETE_SOURCES,kind))
  denied('unknown_source');
 return Object.freeze({
  kind,source_authoritative:false,
  missing:Object.freeze([...INCOMPLETE_SOURCES[kind]]),
  ...FALSE_FLAGS,
 });
}
/**
 * Validate shape/consistency of a hypothetical *sealed* server purchase
 * snapshot. Even structurally complete proposals CANNOT become authorized
 * purchases, because caller-provided "proof" cannot replace trusted DB
 * readback or source attestation.
 *
 * Only metadata and Boolean capability flags leave this function; never PII,
 * raw destination bytes, invoice keys, product content, or customer payloads.
 */
export function assessProposedApexPurchaseCapture(input){
 shape(input,['header','lines','deliveryEnvelope','accounting','capture']);
 const {header,lines,deliveryEnvelope,accounting,capture}=input;
 shape(header,FIELDS.header);
 shape(deliveryEnvelope,FIELDS.delivery);
 shape(accounting,FIELDS.accounting);
 shape(capture,FIELDS.capture);
 if(capture.origin!=='apex_server_purchase_capture_proposal_v1'||
    !UUID.test(capture.source_record_id??'')||
    capture.independent_source_attested!==false||
    capture.durable_capture_verified!==false)
  denied('untrusted_origin_claim');
 if(!UUID.test(header.store_id??'')||!UUID.test(header.sale_id??'')||
    !string(header.source_order_reference,200)||
    !timestamp(header.original_purchased_at)||
    !['pending','confirmed','cancelled','refunded'].includes(header.source_payment_state)||
    !integer(header.source_gross_cents)||header.currency!=='USD'||
    !HASH.test(header.source_event_sha256??'')||
    header.record_status!=='held_unverified'||
    header.fulfillment_authorized!==false||
    header.payment_authorized!==false)
  denied('invalid_purchase_header');
 if(!Array.isArray(lines)||lines.length<1||lines.length>50)denied('missing_purchase_lines');
 let subtotal=0;
 const refSeen=new Set();
 for(let i=0;i<lines.length;i++){
  const l=lines[i];
  shape(l,FIELDS.line);
  if(l.store_id!==header.store_id||
    !string(l.source_line_reference,140)||
    refSeen.has(l.source_line_reference)||
    l.line_number!==i+1||
    !UUID.test(l.product_id??'')||
    !string(l.sku_at_purchase,160)||
    !string(l.title_at_purchase,240)||
    !string(l.variant_at_purchase,140,0)||
    !Number.isSafeInteger(l.quantity)||l.quantity<1||l.quantity>100||
    !integer(l.unit_price_cents,99999999)||l.currency!=='USD'||
    !HASH.test(l.source_line_sha256??'')||
    l.product_eligibility!=='not_verified'||
    l.shipping_authorized!==false)
    denied('invalid_purchase_lines');
  refSeen.add(l.source_line_reference);
  subtotal+=l.quantity*l.unit_price_cents;
  if(!Number.isSafeInteger(subtotal))denied('amount_overflow');
 }
 if(!integer(accounting.line_subtotal_cents)||
    !integer(accounting.shipping_cents,10000000)||
    !integer(accounting.discount_cents)||
    !integer(accounting.source_gross_cents)||
    accounting.line_subtotal_cents!==subtotal||
    accounting.discount_cents>subtotal+accounting.shipping_cents||
    accounting.source_gross_cents!==header.source_gross_cents||
    subtotal+accounting.shipping_cents-accounting.discount_cents!==
      header.source_gross_cents)
  denied('amount_mismatch');
 if(deliveryEnvelope.store_id!==header.store_id||
    deliveryEnvelope.envelope_format!=='aes-256-gcm-v1'||
    !KEY_REF.test(deliveryEnvelope.key_reference??'')||
    !base64Bytes(deliveryEnvelope.nonce_base64,12,12)||
    !base64Bytes(deliveryEnvelope.auth_tag_base64,16,16)||
    !base64Bytes(deliveryEnvelope.ciphertext_base64,16,32768)||
    deliveryEnvelope.delivery_verified!==false||
    deliveryEnvelope.shipping_authorized!==false)
  denied('invalid_sealed_delivery');
 // Structural data is NOT attestation. Supplying valid-looking ciphertext,
 // hashes, and order IDs cannot assert that any purchase really occurred.
 return Object.freeze({
  status:'structural_capture_contract_only',
  source_authoritative:false,
  sealed_shape_checked:true,
  gcm_authentication_verified:false,
  historical_sale_independently_checked:false,
  complete_line_count:lines.length,
  monetary_reconciliation_checked:true,
  missing:REQUIRED_BEFORE_CONNECTION,
  ...FALSE_FLAGS,
 });
}
