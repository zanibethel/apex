#!/usr/bin/env node
/**
 * Disposable Bitcoin Core REGTEST proof of two admin-versioned payout plans:
 * 90/10 rule v1 and 85/15 rule v2.
 * REAL mined regtest BTC, but NOT Prism: this tests on-chain mechanics only.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { snapshotSyntheticAdminSplit } from "../src/lib/payments/synthetic-payout-rule-snapshot.mjs";

const compose=["compose","-p","apex-regtest","-f","infra/regtest/compose.yml",
 "exec","-T","node","bitcoin-cli","-datadir=/home/bitcoin/.bitcoin","-regtest"];
function cli(...args){
 const output=execFileSync("docker",[...compose,...args.map(String)],{
   cwd:process.cwd(),encoding:"utf8",timeout:45000,
   stdio:["ignore","pipe","pipe"],maxBuffer:2*1024*1024,
 }).trim();
 try{return JSON.parse(output);}catch{return output;}
}
function rpc(method,...args){return cli(method,...args);}
function wallet(name,method,...args){return cli("-rpcwallet="+name,method,...args);}
function setupWallet(name){
 if(rpc("listwallets").includes(name))return;
 if(rpc("listwalletdir").wallets.some(w=>w.name===name))rpc("loadwallet",name);
 else rpc("createwallet",name);
}
function satsToBtc(v){
 assert.equal(typeof v,"bigint");
 assert.ok(v>=0n&&v<=2100000000000000n);
 return (v/100000000n).toString()+"."+
   (v%100000000n).toString().padStart(8,"0");
}
function btcToSats(v){
 const s=String(v);
 assert.match(s,/^\d+(?:\.\d{1,8})?$/);
 const [a,b=""]=s.split(".");
 return BigInt(a)*100000000n+BigInt(b.padEnd(8,"0"));
}
const supplierId="80000000-0000-4000-8000-000000000001";
const platformId="80000000-0000-4000-8000-000000000002";
function rule(percent,version){
 return {status:"approved_test_fixture",scope_type:"storefront",
   scope_id:"90000000-0000-4000-8000-000000000001",version,
   allocations:[
     {recipient_id:supplierId,basis_points:percent},
     {recipient_id:platformId,basis_points:10000-percent},
   ]};
}
export function runAdminSplitRegtest(){
 const chain=rpc("getblockchaininfo");
 assert.equal(chain.chain,"regtest","STOP: only Bitcoin regtest is permitted");
 const tag=randomBytes(5).toString("hex");
 const miner="apex_rule_miner_"+tag;
 setupWallet(miner);
 const minerAddress=wallet(miner,"getnewaddress","","bech32");
 assert.ok(minerAddress.startsWith("bcrt1"));
 rpc("generatetoaddress",101,minerAddress);

 const proof=[];
 for(const [percent,version] of [[9000,1],[8500,2]]){
   const customer="apex_rule_customer_"+version+"_"+tag;
   const merchant="apex_rule_merchant_"+version+"_"+tag;
   const supplier="apex_rule_supplier_"+version+"_"+tag;
   const platform="apex_rule_platform_"+version+"_"+tag;
   for(const name of [customer,merchant,supplier,platform])setupWallet(name);
   const customerAddress=wallet(customer,"getnewaddress","","bech32");
   const merchantAddress=wallet(merchant,"getnewaddress","","bech32");
   const reserveAddress=wallet(merchant,"getnewaddress","","bech32");
   const supplierAddress=wallet(supplier,"getnewaddress","","bech32");
   const platformAddress=wallet(platform,"getnewaddress","","bech32");
   for(const a of [customerAddress,merchantAddress,reserveAddress,
     supplierAddress,platformAddress])assert.ok(a.startsWith("bcrt1"));

   const amountSats=1000000n;
   const reservedFeeSats=200000n;
   const snapshot=snapshotSyntheticAdminSplit({
     rule:rule(percent,version),orderId:"synthetic-regtest-"+version,
     amountSats,testOnly:true,network:"regtest",
   });
   const [supplierEntitlement,platformEntitlement]=snapshot.pending
     .map(p=>p.entitlementSats);
   assert.equal(supplierEntitlement+platformEntitlement,amountSats);
   wallet(miner,"sendtoaddress",customerAddress,satsToBtc(1500000n));
   wallet(miner,"sendtoaddress",reserveAddress,satsToBtc(reservedFeeSats));
   rpc("generatetoaddress",1,minerAddress);
   wallet(customer,"sendtoaddress",merchantAddress,satsToBtc(amountSats));
   rpc("generatetoaddress",1,minerAddress);
   assert.equal(btcToSats(wallet(merchant,"getreceivedbyaddress",
     merchantAddress,1)),amountSats);

   // This is explicit Bitcoin Core sendmany, NOT Prism plugin forwarding.
   const outputs={
     [supplierAddress]:Number(satsToBtc(supplierEntitlement)),
     [platformAddress]:Number(satsToBtc(platformEntitlement)),
   };
   const outgoing=wallet(merchant,"sendmany","",JSON.stringify(outputs),1,
     "apex-versioned-admin-plan-"+version);
   assert.match(outgoing,/^[a-f0-9]{64}$/i);
   rpc("generatetoaddress",1,minerAddress);
   const tx=rpc("getrawtransaction",outgoing,true);
   const paid=new Map(tx.vout.filter(o=>o.scriptPubKey?.address)
     .map(o=>[o.scriptPubKey.address,btcToSats(o.value)]));
   assert.equal(paid.get(supplierAddress),supplierEntitlement);
   assert.equal(paid.get(platformAddress),platformEntitlement);
   assert.equal(btcToSats(wallet(supplier,"getreceivedbyaddress",
     supplierAddress,1)),supplierEntitlement);
   assert.equal(btcToSats(wallet(platform,"getreceivedbyaddress",
     platformAddress,1)),platformEntitlement);
   const fee=wallet(merchant,"gettransaction",outgoing).fee;
   assert.ok(typeof fee==="number"&&fee<0);
   const feeSats=btcToSats(Math.abs(fee));
   assert.ok(feeSats>0n&&feeSats<reservedFeeSats);
   proof.push({
     test:"synthetic-admin-versioned-regtest-transfer",
     ruleVersion:version,supplierBasisPoints:percent,
     platformBasisPoints:10000-percent,
     invoiceSats:amountSats.toString(),
     supplierReceivedSats:supplierEntitlement.toString(),
     platformReceivedSats:platformEntitlement.toString(),
     feeSats:feeSats.toString(),
     network:"regtest",prismPluginTested:false,
   });
 }
 assert.deepEqual(proof.map(p=>p.supplierBasisPoints),[9000,8500]);
 console.log(JSON.stringify({scenario:"2-admin-versioned-regtest-payout-plans",
   proof,prismForwardingVerified:false,productionReady:false},null,2));
}
if(process.argv[1]?.endsWith("regtest-admin-split-smoke.mjs")){
 try{runAdminSplitRegtest();}
 catch{console.error("Synthetic regtest admin split proof failed; no secrets logged");
   process.exitCode=1;}
}
