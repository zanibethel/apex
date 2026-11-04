/**
 * Issue #214 Phase 5 — BTCPay settlement evidence, NOT an order source.
 *
 * The event signature authenticates BTCPay's webhook bytes, NOT a purchased
 * item snapshot or customer address. This file has no HTTP server, DB writer,
 * permit minter, checkout, inventory, payout, or shipping side effects.
 * Binding and readInvoice MUST be independently authorized private inputs.
 */
import {createHash} from 'node:crypto';
import {parseVerifiedInvoiceEvent} from '../payments/btcpay-sandbox.mjs';

const ID=/^[A-Za-z0-9_-]{1,100}$/;
function deny(code){
 const error=new Error('BTCPay order evidence denied');
 error.code=code;
 throw error;
}
function own(obj,key){return obj && Object.hasOwn(obj,key);}
function exactBinding(b){
 const names=['storeId','webhookId','invoiceId','orderReference','currency','amount'];
 if(!b || typeof b!=='object'||Array.isArray(b)||
  Object.keys(b).length!==names.length||!names.every(k=>own(b,k))||
  ![b.storeId,b.webhookId,b.invoiceId,b.orderReference].every(v=>
   typeof v==='string'&&ID.test(v))||
  !['USD','BTC'].includes(b.currency))deny('invalid_binding');
 parseFixedAmount(b.amount,b.currency);
 return b;
}
function parseFixedAmount(amount,currency){
 const scale=currency==='BTC'?8:currency==='USD'?2:null;
 if(scale===null||typeof amount!=='string'||
  !/^(?:0|[1-9]\d{0,12})(?:\.\d{1,8})?$/.test(amount))deny('invalid_amount');
 const [whole,frac='']=amount.split('.');
 if(frac.length>scale)deny('invalid_amount');
 const base=10n**BigInt(scale);
 const value=BigInt(whole)*base+BigInt(frac.padEnd(scale,'0')||'0');
 if(value<=0n||value>1000000000000000n)deny('invalid_amount');
 return value;
}
/**
 * Verify actual BTCPay-Sig (HMAC of raw bytes) via the existing regtest-tested
 * parser; match a separately stored binding; independently re-fetch invoice.
 * Accept only settled, nonexceptional evidence. No payment authorization.
 */
export async function verifyBtcpaySettlementEvidence({
 rawBody,signature,webhookSecret,binding,readInvoice,
}){
 exactBinding(binding);
 if(!Buffer.isBuffer(rawBody)||rawBody.length<2||rawBody.length>65536||
  typeof readInvoice!=='function')deny('invalid_input');
 let event;
 try {
  event=parseVerifiedInvoiceEvent(rawBody,signature,webhookSecret,binding.storeId);
 } catch {
  deny('invalid_source_signature_or_event');
 }
 if(event.type!=='InvoiceSettled'||event.invoiceId!==binding.invoiceId)
  deny('unexpected_invoice_event');
 // The parser intentionally exposes only the documented invoice identity.
 // Check the additional webhook identity and redelivery indicators ourselves.
 let raw;
 try { raw=JSON.parse(rawBody.toString('utf8')); }
 catch { deny('invalid_source_event'); }
 if(raw.webhookId!==binding.webhookId ||
    typeof raw.isRedelivery!=='boolean' ||
    (raw.isRedelivery && (
      typeof raw.originalDeliveryId!=='string'||
      !ID.test(raw.originalDeliveryId)||raw.originalDeliveryId===event.deliveryId
    ))||
    (!raw.isRedelivery && raw.originalDeliveryId!=null))
   deny('unbound_webhook_delivery');
 // Injected readback must use an independently authenticated, scoped
 // Greenfield connection. No URL from event fields is ever followed.
 let invoice;
 try {invoice=await readInvoice(binding.storeId,binding.invoiceId);}
 catch {deny('invoice_readback_unavailable');}
 if(!invoice || typeof invoice!=='object' ||
    invoice.id!==binding.invoiceId ||
    invoice.storeId!==binding.storeId ||
    invoice.currency!==binding.currency ||
    invoice.metadata?.orderId!==binding.orderReference ||
    invoice.status!=='Settled' || invoice.additionalStatus!=='None')
  deny('invoice_readback_mismatch');
 let expected,actual;
 try {
  expected=parseFixedAmount(binding.amount,binding.currency);
  actual=parseFixedAmount(invoice.amount,binding.currency);
 } catch {deny('invoice_readback_mismatch');}
 if(expected!==actual)deny('invoice_readback_mismatch');
 const rawHash=createHash('sha256').update(rawBody).digest('hex');
 return Object.freeze({
  schema_version:1,
  signal:'btcpay_invoice_settled_observation',
  store_id:binding.storeId,
  webhook_id:binding.webhookId,
  invoice_id:binding.invoiceId,
  order_reference:binding.orderReference,
  delivery_id:event.deliveryId,
  original_delivery_id:raw.isRedelivery?raw.originalDeliveryId:null,
  source_sha256:rawHash,
  verified_invoice_status:'Settled',
  can_mint_order_permit:false,
  can_create_order:false,
  can_collect_payment:false,
  can_ship:false,
 });
}
/** Classify immutable journal entries. This is advisory, never a persistent
 * replay lock. Original-delivery redelivery may have different raw bytes.
 */
export function classifyBtcpayEvidenceReplay(previous,evidence){
 if(previous==null)return 'new_observation';
 if(!previous||!evidence||previous.signal!=='btcpay_invoice_settled_observation'||
   evidence.signal!=='btcpay_invoice_settled_observation')
  deny('invalid_replay');
 const keys=['store_id','webhook_id','invoice_id','order_reference','verified_invoice_status'];
 if(keys.some(k=>previous[k]!==evidence[k]))deny('conflicting_replay');
 if(previous.delivery_id===evidence.delivery_id){
  if(previous.source_sha256!==evidence.source_sha256)
   deny('conflicting_replay');
  return 'identical_delivery';
 }
 if(evidence.original_delivery_id===previous.delivery_id)
  return 'authenticated_redelivery';
 deny('unrelated_delivery');
}
