/**
 * PR #160: single synthetic regtest acceptance scenario composed from PRs
 * #118, #121 and #125. This uses stubbed provider HTTP + an in-memory
 * signed-event fixture and verified wallet snapshots; there is no BTCPay
 * process, persistent ledger, real transaction, or live checkout in this test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {createHmac,timingSafeEqual} from "node:crypto";
import {readFileSync} from "node:fs";
import {createPreauthorizedRegtestInvoice} from "../src/lib/payments/btcpay-regtest-prepost-fence.mjs";
import {assessSyntheticPrismFeeBudget,reconcileSyntheticPrismPayout}
 from "../src/lib/payments/prism-payout-reliability.mjs";
import {readRegtestGreenfieldInventory,assessRegtestProviderDrain}
 from "../src/lib/payments/btcpay-provider-drain.mjs";

const storeId="apex_regtest_store_160";
const orderRef="synthetic_order_160";
const invoiceId="invoice_160";
const intentId="11111111-2222-4333-8444-555555555555";
const amountSats=10_000_000n;
const apiKey="SYNTHETIC_REGTEST_TOKEN_NOT_REAL";
const origin="http://127.0.0.1:14142/";
const secret="SYNTHETIC_WEBHOOK_KEY_ONLY";
function toBtc(sats){
 return (sats/100000000n)+"."+(sats%100000000n).toString().padStart(8,"0");
}
function sign(raw){return "sha256="+createHmac("sha256",secret).update(raw).digest("hex");}
function checkedSignedEvent(raw,signature){
 if(typeof raw!=="string"||typeof signature!=="string"||
  !/^sha256=[0-9a-f]{64}$/.test(signature))return null;
 const received=Buffer.from(signature.slice(7),"hex");
 const expected=Buffer.from(sign(raw).slice(7),"hex");
 if(!timingSafeEqual(received,expected))return null;
 let message;
 try{message=JSON.parse(raw);}catch{return null;}
 if(message?.type!=="InvoiceSettled"||message.storeId!==storeId||
  message.invoiceId!==invoiceId||message.orderRef!==orderRef||
  !/^[A-Za-z0-9_-]{1,100}$/.test(message.deliveryId||""))return null;
 return message;
}
function fakeProvider({settled=false,wrongAmount=false}={}){
 const calls=[];
 async function fetchImpl(url,options){
  const u=new URL(url);
  assert.equal(u.host,"127.0.0.1:14142");
  assert.equal(options.headers.Authorization,"token "+apiKey);
  assert.equal(options.redirect,"error");
  assert.equal(options.cache,"no-store");
  calls.push(options.method);
  if(options.method==="POST"){
   const b=JSON.parse(options.body);
   assert.deepEqual(b,{
    amount:"0.10000000",currency:"BTC",
    metadata:{orderId:orderRef,apexIntentId:intentId},
   });
   return {ok:true,json:async()=>({id:invoiceId,storeId})};
  }
  if(u.pathname.endsWith("/invoices/"+invoiceId))
   return {ok:true,json:async()=>({
    id:invoiceId,storeId,currency:"BTC",amount:wrongAmount?"0.10000001":"0.10000000",
    status:settled?"Settled":"New",
    metadata:{orderId:orderRef,apexIntentId:intentId},
   })};
  if(u.pathname.endsWith("/invoices"))
   return {ok:true,json:async()=>settled?[{
    id:invoiceId,status:"Settled",additionalStatus:"None",
    metadata:{orderId:orderRef},
   }]:[{
    id:invoiceId,status:"Processing",additionalStatus:"None",
    metadata:{orderId:orderRef},
   }]};
  if(u.pathname.endsWith("/payouts"))return {ok:true,json:async()=>[]};
  throw Error("Unexpected provider operation");
 }
 return {calls,fetchImpl};
}
const reservation={
 intentId,storeId,orderRef,amountSats,network:"regtest",
 status:"reserved_before_post",
};

async function runInvoiceFixture(){
 const steps=[],provider=fakeProvider();
 const result=await createPreauthorizedRegtestInvoice({
  testOnly:true,network:"regtest",serverUrl:origin,storeId,
  apiKey,orderRef,amountSats,
  reserveDurably:async()=>{steps.push("committed synthetic reservation");return reservation;},
  recordObservation:async proof=>{
   steps.push("synthetic receipt journal");
   assert.deepEqual(proof,{
    intentId,invoiceId,kind:"invoice_seen_by_readback",network:"regtest",
   });
   return "recorded_without_checkout_authorization";
  },
  fetchImpl:async(url,options)=>{
   steps.push(options.method);
   return provider.fetchImpl(url,options);
  },
 });
 return {result,steps};
}
function fixturePayout(ratios=[9000,1000],changes={}){
 const fee=assessSyntheticPrismFeeBudget({
  testOnly:true,network:"regtest",invoiceSats:amountSats,
  recipientBasisPoints:ratios,reserveBasisPoints:200,
  estimatedMaxNetworkFeeSats:15000n,
  feeSafetyMarginSats:15000n,minimumRecipientSats:50000n,
 });
 const expected=fee.expected;
 const claims=expected.map(({role,expectedSats})=>({
  id:role+"_claim_160",metadata:{Source:"Prism ("+role+")"},
  payoutMethodId:"BTC-CHAIN",state:"Completed",
  payoutAmount:toBtc(expectedSats),
 }));
 const receipts=Object.fromEntries(expected.map(x=>[x.role,{
  confirmedSats:x.expectedSats,confirmations:2,
 }]));
 return {
  fee,
  claims:changes.claims??claims,
  receipts:changes.receipts??receipts,
 };
}
function drainEvidence(payout){
 const inventory={
  readOnly:true,inventoryComplete:true,network:"regtest",storeId,
  invoices:[{id:invoiceId,status:"Settled",additionalStatus:"None",
    metadata:{orderId:orderRef}}],
  payouts:payout.claims.map((x,i)=>({
   id:x.id,state:x.state,payoutMethodId:x.payoutMethodId,
   payoutAmount:x.payoutAmount,
   destination:i===0?"synthetic_supplier_destination":"synthetic_platform_destination",
  })),
 };
 const ledgerInvoices=[{
  invoiceId,orderRef,
  independentFinality:{claimsConfirmed:true,walletReceiptsConfirmed:true},
 }];
 const expectedClaims=payout.fee.expected.map((x,i)=>({
  invoiceId,payoutId:payout.claims[i].id,
  recipientId:x.role,
  destination:i===0?"synthetic_supplier_destination":"synthetic_platform_destination",
  expectedSats:x.expectedSats,
  walletConfirmedSats:payout.receipts[x.role]?.confirmedSats,
  walletConfirmations:payout.receipts[x.role]?.confirmations,
 }));
 return {inventory,ledgerInvoices,expectedClaims};
}
function reconcileFull(payout,overrides={}){
 const evidence=drainEvidence(payout);
 return assessRegtestProviderDrain({
  testOnly:true,network:"regtest",storeId,...evidence,...overrides,
 });
}

test("synthetic end-to-end: reserved invoice, signed callback, admin 90/10, independent payouts, no checkout release",async()=>{
 const invoice=await runInvoiceFixture();
 assert.deepEqual(invoice.steps,[
  "committed synthetic reservation","POST","GET","synthetic receipt journal",
 ]);
 assert.equal(invoice.result.status,"observed_regtest_invoice_no_checkout");
 assert.equal(invoice.result.providerPostAttempts,1);
 assert.equal(invoice.result.checkoutReleaseAllowed,false);
 assert.equal(invoice.result.automaticallyRetry,false);
 const beforeWebhook=new Set();
 const raw=JSON.stringify({
  type:"InvoiceSettled",storeId,invoiceId,orderRef,deliveryId:"delivery_160",
 });
 const verified=checkedSignedEvent(raw,sign(raw));
 assert.equal(verified.invoiceId,invoiceId);
 assert.equal(beforeWebhook.has(verified.deliveryId),false);
 beforeWebhook.add(verified.deliveryId);
 assert.equal(beforeWebhook.has(verified.deliveryId),true);
 assert.equal(checkedSignedEvent(raw,sign(raw+"tamper")),null);
 assert.equal(checkedSignedEvent(raw.replace("InvoiceSettled","InvoiceInvalid"),sign(raw)),null);
 const payout=fixturePayout();
 assert.equal(payout.fee.status,"test_budget_eligible");
 assert.deepEqual(payout.fee.expected.map(x=>x.expectedSats),[8820000n,980000n]);
 const chain=reconcileSyntheticPrismPayout({
  testOnly:true,network:"regtest",expected:payout.fee.expected,
  claims:payout.claims,walletReceipts:payout.receipts,
 });
 assert.equal(chain.status,"verified_complete");
 assert.equal(chain.automaticRetryAllowed,false);
 assert.equal(chain.allowsOrderFulfillment,false);
 const drain=reconcileFull(payout);
 assert.equal(drain.status,"eligible_for_operator_review_only");
 assert.deepEqual(drain.reasons,[]);
 assert.equal(drain.activationAllowed,false);
 assert.equal(drain.automaticPayoutAllowed,false);
 assert.equal(drain.productionReady,false);
});

test("admin-configurable 85/15 split is version-sensitive, not hardcoded 90/10",()=>{
 const first=fixturePayout([9000,1000]);
 const second=fixturePayout([8500,1500]);
 assert.deepEqual(second.fee.expected.map(x=>x.expectedSats),[8330000n,1470000n]);
 assert.notDeepEqual(second.fee.expected,first.fee.expected);
 assert.equal(reconcileFull(second).status,"eligible_for_operator_review_only");
 assert.equal(reconcileFull(first,{
  expectedClaims:drainEvidence(second).expectedClaims,
 }).status,"blocked");
 assert.ok(reconcileFull(first,{
  expectedClaims:drainEvidence(second).expectedClaims,
 }).reasons.includes("PAYOUT_AMOUNT_OR_DESTINATION_MISMATCH"));
});

test("fake/duplicate settlement callback cannot create a second payment transition",()=>{
 const raw=JSON.stringify({
  type:"InvoiceSettled",storeId,invoiceId,orderRef,deliveryId:"same_delivery",
 });
 const seen=new Set();
 let transitions=0;
 function accept(payload,signature){
  const event=checkedSignedEvent(payload,signature);
  if(!event||seen.has(event.deliveryId))return false;
  seen.add(event.deliveryId);transitions++;return true;
 }
 assert.equal(accept(raw,sign(raw)),true);
 assert.equal(accept(raw,sign(raw)),false);
 assert.equal(accept(raw.replace("invoice_160","invoice_999"),sign(raw)),false);
 assert.equal(accept(raw,"sha256="+"0".repeat(64)),false);
 assert.equal(transitions,1);
});

test("unknown POST outcome or incomplete wallet receipts forces operator hold, never automatic resend",async()=>{
 let posts=0;
 const unknown=await createPreauthorizedRegtestInvoice({
  testOnly:true,network:"regtest",serverUrl:origin,storeId,
  apiKey,orderRef,amountSats,
  reserveDurably:async()=>reservation,
  recordObservation:async x=>{
   assert.equal(x.kind,"post_outcome_unknown");
   return "recorded_without_checkout_authorization";
  },
  fetchImpl:async()=>{posts++;throw Error("simulated unknown provider outcome");},
 });
 assert.equal(posts,1);
 assert.equal(unknown.status,"operator_reconciliation_required");
 assert.equal(unknown.invoiceId,null);
 assert.equal(unknown.automaticallyRetry,false);
 const payout=fixturePayout();
 payout.receipts.platform={confirmedSats:0n,confirmations:0};
 const chain=reconcileSyntheticPrismPayout({
  testOnly:true,network:"regtest",expected:payout.fee.expected,
  claims:payout.claims,walletReceipts:payout.receipts,
 });
 assert.equal(chain.status,"manual_review");
 const drain=reconcileFull(payout);
 assert.equal(drain.status,"blocked");
 assert.equal(drain.automaticPayoutAllowed,false);
 const unknownClaim={id:"unexpected",metadata:{Source:"unrecognized"},
  payoutMethodId:"BTC-CHAIN",payoutAmount:"0.00010000",state:"Completed"};
 const complete=fixturePayout();
 const withExtra=reconcileSyntheticPrismPayout({
  testOnly:true,network:"regtest",expected:complete.fee.expected,
  claims:[...complete.claims,unknownClaim],walletReceipts:complete.receipts,
 });
 assert.equal(withExtra.status,"manual_review");
});

test("scenario is strictly synthetic; no live routes, actual wallets, or production checkout modifications",()=>{
 for(const name of [
  "src/lib/payments/prism-payout-reliability.mjs",
  "src/lib/payments/btcpay-provider-drain.mjs",
  "src/lib/payments/btcpay-regtest-prepost-fence.mjs",
 ]){
  const source=readFileSync(name,"utf8");
  assert.match(source,/regtest/);
 }
 const checkout=readFileSync("src/app/checkout/page.tsx","utf8");
 assert.doesNotMatch(checkout,/btcpay-regtest-prepost-fence|prism-payout-reliability|btcpay-provider-drain/);
});
