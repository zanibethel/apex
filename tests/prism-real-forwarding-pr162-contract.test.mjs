import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {payoutSettings} from "../scripts/btcpay-ephemeral-prism-forwarding.mjs";
import {reconcileSyntheticPrismPayout} from "../src/lib/payments/prism-payout-reliability.mjs";
const read=p=>readFileSync(p,"utf8");
const workflow=read(".github/workflows/btcpay-upstream-regtest.yml");
const engine=read("scripts/btcpay-ephemeral-prism-forwarding.mjs");
const entry=read("scripts/btcpay-ephemeral-greenfield.mjs");

test("real integration runner pins official Prism plugin and uses no production credentials",()=>{
 assert.match(workflow,/sha256sum --check --status/);
 assert.match(workflow,/851f1c629ed40c398f9e0f383f2e6ca5b17f8572b9a158bd109625139d95e681/);
 assert.match(workflow,/APEX_BTCPAY_PRISM_FORWARDING: "true"/);
 assert.match(workflow,/APEX_BTCPAY_TEST_NETWORK: regtest/);
 assert.match(workflow,/BTCPAY_PLUGINDIR: \$\{\{ runner.temp \}\}\/apex-prism-plugins/);
 assert.match(workflow,/docker compose down --volumes --remove-orphans/);
 assert.doesNotMatch(workflow,/\$\{\{\s*secrets[.[]/);
 assert.match(entry,/afterSettlement:async context=>/);
 assert.match(entry,/prismForwarding\\?await prismForwarding\\(context\\)/);
 assert.match(entry,/trustedWorker\\?await trustedWorker\\(context\\)/);
 assert.match(entry,/prismVerified:Boolean\(finalProof\?\.prismForwardingVerified\)/);
 assert.match(entry,/productionReady:false/);
});

test("two administrator-selected test split versions send real Prism claims to independent wallet proofs",()=>{
 const addresses={
  supplier:"bcrt1q"+"q".repeat(38),platform:"bcrt1q"+"p".repeat(38),
 };
 for(const [bps,version,supplier,platform] of [
  [9000,1,8820000n,980000n],[8500,2,8330000n,1470000n],
 ]){
  const {settings,frozen}=payoutSettings({supplier:bps,version},addresses);
  assert.equal(frozen.rule.version,version);
  assert.equal(settings.Reserve,2);
  assert.deepEqual(settings.Splits[0].Destinations.map(x=>x.Percentage),
   [bps/100,(10000-bps)/100]);
  const expected=10_000_000n*98n/100n;
  assert.equal(expected*BigInt(bps)/10000n,supplier);
  assert.equal(expected*BigInt(10000-bps)/10000n,platform);
 }
 assert.match(engine,/prism-wallet-receipts-confirmed/);
 assert.match(engine,/both-prism-payout-claims-completed/);
 assert.match(engine,/both-prism-payout-ratios-confirmed/);
 assert.ok(engine.includes('finalStatus?.status!=="verified_complete"'));
 assert.match(engine,/productionReady:false/);
});

test("unknown third payout is always manual review even with two completed claims and wallet receipts",()=>{
 const expected=[
  {role:"supplier",expectedSats:8820000n},
  {role:"platform",expectedSats:980000n},
 ];
 const claims=expected.map((x,i)=>({
  id:"claim_"+i,payoutMethodId:"BTC-CHAIN",state:"Completed",
  metadata:{Source:"Prism ("+x.role+")"},
  payoutAmount:i===0?"0.08820000":"0.00980000",
 }));
 const receipt={supplier:{confirmedSats:8820000n,confirmations:2},
  platform:{confirmedSats:980000n,confirmations:2}};
 const valid=reconcileSyntheticPrismPayout({
  testOnly:true,network:"regtest",expected,claims,walletReceipts:receipt,
 });
 assert.equal(valid.status,"verified_complete");
 const unexpected=reconcileSyntheticPrismPayout({
  testOnly:true,network:"regtest",expected,
  claims:[...claims,{...claims[0],id:"surprise",metadata:{Source:"Manual (unknown)"}}],
  walletReceipts:receipt,
 });
 assert.equal(unexpected.status,"manual_review");
 assert.equal(unexpected.automaticRetryAllowed,false);
});

test("Prism execution remains CI-only and no customer checkout or public payouts are enabled",()=>{
 assert.match(engine,/CI!=="true"/);
 assert.match(engine,/APEX_BTCPAY_TEST_NETWORK!=="regtest"/);
 assert.match(engine,/no verified admin API|cookie-only Prism UI/i);
 assert.match(engine,/manual|review|pending/i);
 for(const path of ["src/app/page.tsx","src/app/catalog/page.tsx",
   "src/app/supplier/operations/actions.ts"]){
  assert.doesNotMatch(read(path),/btcpay-ephemeral-prism-forwarding|install_prism_regtest/);
 }
});
