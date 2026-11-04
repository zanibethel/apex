import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {
 verifyBtcpaySettlementEvidence,classifyBtcpayEvidenceReplay,
} from '../src/lib/supplier/btcpay-settlement-evidence.mjs';

const secret='CI-local-only-test-webhook-secret-123456';
const binding=Object.freeze({storeId:'BTCPaySyntheticA',
 webhookId:'SyntheticWebhook1',invoiceId:'SyntheticInvoice1',
 orderReference:'SYNTHETIC_ORDER_214',currency:'BTC',amount:'0.00010000'});
const event={deliveryId:'DeliveryA',originalDeliveryId:null,isRedelivery:false,
 webhookId:'SyntheticWebhook1',storeId:'BTCPaySyntheticA',
 invoiceId:'SyntheticInvoice1',type:'InvoiceSettled'};
const invoice={id:binding.invoiceId,storeId:binding.storeId,
 amount:'0.0001',currency:'BTC',status:'Settled',additionalStatus:'None',
 metadata:{orderId:binding.orderReference}};
const sign=raw=>'sha256='+createHmac('sha256',secret).update(raw).digest('hex');
function ctx(overrides={}){
 const rawBody=Buffer.from(JSON.stringify(overrides.event??event));
 return {rawBody,signature:sign(rawBody),webhookSecret:secret,
 binding:overrides.binding??binding,
 readInvoice:overrides.readInvoice??(async()=>overrides.invoice??invoice),
 ...Object.fromEntries(Object.entries(overrides).filter(([key])=>
  !['event','invoice'].includes(key)))};
}
const expectDenied=async (input,code)=>{
 await assert.rejects(()=>verifyBtcpaySettlementEvidence(input),
  err=>err.code===code&&err.message==='BTCPay order evidence denied');
};
test('real BTCPay-Sig bytes and independent settled invoice readback yield evidence ONLY',async()=>{
 let reads=0;
 const result=await verifyBtcpaySettlementEvidence(ctx({
  readInvoice:async(store,id)=>{
   reads++;assert.equal(store,binding.storeId);
   assert.equal(id,binding.invoiceId);return invoice;
  },
 }));
 assert.equal(reads,1);
 assert.equal(result.signal,'btcpay_invoice_settled_observation');
 assert.equal(result.verified_invoice_status,'Settled');
 assert.equal(result.invoice_id,binding.invoiceId);
 for(const flag of ['can_mint_order_permit','can_create_order','can_collect_payment','can_ship'])
  assert.equal(result[flag],false);
 assert.equal(Object.isFrozen(result),true);
 assert.equal(result.source_sha256.length,64);
 assert.equal(result.original_delivery_id,null);
 assert.doesNotMatch(JSON.stringify(result),/secret|customer_address|wallet/i);
});
test('invalid signature and altered bytes fail before Greenfield lookup',async()=>{
 let reads=0;
 const good=ctx({readInvoice:async()=>{reads++;return invoice;}});
 await expectDenied({...good,signature:'sha256='+('0'.repeat(64))},
  'invalid_source_signature_or_event');
 await expectDenied({...good,rawBody:Buffer.concat([good.rawBody,Buffer.from(' ')])},
  'invalid_source_signature_or_event');
 await expectDenied({...good,rawBody:Buffer.alloc(65537,0)},
  'invalid_input');
 await expectDenied({...good,signature:''},'invalid_source_signature_or_event');
 assert.equal(reads,0);
});
test('wrong webhook, supplier, invoice or nonsettled type is denied',async()=>{
 for(const [bad,code] of [
  [{...event,webhookId:'OtherWebhook'},'unbound_webhook_delivery'],
  [{...event,storeId:'OtherStore'},'invalid_source_signature_or_event'],
  [{...event,invoiceId:'OtherInvoice'},'unexpected_invoice_event'],
  [{...event,type:'InvoiceProcessing'},'unexpected_invoice_event'],
  [{...event,isRedelivery:true},'unbound_webhook_delivery'],
  [{...event,isRedelivery:false,originalDeliveryId:'Another'},'unbound_webhook_delivery'],
 ]) await expectDenied(ctx({event:bad}),code);
});
test('provider re-read is authoritative; status, extra flags and amount mismatch fail',async()=>{
 for(const bad of [
  {...invoice,status:'Processing'},
  {...invoice,additionalStatus:'PaidOver'},
  {...invoice,id:'Other'},
  {...invoice,storeId:'OtherStore'},
  {...invoice,metadata:{orderId:'OtherOrder'}},
  {...invoice,amount:'0.00020000'},
  {...invoice,amount:'0.00010001'},
  {...invoice,amount:'0.000100001'},
  {...invoice,currency:'USD'},
 ]) await expectDenied(ctx({invoice:bad}),'invoice_readback_mismatch');
 await expectDenied(ctx({readInvoice:async()=>{throw new Error('upstream auth key leak');}}),
  'invoice_readback_unavailable');
});
test('invalid independent binding or spoofed invoice rate fails before readback',async()=>{
 await expectDenied(ctx({binding:{...binding,storeId:'Other'}}),'invalid_source_signature_or_event');
 await expectDenied(ctx({binding:{...binding,amount:'0.000100001'}}),'invalid_amount');
 await expectDenied(ctx({binding:{...binding,source:'body'}}),'invalid_binding');
 await expectDenied(ctx({readInvoice:null}),'invalid_input');
});
test('identical delivery and signed redelivery are explicitly distinct, conflicts refused',async()=>{
 const first=await verifyBtcpaySettlementEvidence(ctx());
 const repeat=await verifyBtcpaySettlementEvidence(ctx());
 assert.equal(classifyBtcpayEvidenceReplay(null,first),'new_observation');
 assert.equal(classifyBtcpayEvidenceReplay(first,repeat),'identical_delivery');
 const redelivered=await verifyBtcpaySettlementEvidence(ctx({event:{
  ...event,deliveryId:'DeliveryB',originalDeliveryId:'DeliveryA',isRedelivery:true,
 }}));
 assert.equal(classifyBtcpayEvidenceReplay(first,redelivered),'authenticated_redelivery');
 assert.throws(()=>classifyBtcpayEvidenceReplay(first,{...first,source_sha256:'a'.repeat(64)}),
  error=>error.code==='conflicting_replay');
 assert.throws(()=>classifyBtcpayEvidenceReplay(first,{...first,invoice_id:'Different'}),
  error=>error.code==='conflicting_replay');
 assert.throws(()=>classifyBtcpayEvidenceReplay(first,{...first,delivery_id:'Unrelated'}),
  error=>error.code==='unrelated_delivery');
});
test('USD cents normalization uses exact decimal strings, never floats',async()=>{
 const usdBinding={...binding,currency:'USD',amount:'10.50'};
 const usdInvoice={...invoice,currency:'USD',amount:'10.5'};
 const out=await verifyBtcpaySettlementEvidence(ctx({binding:usdBinding,invoice:usdInvoice}));
 assert.equal(out.signal,'btcpay_invoice_settled_observation');
 await expectDenied(ctx({binding:usdBinding,invoice:{...usdInvoice,amount:'10.51'}}),
  'invoice_readback_mismatch');
});
test('no permission, network transport, key handling or production order side effect',()=>{
 const code=readFileSync('src/lib/supplier/btcpay-settlement-evidence.mjs','utf8');
 assert.doesNotMatch(code,/createClient|\.rpc\(|fetch\(|process\.env|NEXT_PUBLIC_|createOrder|issuePermit|paymentAuthorization|purchaseLabel/i);
 assert.match(code,/parseVerifiedInvoiceEvent/);
 assert.match(code,/can_mint_order_permit:false/);
 assert.match(code,/can_ship:false/);
});
