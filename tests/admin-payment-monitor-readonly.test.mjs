import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {summarizeAdminPaymentMonitor,recordedTransferLabel,recordedRuleLabel}
 from "../src/lib/payments/admin-payment-monitor.mjs";

const read=path=>readFileSync(path,"utf8");

test("recorded payment statuses never imply actual BTC settlement or payment permission",()=>{
 const view=summarizeAdminPaymentMonitor({
  rules:[{status:"draft"},{status:"active"},{status:"alien"}],
  transfers:[{state:"confirmed"},{state:"failed"},{state:"reversed"},
   {state:"pending"},{state:"unknown"}],
  snapshots:[{id:"sample"}],
 });
 assert.equal(view.rules.available,true);
 assert.equal(view.rules.shown,3);
 assert.equal(view.rules.states.draft,1);
 assert.equal(view.rules.unrecognized,1);
 assert.equal(view.transfers.shown,5);
 assert.equal(view.transfers.states.confirmed,1);
 assert.equal(view.transfers.states.failed,1);
 assert.equal(view.transfers.states.reversed,1);
 assert.equal(view.transfers.unrecognized,1);
 assert.equal(view.snapshots.shown,1);
 for(const k of ["providerSettlementVerified","providerFeedConnected",
  "canReleaseCheckout","canCreateInvoice","canApproveRecovery","canSubmitPayout"])
  assert.equal(view[k],false,k);
 assert.ok(Object.isFrozen(view));
 assert.ok(Object.isFrozen(view.transfers.states));
 assert.match(recordedTransferLabel("confirmed"),/not on-chain verified/);
 assert.match(recordedTransferLabel("unknown"),/review required/);
 assert.match(recordedRuleLabel("active"),/^Recorded active$/);
});
test("unavailable reporting never becomes false zero or an all-clear",()=>{
 const absent=summarizeAdminPaymentMonitor();
 assert.equal(absent.rules.available,false);
 assert.equal(absent.rules.shown,null);
 assert.equal(absent.transfers.shown,null);
 assert.equal(absent.snapshots.shown,null);
 assert.equal(absent.providerSettlementVerified,false);
 const empty=summarizeAdminPaymentMonitor({rules:[],transfers:[],snapshots:[]});
 assert.equal(empty.rules.available,true);
 assert.equal(empty.transfers.shown,0);
 assert.equal(empty.snapshots.shown,0);
});
test("admin payment monitor uses only session-bound server RLS and read-only tables",()=>{
 const page=read("src/app/admin/payment-monitor/page.tsx");
 const index=read("src/app/admin/page.tsx");
 assert.match(page,/createSupplierServerClient\(\)/);
 assert.match(page,/auth\.getUser\(\)/);
 assert.match(page,/isVerifiedPlatformAdmin\(identity\.user\)/);
 assert.match(page,/redirect\("\/admin\/sign-in"\)/);
 assert.match(page,/robots:\{index:false,follow:false\}/);
 for(const t of ["payout_rules","payout_transfer_records","payment_allocation_snapshots","stores"])
  assert.ok(page.includes('from("'+t+'")'),t);
 assert.match(page,/limit\(LIMIT\)/);
 assert.match(page,/summary\.transfers\.available/);
 assert.match(page,/summary\.rules\.available/);
 assert.match(page,/Live BTCPay \/ Prism evidence feed/);
 assert.match(page,/not independent/);
 assert.match(index,/href: "\/admin\/payment-monitor"/);
 assert.doesNotMatch(page,/\.insert\(|\.update\(|\.delete\(|\.upsert\(|\.rpc\(|service_role|SUPABASE_SECRET|NEXT_PUBLIC_|process\.env\..*KEY|fetch\(|createInvoice\(|createPayout\(/);
 assert.doesNotMatch(page,/api\/v1|btcpay_test_|btcpay-ephemeral|wallet\/generate|webhook|cookieStore\.get/);
});
