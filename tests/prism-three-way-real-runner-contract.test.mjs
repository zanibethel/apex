import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {payoutSettings} from "../scripts/btcpay-ephemeral-prism-forwarding.mjs";

const source=readFileSync("scripts/btcpay-ephemeral-prism-forwarding.mjs","utf8");
const workflow=readFileSync(".github/workflows/btcpay-upstream-regtest.yml","utf8");
const addresses={
 apex:"bcrt1q"+"q".repeat(38),
 lily:"bcrt1q"+"p".repeat(38),
 tierra:"bcrt1q"+"z".repeat(38),
};

test("three-wallet fixture is one BTCPay store with platform 10 / Lily 45 / Tierra 45",()=>{
 const {settings,threeWayExpected,threeWayEntitlement}=payoutSettings({
  version:3,apex:1000,lily:4500,tierra:4500,
 },addresses);
 assert.equal(Object.keys(settings.Destinations).length,3);
 assert.deepEqual(settings.Splits,[{Source:"*CHAIN",Destinations:[
  {Destination:"apex",Percentage:10},
  {Destination:"lily",Percentage:45},
  {Destination:"tierra",Percentage:45},
 ]}]);
 assert.deepEqual(threeWayExpected.map(x=>x.expectedSats),
  [980000n,4410000n,4410000n]);
 assert.equal(threeWayEntitlement.ruleVersion,3);
 assert.equal(threeWayEntitlement.productionReady,false);
});

test("no unauthorized three-way role, wallet, network or percentage change",()=>{
 for(const arg of [
  {apex:1200,lily:4400,tierra:4400,version:3},
  {apex:1000,lily:5000,tierra:4000,version:3},
 ])assert.throws(()=>payoutSettings(arg,addresses));
 assert.throws(()=>payoutSettings({version:3,apex:1000,lily:4500,tierra:4500},
  {...addresses,apex:"bc1q"+"q".repeat(38)}));
});

test("real runner requires 3 Prism claims and exactly 3 independently confirmed on-chain wallet receipts",()=>{
 assert.match(source,/waitForThreeWayPayouts\(basic,p,minerAddress\)/);
 assert.match(source,/const tw=ratio\.version===3/);
 assert.match(source,/createWallet\(tw\)/);
 assert.match(source,/payoutsCreated:3,pluginGenerated:true,productionReady:false/);
 assert.match(source,/result\.payouts\.length!==\(p\.ratio\.version===3\?3:2\)/);
 assert.match(source,/receipts\[2\]\?\.payoutsCreated!==3/);
 assert.match(source,/reconcileThreeWayPrismRegtest\(/);
 assert.match(source,/getreceivedbyaddress/);
 assert.match(source,/Prism \(\"\+role\+\"\)/);
 assert.match(source,/confirmed\[role\]===observed\[role\]/);
 assert.match(source,/productionReady:false/);
});

test("only disposable regtest runner can exercise Prism; no secrets, mainnet or live routes",()=>{
 assert.match(workflow,/APEX_BTCPAY_TEST_NETWORK: regtest/);
 assert.match(workflow,/APEX_BTCPAY_PRISM_FORWARDING: "true"/);
 assert.match(workflow,/docker compose down --volumes --remove-orphans/);
 assert.doesNotMatch(workflow,/\$\{\{\s*secrets[.[]/);
 assert.match(source,/CI!=="true"/);
 assert.match(source,/APEX_BTCPAY_TEST_NETWORK!=="regtest"/);
 for(const path of ["src/app/page.tsx","src/app/supplier/orders/page.tsx"]){
  assert.doesNotMatch(readFileSync(path,"utf8"),/prism-three-way-regtest|btcpay-ephemeral-prism-forwarding/);
 }
});
