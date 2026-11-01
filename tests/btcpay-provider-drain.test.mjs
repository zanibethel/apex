import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  readRegtestGreenfieldInventory, assessRegtestProviderDrain,
  assessRegtestSyncRecovery,
} from "../src/lib/payments/btcpay-provider-drain.mjs";

const base = Object.freeze({
  testOnly: true, network: "regtest",
  serverUrl: "http://127.0.0.1:43210/",
  storeId: "store_regtest_1",
  apiKey: "synthetic_regtest_token_only",
});
const invoice = (id="inv-1", orderId="order-1", extra={}) => ({
  id, status: "Settled", additionalStatus: "None",
  metadata: {orderId}, ...extra,
});
const payout = (id, destination, amount) => ({
  id, state: "Completed", payoutMethodId: "BTC-CHAIN",
  destination, payoutAmount: amount,
});
const ledgerInvoice = () => ({
  invoiceId:"inv-1",orderRef:"order-1",
  independentFinality:{claimsConfirmed:true,walletReceiptsConfirmed:true},
});
const claims = () => [
  {invoiceId:"inv-1",payoutId:"supplier-payout",recipientId:"supplier",
   destination:"regtest_supplier_wallet",expectedSats:1000n,
   walletConfirmedSats:1000n,walletConfirmations:2},
  {invoiceId:"inv-1",payoutId:"platform-payout",recipientId:"platform",
   destination:"regtest_platform_wallet",expectedSats:2000n,
   walletConfirmedSats:2000n,walletConfirmations:2},
];
const inventory = () => ({
  readOnly:true,inventoryComplete:true,network:"regtest",
  storeId:"store_regtest_1",
  invoices:[invoice()],payouts:[
    payout("supplier-payout","regtest_supplier_wallet","0.00001000"),
    payout("platform-payout","regtest_platform_wallet","0.00002000"),
  ],
});
const check = (overrides={}) => assessRegtestProviderDrain({
  testOnly:true,network:"regtest",storeId:"store_regtest_1",
  inventory:inventory(),ledgerInvoices:[ledgerInvoice()],
  expectedClaims:claims(),...overrides,
});

test("Greenfield inventory is GET only and exhausts invoice pages", async () => {
  const calls=[];
  const fetched=await readRegtestGreenfieldInventory({
    ...base,pageSize:2,maxPages:3,
    fetchImpl:async (url,options)=>{
      calls.push({url,options});
      const path=new URL(url);
      let data;
      if (path.pathname.endsWith("/invoices")) {
        data=path.searchParams.get("skip")==="0"
          ? [invoice("inv-1","order-1"),invoice("inv-2","order-2")]
          : [invoice("inv-3","order-3")];
      } else {
        data=[payout("claim-1","regtest-wallet","0.00001000")];
      }
      return {ok:true,json:async()=>data};
    },
  });
  assert.equal(fetched.inventoryComplete,true);
  assert.equal(fetched.readOnly,true);
  assert.equal(fetched.invoices.length,3);
  assert.equal(fetched.payouts.length,1);
  assert.equal(calls.length,3);
  assert.ok(calls.every(c=>c.options.method==="GET"));
  assert.ok(calls.every(c=>c.options.redirect==="error"));
  assert.ok(calls.every(c=>c.options.cache==="no-store"));
  assert.ok(calls.every(c=>c.options.headers.Authorization==="token "+base.apiKey));
  assert.deepEqual(calls.map(x=>new URL(x.url).search),[
    "?take=2&skip=0","?take=2&skip=2","?includeCancelled=true",
  ]);
});

test("incomplete pagination, failed API, invalid shape and oversized page fail closed", async()=>{
  for(const scenario of [
    async()=>({ok:true,json:async()=>[invoice(),invoice()]}),
    async()=>({ok:false,status:401,text:async()=>"SECRET_PROVIDER_ERROR"}),
    async()=>({ok:true,json:async()=>({items:[]})}),
    async()=>{throw Error("TOKEN_PRIVATE_DO_NOT_LEAK");},
  ]) {
    await assert.rejects(readRegtestGreenfieldInventory({
      ...base,pageSize:2,maxPages:2,fetchImpl:scenario,
    }),e=>!e.message.includes("SECRET_")&&!e.message.includes("TOKEN_PRIVATE"));
  }
  await assert.rejects(readRegtestGreenfieldInventory({
    ...base,pageSize:2,maxPages:2,fetchImpl:async()=>({
      ok:true,json:async()=>[invoice(),invoice(),invoice()],
    }),
  }),/overflow/);
});

test("no external hosts, mainnet or disabled test modes can be probed",async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return {ok:true,json:async()=>[]};};
  for(const change of [
    {testOnly:false},{network:"mainnet"},{network:"testnet"},
    {serverUrl:"https://payments.example.org/"},
    {serverUrl:"http://10.0.0.1:1234/"},
    {serverUrl:"http://user:pass@127.0.0.1:5432/"},
    {serverUrl:"http://127.0.0.1:5432/sensitive"},
    {serverUrl:"javascript:alert(1)"},
    {storeId:"../../other-store"},
    {apiKey:"short"},
  ]) {
    await assert.rejects(readRegtestGreenfieldInventory({
      ...base,...change,fetchImpl,
    }));
  }
  assert.equal(calls,0);
});

test("fully matched two-recipient settled regtest is only eligible for operator review",()=>{
  const out=check();
  assert.equal(out.status,"eligible_for_operator_review_only");
  assert.deepEqual(out.reasons,[]);
  assert.equal(out.eligibleForManualSyncReview,true);
  assert.equal(out.activationAllowed,false);
  assert.equal(out.automaticPayoutAllowed,false);
  assert.equal(out.productionReady,false);
});

