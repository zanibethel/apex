import test from "node:test";
import assert from "node:assert/strict";
import {
 assertRegtestPaymentInput,fundEphemeralInvoice,
} from "../scripts/btcpay-ephemeral-regtest-payment.mjs";
const sample={
 testOnly:true,network:"regtest",
 upstreamRoot:"/tmp/official-upstream-btcpay",
 destination:"bcrt1qsyntheticregtestpaymentaddressonlynotreal",
 amount:"0.00010000",
};
test("regtest payment adapter rejects mainnet, invalid addresses or unsafe amounts",()=>{
  for(const bad of [
    {...sample,testOnly:false},
    {...sample,network:"mainnet"},
    {...sample,network:"testnet"},
    {...sample,upstreamRoot:"relative"},
    {...sample,destination:"bc1qmainnetaddress"},
    {...sample,destination:"tb1qtestnetaddress"},
    {...sample,amount:"1.00000001"},
    {...sample,amount:"0.00000001"},
    {...sample,amount:"0.000100001"},
    {...sample,amount:"0.0001e0"},
    {...sample,amount:0.0001},
  ]) assert.throws(()=>assertRegtestPaymentInput(bad));
  assert.equal(assertRegtestPaymentInput(sample),10000n);
});
test("actual chain must be verified before creating or funding a disposable wallet",async()=>{
  const methods=[];
  const exec=(name,args)=>{
    methods.push(args.at(-1));
    assert.equal(name,"docker");
    return JSON.stringify({chain:"main"});
  };
  await assert.rejects(fundEphemeralInvoice(sample,{exec}),/not on regtest/);
  assert.deepEqual(methods,["getblockchaininfo"]);
});
test("mocks worthless regtest wallet mining, payment and six confirmations only",async()=>{
  const methods=[];
  const exec=(name,args)=>{
    assert.equal(name,"docker");
    const method=args.find(x=>[
      "getblockchaininfo","validateaddress","createwallet",
      "getnewaddress","generatetoaddress","sendtoaddress",
    ].includes(x));
    methods.push({method,args});
    if(method==="getblockchaininfo")return JSON.stringify({chain:"regtest"});
    if(method==="validateaddress")return JSON.stringify({isvalid:true});
    if(method==="createwallet")return JSON.stringify({name:"apex_ephemeral_ci_sender"});
    if(method==="getnewaddress")return "bcrt1qsyntheticminerregtestonlynotreal";
    if(method==="generatetoaddress")return "[]";
    if(method==="sendtoaddress")return "a".repeat(64);
    throw Error("unexpected command");
  };
  const out=await fundEphemeralInvoice(sample,{exec});
  assert.deepEqual(methods.map(x=>x.method),[
    "getblockchaininfo","validateaddress","createwallet",
    "getnewaddress","generatetoaddress","sendtoaddress","generatetoaddress",
  ]);
  assert.equal(methods[4].args.at(-2),"101");
  assert.equal(methods[5].args.at(-2),sample.destination);
  assert.equal(methods[5].args.at(-1),sample.amount);
  assert.equal(methods[6].args.at(-2),"6");
  assert.equal(out.network,"regtest");
  assert.equal(out.localTransactionCreated,true);
  assert.equal(out.productionReady,false);
  assert.ok(!JSON.stringify(out).includes(sample.destination));
});
test("unavailable RPC never logs wallet/RPC response",async()=>{
  await assert.rejects(fundEphemeralInvoice(sample,{
    exec:()=>{throw Error("DANGEROUS_SECRET_DETAILS");},
  }),e=>e.message==="Local disposable Bitcoin RPC operation failed"
        &&!e.message.includes("SECRET"));
});
