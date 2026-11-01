/**
 * Disposable integration only: real Prism v1.3.3-created payouts on Bitcoin regtest.
 * BTCPay's cookie-only Prism UI has no verified admin API, so we insert frozen
 * synthetic settings into its THROWAWAY PostgreSQL instance and restart it.
 * This is NOT an Apex production integration or admin rule activation path.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { openSync, closeSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { snapshotSyntheticAdminSplit } from "../src/lib/payments/synthetic-payout-rule-snapshot.mjs";

const STORE_SCOPE="90000000-0000-4000-8000-000000000001";
const SUPPLIER="80000000-0000-4000-8000-000000000001";
const PLATFORM="80000000-0000-4000-8000-000000000002";
const ratios=[{supplier:9000,version:1},{supplier:8500,version:2}];
// Wider fee headroom while preserving Prism\'s actual 2% reserve. A separate
// negative test will cover small invoices and minimum-fee policy.
const TEST_INVOICE_SATS=10_000_000n;
const origin="http://127.0.0.1:14142";
const id=/^[a-zA-Z0-9_-]{1,100}$/;
const sha=/^[a-f0-9]{64}$/i;
const COMPOSE="BTCPayServer.Tests/docker-compose.yml";
const MAX_FORWARDED_TEST_MS=14*60*1000;
const beginning=Date.now();
function progress(stage,details="") {
  // Only static phase names and numeric counts, never addresses or credentials.
  process.stderr.write("[prism-regtest] "+stage+(details?" "+details:"")+"\n");
}
function bounded(stage) {
  if(Date.now()-beginning>MAX_FORWARDED_TEST_MS)
    throw Error("Prism regtest exceeded bounded runtime at "+stage);
}

function btc(v) {
  assert.equal(typeof v,"bigint");
  return (v/100000000n)+"."+(v%100000000n).toString().padStart(8,"0");
}
function sats(v) {
  const value=String(v);
  if(!/^(0|[1-9]\d{0,7})(?:\.\d{1,8})?$/.test(value))
    throw Error("Invalid regtest Bitcoin decimal");
  const [a,b=""]=value.split(".");
  return BigInt(a)*100000000n+BigInt(b.padEnd(8,"0"));
}
function assertIsolation() {
  if(process.env.CI!=="true"||
     process.env.APEX_BTCPAY_EPHEMERAL!=="true"||
     process.env.APEX_BTCPAY_TEST_NETWORK!=="regtest"||
     !process.env.RUNNER_TEMP?.startsWith("/home/runner/work/_temp")||
     !process.env.APEX_BTCPAY_UPSTREAM_ROOT?.startsWith(
        process.env.RUNNER_TEMP+"/btcpayserver"))
    throw Error("STOP: Prism funding requires disposable GitHub Bitcoin regtest");
  if(process.env.BTCPAY_PLUGINDIR!==process.env.RUNNER_TEMP+"/apex-prism-plugins")
    throw Error("STOP: this plugin is not in the disposable CI directory");
}
function invoke(bin,args,options={}) {
  try{
    return execFileSync(bin,args,{
      cwd:process.env.APEX_BTCPAY_UPSTREAM_ROOT,
      encoding:"utf8",timeout:45000,maxBuffer:1024*1024,
      stdio:["ignore","pipe","pipe"],...options,
    }).trim();
  }catch{
    // Never log sensitive bitcoin-cli, BTCPay SQL or server process output.
    throw Error("Disposable regtest subprocess failed");
  }
}
function rpc(...args) {
  const text=invoke("docker",["compose","-f",COMPOSE,"exec","-T",
    "bitcoind","bitcoin-cli","-datadir=/data","-regtest",...args.map(String)]);
  try{return JSON.parse(text);}catch{return text;}
}
function wallet(name,method,...args) {
  return rpc("-rpcwallet="+name,method,...args);
}
function createWallet(name) {
  if(!id.test(name))throw Error("Unsafe synthetic wallet ID");
  const loaded=rpc("listwallets");
  if(loaded.includes(name))return;
  const known=rpc("listwalletdir").wallets.some(w=>w.name===name);
  rpc(known?"loadwallet":"createwallet",name);
}
async function api(path,{method="GET",auth,json}={}) {
  if(!path.startsWith("/api/v1/")||path.includes("..")||
     !auth?.startsWith("Basic "))throw Error("Only local synthetic Greenfield API");
  let r;
  try{
    r=await fetch(origin+path,{
      method,headers:{Accept:"application/json",Authorization:auth,
        ...(json!==undefined?{"Content-Type":"application/json"}:{})},
      ...(json!==undefined?{body:JSON.stringify(json)}:{}),
      redirect:"error",signal:AbortSignal.timeout(14000),
    });
  }catch{throw Error("Local Prism Greenfield transport failed");}
  if(!r.ok)throw Error("Disposable Greenfield request failed: "+method+" "+
    path.replace(/[a-z0-9_-]{26,}/ig,"<id>")+" HTTP "+r.status);
  return r.json();
}
export function payoutSettings(ratio,addresses) {
  const rule={status:"approved_test_fixture",scope_type:"storefront",
    scope_id:STORE_SCOPE,version:ratio.version,allocations:[
      {recipient_id:SUPPLIER,basis_points:ratio.supplier},
      {recipient_id:PLATFORM,basis_points:10000-ratio.supplier},
    ]};
  const frozen=snapshotSyntheticAdminSplit({testOnly:true,network:"regtest",
    rule,orderId:"prism-test-"+ratio.version,amountSats:TEST_INVOICE_SATS});
  if(frozen.pending.reduce((a,b)=>a+b.entitlementSats,0n)!==TEST_INVOICE_SATS)
    throw Error("Synthetic order allocation mismatch");
  for(const a of Object.values(addresses))
    if(!/^bcrt1[ac-hj-np-z02-9]{12,100}$/i.test(a))
      throw Error("Non-regtest payment destination rejected");
  const settings={
    Enabled:true,SatThreshold:100,Reserve:2,Version:0,
    DestinationBalance:{},PendingPayouts:{},
    Destinations:{
      supplier:{Destination:addresses.supplier,PayoutMethodId:"BTC-CHAIN"},
      platform:{Destination:addresses.platform,PayoutMethodId:"BTC-CHAIN"},
    },
    Splits:[{Source:"*CHAIN",Destinations:[
      {Destination:"supplier",Percentage:ratio.supplier/100},
      {Destination:"platform",Percentage:(10000-ratio.supplier)/100},
    ]}],
  };
  return {settings,frozen};
}
function persistSettings(store,settings) {
  if(!id.test(store))throw Error("Bad synthetic store ID");
  const path="tests/payout-rls/prism-ephemeral-test-store-setting.sql";
  progress("seed-store-settings");
  const r=invoke("psql",[
    "-X","-q","-At","-h","127.0.0.1","-p","39372","-U","postgres",
    "-d","btcpayserver","-v","ON_ERROR_STOP=1",
    "-v","store_id="+store,"-v","settings_json="+JSON.stringify(settings),
    "-f",join(process.env.GITHUB_WORKSPACE,path),
  ]);
  if(r!=="seeded")throw Error("Prism settings not installed in ephemeral BTCPay DB");
  progress("seed-store-settings-complete");
}
async function restartLocalBTCPay() {
  progress("restart-btcpay-start");
  const pidFile=join(process.env.RUNNER_TEMP,"btcpay-boot.pid");
  const n=Number(readFileSync(pidFile,"utf8").trim());
  if(!Number.isSafeInteger(n)||n<100)throw Error("Untrusted BTCPay test process ID");
  // Kill only processes started by this job. The project launch profile binds localhost.
  try{invoke("pkill",["-TERM","-P",String(n)]);}catch{/* child may have exited */}
  try{process.kill(n,"SIGTERM");}catch{/* already stopped */}
  let oldServerStopped=false;
  for(let i=0;i<30;i++){
    try{await fetch(origin+"/",{signal:AbortSignal.timeout(800),redirect:"manual"});}
    catch{oldServerStopped=true;break;}
    await delay(400);
  }
  if(!oldServerStopped)throw Error("Disposable BTCPay server did not stop cleanly");
  const log=join(process.env.RUNNER_TEMP,"btcpay-prism-restart.log");
  const fd=openSync(log,"w");
  const child=spawn("dotnet",["run","--no-build","--project",
    "BTCPayServer/BTCPayServer.csproj","--launch-profile","Bitcoin"],{
    cwd:process.env.APEX_BTCPAY_UPSTREAM_ROOT,
    env:{...process.env,ASPNETCORE_ENVIRONMENT:"Development",
      BTCPAY_PLUGINDIR:process.env.RUNNER_TEMP+"/apex-prism-plugins",
      BTCPAY_SSRFEXCEPTIONS:"127.0.0.1:48173"},
    detached:true,stdio:["ignore",fd,fd],
  });
  closeSync(fd);
  if(!child.pid)throw Error("BTCPay regtest restart did not spawn");
  writeFileSync(pidFile,String(child.pid)+"\n");
  // A detached BTCPay web server must not keep the test harness alive
  // after the main assertion rejects; GitHub cleanup kills this recorded PID.
  child.unref();
  for(let i=0;i<90;i++){
    try{
      const r=await fetch(origin+"/",{redirect:"manual",
        signal:AbortSignal.timeout(800)});
      if([200,302,303].includes(r.status)){
        progress("restart-btcpay-ready");
        return child.pid;
      }
    }catch{/* startup */}
    await delay(1600);
  }
  throw Error("BTCPay regtest restart failed to become ready");
}
async function storeConfig(basic,ratio,suffix){
  progress("configure-regtest-store",String(ratio.version));
  const store=await api("/api/v1/stores",{
    method:"POST",auth:basic,
    json:{name:"Apex Prism synthetic "+ratio.supplier+" "+suffix},
  });
  if(!id.test(store.id))throw Error("Missing Prism test store");
  const walletResponse=await api("/api/v1/stores/"+store.id+
    "/payment-methods/BTC-CHAIN/wallet/generate",{
    method:"POST",auth:basic,json:{
      label:"DISPOSABLE REGTEST HOT WALLET "+suffix,
      scriptPubKeyType:"Segwit",savePrivateKeys:true,
    },
  });
  if(walletResponse?.paymentMethodId!=="BTC-CHAIN"||
     typeof walletResponse.config?.accountDerivation!=="string")
    throw Error("Hot regtest wallet not configured");
  // Never print/persist mnemonic generated by upstream NBXplorer.
  const processor=await api("/api/v1/stores/"+store.id+
    "/payout-processors/OnChainAutomatedPayoutSenderFactory/BTC-CHAIN",{
    method:"PUT",auth:basic,json:{
      payoutMethodId:"BTC-CHAIN",intervalSeconds:60,feeBlockTarget:1,
      threshold:0,processNewPayoutsInstantly:true,
    },
  });
  if(processor?.payoutMethodId!=="BTC-CHAIN")
    throw Error("Automatic on-chain payout processor was not configured");
  const sw="prism_s_"+ratio.version+"_"+suffix;
  const pw="prism_p_"+ratio.version+"_"+suffix;
  createWallet(sw);createWallet(pw);
  const addresses={
    supplier:wallet(sw,"getnewaddress","","bech32"),
    platform:wallet(pw,"getnewaddress","","bech32"),
  };
  const {settings,frozen}=payoutSettings(ratio,addresses);
  persistSettings(store.id,settings);
  progress("configured-regtest-store",String(ratio.version));
  return {storeId:store.id,sw,pw,addresses,frozen,ratio};
}
async function waitForPayouts(basic,p,minerAddress) {
  progress("await-prism-claims",String(p.ratio.version));
  const path="/api/v1/stores/"+p.storeId+"/payouts";
  let claims=[];
  for(let attempt=0;attempt<48;attempt++){
    bounded("prism-claims");
    claims=await api(path,{auth:basic});
    if(Array.isArray(claims)&&claims.length>=2)break;
    if(attempt%12===0)progress("prism-claims-pending",String(attempt));
    if(attempt%8===7)rpc("generatetoaddress","1",minerAddress);
    await delay(1500);
  }
  if(!Array.isArray(claims)||claims.length!==2)
    throw Error("Prism did not generate exactly two on-chain payout claims");
  progress("prism-payout-claim-states",
    [...new Set(claims.map(x=>String(x.state||"unknown")))].join(","));
  // Only log payout role, state and integer amounts. Never payout IDs,
  // addresses, secrets or raw provider objects.
  function safeClaimStates(list){
    return list.map(c=>{
      const source=String(c.metadata?.Source||"");
      const role=/^Prism \((supplier|platform)\)$/.exec(source)?.[1]||"unknown";
      let amount="unavailable";
      try{amount=sats(c.payoutAmount).toString();}catch{/* no amount */}
      return {role,state:String(c.state||"unknown"),amountSats:amount};
    });
  }
  progress("prism-payout-claim-snapshot",JSON.stringify(safeClaimStates(claims)));
  progress("prism-claims-created",String(claims.length));
  // Only count payouts whose metadata explicitly identifies source Prism.
  if(!claims.every(x=>JSON.stringify(x.metadata||{}).includes("Prism")&&
      x.payoutMethodId==="BTC-CHAIN"))
    throw Error("Payout claims are not both explicitly Prism-generated on chain");
  progress("await-recipient-wallet-receipts",String(p.ratio.version));
  let supplierSats=0n,platformSats=0n;
  for(let attempt=0;attempt<60;attempt++){
    bounded("prism-wallet-receipts");
    const supplier=wallet(p.sw,"getreceivedbyaddress",p.addresses.supplier,"0");
    const platform=wallet(p.pw,"getreceivedbyaddress",p.addresses.platform,"0");
    supplierSats=sats(supplier);platformSats=sats(platform);
    if(supplierSats>0n&&platformSats>0n)break;
    if(attempt%12===0) {
      const latest=await api(path,{auth:basic});
      const states=Array.isArray(latest)
        ?[...new Set(latest.map(x=>String(x.state||"unknown")))].join(",")
        :"unavailable";
      progress("prism-wallet-receipts-pending",
        String(attempt)+" payoutStates="+states+
        " receivedSats="+supplierSats+"/"+platformSats);
      if(Array.isArray(latest)&&attempt%24===0)
        progress("prism-payout-claim-snapshot",
          JSON.stringify(safeClaimStates(latest)));
    }
    if(attempt%6===5)rpc("generatetoaddress","1",minerAddress);
    await delay(2000);
  }
  if(supplierSats===0n||platformSats===0n) {
    // Collect ONLY fixed-word log-match counts, never raw diagnostics, addresses,
    // wallet material or provider responses.
    let diagnostics="unavailable";
    try {
      const serverLog=readFileSync(
        join(process.env.RUNNER_TEMP,"btcpay-prism-restart.log"),"utf8"
      );
      diagnostics=JSON.stringify({
        insufficientFunds:(serverLog.match(/NotEnoughFundsException/g)||[]).length,
        processorDisabled:(serverLog.match(/DisableProcessor/g)||[]).length,
        broadcastError:(serverLog.match(/Could not finalize and broadcast/g)||[]).length,
        processingFound:(serverLog.match(/found to process/g)||[]).length,
        prismEventError:(serverLog.match(/Error while processing prism event/g)||[]).length,
      });
    }catch{/* no log availability */}
    const states=await api(path,{auth:basic});
    const statusReport=Array.isArray(states)
      ?JSON.stringify(safeClaimStates(states)):"unavailable";
    throw Error("No confirmed regtest Prism wallet receipts: "+
      "claims="+statusReport+" receivedSats="+supplierSats+"/"+platformSats+
      " diagnostics="+diagnostics);
  }
  rpc("generatetoaddress","2",minerAddress);
  const gotS=sats(wallet(p.sw,"getreceivedbyaddress",p.addresses.supplier,"1"));
  const gotP=sats(wallet(p.pw,"getreceivedbyaddress",p.addresses.platform,"1"));
  if(gotS!==supplierSats||gotP!==platformSats)
    throw Error("Prism transfers were not confirmed to both receivers");
  const gross=gotS+gotP;
  if(gross<=0n||gross>TEST_INVOICE_SATS||
      gotS>=p.frozen.pending[0].entitlementSats||
      gotP>=p.frozen.pending[1].entitlementSats)
    throw Error("Prism reserve/recipient payout exceeds declared entitlement");
  // With 2% reserve and no other payments, claimed amounts are exact.
  // Network fees are deducted from the merchant's remaining balance.
  const expectedS=p.frozen.pending[0].entitlementSats*98n/100n;
  const expectedP=p.frozen.pending[1].entitlementSats*98n/100n;
  if(gotS!==expectedS||gotP!==expectedP)
    throw Error("Prism recipient totals do not match 2% reserve policy");
  progress("prism-wallet-receipts-confirmed",String(p.ratio.version));
  return {ruleVersion:p.ratio.version,
    supplierBasisPoints:p.ratio.supplier,
    platformBasisPoints:10000-p.ratio.supplier,
    supplierReceivedSats:gotS.toString(),
    platformReceivedSats:gotP.toString(),
    reserveSats:(TEST_INVOICE_SATS-gross).toString(),
    payoutsCreated:claims.length,
    pluginGenerated:true,productionReady:false};
}
export async function runEphemeralPrismForwarding({basic}) {
  assertIsolation();
  if(typeof basic!=="string"||!basic.startsWith("Basic "))
    throw Error("Synthetic administrator not available");
  progress("begin-forwarding-test");
  const chain=rpc("getblockchaininfo");
  if(chain?.chain!=="regtest")throw Error("STOP: Bitcoin Core was not regtest");
  const suffix=randomBytes(5).toString("hex");
  const miner="apex_ephemeral_ci_sender";
  if(!rpc("listwallets").includes(miner))
    throw Error("No existing disposable Bitcoin Core mining wallet");
  const minerAddress=wallet(miner,"getnewaddress","","bech32");
  const stores=[];
  for(const ratio of ratios){
    bounded("configure-stores");
    stores.push(await storeConfig(basic,ratio,suffix));
  }
  await restartLocalBTCPay();
  for(const p of stores) {
    const active=await api("/api/v1/stores/"+p.storeId+
      "/payout-processors/OnChainAutomatedPayoutSenderFactory/BTC-CHAIN",{
      auth:basic,
    });
    if(!Array.isArray(active)||active.length!==1||
       active[0].payoutMethodId!=="BTC-CHAIN")
      throw Error("Prism on-chain payout processor not active after BTCPay restart");
    progress("verified-active-payout-processor",String(p.ratio.version));
  }
  const receipts=[];
  for(const p of stores){
    bounded("prism-invoice");
    progress("create-invoice",String(p.ratio.version));
    const invoice=await api("/api/v1/stores/"+p.storeId+"/invoices",{
      method:"POST",auth:basic,
      json:{amount:"0.10",currency:"BTC",
        metadata:{orderId:"prism-test-"+p.ratio.version}},
    });
    if(!id.test(invoice.id))throw Error("Prism test invoice not created");
    const methods=await api("/api/v1/invoices/"+invoice.id+"/payment-methods",{
      auth:basic,
    });
    const btcMethod=methods.find(x=>x.paymentMethodId==="BTC-CHAIN");
    if(!btcMethod||!btcMethod.destination.startsWith("bcrt1")||
       sats(btcMethod.due)!==TEST_INVOICE_SATS)
      throw Error("Prism test payment details do not match regtest invoice");
    const tx=wallet(miner,"sendtoaddress",btcMethod.destination,btc(TEST_INVOICE_SATS));
    if(!sha.test(tx))throw Error("Synthetic Prism invoice payment not broadcast");
    rpc("generatetoaddress","6",minerAddress);
    progress("prism-invoice-funded",String(p.ratio.version));
    let settled=false;
    for(let i=0;i<45;i++){
      bounded("invoice-settlement");
      const details=await api("/api/v1/stores/"+p.storeId+
        "/invoices/"+invoice.id,{auth:basic});
      if(details?.status==="Settled"&&details.additionalStatus==="None"){
        settled=true;break;
      }
      if(details?.status==="Expired"||details?.status==="Invalid")
        throw Error("Prism invoice entered an exceptional payment state");
      await delay(1600);
    }
    if(!settled)throw Error("Prism test invoice did not settle");
    progress("prism-invoice-settled",String(p.ratio.version));
    receipts.push(await waitForPayouts(basic,p,minerAddress));
  }
  if(receipts.length!==2)
    throw Error("Both versioned Prism regtest scenarios did not complete");
  progress("both-prism-payout-ratios-confirmed");
  return Object.freeze({
    verifiedNetwork:"regtest",prismForwardingVerified:true,
    scenarioCount:receipts.length,receipts,productionReady:false,
  });
}