test("unknown and missing invoices, duplicate IDs, invalid and partial statuses block",()=>{
  const scenarios=[
    {invoices:[invoice(),invoice("external-invoice","external-order")],
      reason:"UNKNOWN_PROVIDER_INVOICE"},
    {invoices:[],reason:"MISSING_PROVIDER_INVOICE"},
    {invoices:[invoice(),invoice()],reason:"DUPLICATE_PROVIDER_INVOICE"},
    {invoices:[invoice("inv-1","other-order")],reason:"ORDER_REFERENCE_MISMATCH"},
    {invoices:[invoice("inv-1","order-1",{status:"Processing"})],
      reason:"OUTSTANDING_OR_EXCEPTION_INVOICE"},
    {invoices:[invoice("inv-1","order-1",{status:"Settled",additionalStatus:"PaidPartial"})],
      reason:"OUTSTANDING_OR_EXCEPTION_INVOICE"},
    {invoices:[invoice("inv-1","order-1",{additionalStatus:undefined})],
      reason:"MALFORMED_PROVIDER_INVOICE"},
  ];
  for(const s of scenarios){
    const observed=inventory();observed.invoices=s.invoices;
    const out=check({inventory:observed});
    assert.equal(out.status,"blocked",s.reason);
    assert.ok(out.reasons.includes(s.reason),out.reasons.join(","));
    assert.equal(out.activationAllowed,false);
  }
});

test("provider claim states, unknown payouts, wrong amounts and destinations block",()=>{
  const scenarios=[
    {payouts:[payout("supplier-payout","regtest_supplier_wallet","0.00001000")],
      reason:"MISSING_PROVIDER_PAYOUT"},
    {payouts:[...inventory().payouts,payout("mystery","outside","0.00001000")],
      reason:"UNKNOWN_PROVIDER_PAYOUT"},
    {payouts:inventory().payouts.map((p,i)=>i===0?{...p,state:"AwaitingPayment"}:p),
      reason:"OUTSTANDING_PROVIDER_PAYOUT"},
    {payouts:inventory().payouts.map((p,i)=>i===0?{...p,payoutAmount:"0.00001001"}:p),
      reason:"PAYOUT_AMOUNT_OR_DESTINATION_MISMATCH"},
    {payouts:inventory().payouts.map((p,i)=>i===0?{...p,destination:"attacker"}:p),
      reason:"PAYOUT_AMOUNT_OR_DESTINATION_MISMATCH"},
    {payouts:[...inventory().payouts,inventory().payouts[0]],
      reason:"DUPLICATE_PROVIDER_PAYOUT"},
  ];
  for (const s of scenarios){
    const observed=inventory();observed.payouts=s.payouts;
    const out=check({inventory:observed});
    assert.equal(out.status,"blocked",s.reason);
    assert.ok(out.reasons.includes(s.reason),out.reasons.join(","));
  }
});

test("independent wallet proof, claim cardinality and provider completeness are mandatory",()=>{
  const badClaims=claims();badClaims[0].walletConfirmations=0;
  assert.ok(check({expectedClaims:badClaims}).reasons.includes(
    "MISSING_OR_INVALID_INDEPENDENT_WALLET_RECEIPT"));
  const badProof=ledgerInvoice();badProof.independentFinality.walletReceiptsConfirmed=false;
  assert.ok(check({ledgerInvoices:[badProof]}).reasons.includes(
    "MISSING_INDEPENDENT_FINALITY"));
  assert.ok(check({expectedClaims:[claims()[0]]}).reasons.includes(
    "MISSING_TWO_RECIPIENT_CLAIMS"));
  const noPage=inventory();noPage.inventoryComplete=false;
  assert.deepEqual(check({inventory:noPage}).reasons,
    ["INCOMPLETE_PROVIDER_OR_LEDGER_EVIDENCE"]);
  assert.throws(()=>check({network:"mainnet"}),/regtest-only/);
});

test("interrupted or uncertain external split update always retains checkout hold",()=>{
  for (const phase of [
    "before_external_change","external_change_unknown",
    "external_change_failed","external_change_reported_success",
  ]) {
    const held=assessRegtestSyncRecovery({
      testOnly:true,network:"regtest",phase,holdPresent:true,
    });
    assert.equal(held.checkoutReleaseAllowed,false);
    assert.equal(held.prismConfigurationWriteAllowed,false);
    assert.equal(held.automaticPayoutAllowed,false);
    assert.equal(held.status,"hold_requires_manual_reconciliation");
    const missing=assessRegtestSyncRecovery({
      testOnly:true,network:"regtest",phase,holdPresent:false,
    });
    assert.equal(missing.nextAction,"disable_checkout_and_escalate");
    assert.equal(missing.checkoutReleaseAllowed,false);
  }
  assert.throws(()=>assessRegtestSyncRecovery({
    testOnly:true,network:"mainnet",phase:"external_change_unknown",
  }));
});

test("provider-side inventory is not wired into checkout or production admin sync",()=>{
  const source=readFileSync("src/lib/payments/btcpay-provider-drain.mjs","utf8");
  assert.doesNotMatch(source,/method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/);
  assert.doesNotMatch(readFileSync("src/app/page.tsx","utf8"),
    /btcpay-provider-drain/);
  assert.doesNotMatch(readFileSync("src/app/supplier/operations/actions.ts","utf8"),
    /btcpay-provider-drain/);
});
