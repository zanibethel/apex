import test from "node:test";
import assert from "node:assert/strict";
import {runEphemeralGreenfield} from "../scripts/btcpay-ephemeral-greenfield.mjs";

const fixed="abcdef0123456789abcdef0123456789abcd";
const email="apex-smoke-"+fixed.slice(0,16)+"@example.com";

function mockServer({override}={}){
  const calls=[];
  const key="ephemeral_fake_scoped_key_12345";
  const account={id:"ephemeral_user_1"};
  const store={id:"syntheticStore001"};
  const perms=["btcpay.store.canviewstoresettings:syntheticStore001",
               "btcpay.store.cancreateinvoice:syntheticStore001",
               "btcpay.store.canviewinvoices:syntheticStore001"];
  const invoice={id:"invoice_regtest_1",storeId:store.id,currency:"BTC",
    metadata:{orderId:"APEX-REGTEST-001"},status:"New"};
  const fetchImpl=async(url,options)=>{
    const u=new URL(url);
    calls.push({url,options});
    assert.equal(u.origin,"http://127.0.0.1:14142");
    assert.equal(options.redirect,"error");
    assert.ok(options.signal);
    assert.ok(!options.body?.includes("mainnet"));
    let result;
    if(u.pathname==="/api/v1/users"){
      assert.equal(options.method,"POST");
      const request=JSON.parse(options.body);
      assert.equal(request.email,email);
      assert.equal(request.isAdministrator,true);
      assert.equal(request.sendInvitationEmail,false);
      assert.ok(request.password.length>=24);
      result=account;
    } else if(u.pathname==="/api/v1/users/me"){
      assert.equal(options.headers.Authorization.startsWith("Basic "),true);
      result=account;
    } else if(u.pathname==="/api/v1/stores"&&options.method==="POST"){
      result=store;
    } else if(u.pathname==="/api/v1/stores/"+store.id+
        "/payment-methods/BTC-CHAIN/wallet/generate"){
      assert.equal(options.method,"POST");
      assert.equal(options.headers.Authorization.startsWith("Basic "),true);
      const request=JSON.parse(options.body);
      assert.equal(request.savePrivateKeys,false);
      assert.equal(request.scriptPubKeyType,"Segwit");
      result={paymentMethodId:"BTC-CHAIN",enabled:true,
        config:{derivationScheme:"tpub-synthetic-regtest-descriptor-not-real"},
        mnemonic:"test-only-mnemonic-never-to-be-logged"};
    } else if(u.pathname==="/api/v1/api-keys"){
      assert.equal(options.method,"POST");
      assert.deepEqual(JSON.parse(options.body).permissions,perms);
      result={apiKey:key,permissions:perms};
    } else if(u.pathname==="/api/v1/stores/"+store.id&&options.method==="GET"){
      assert.equal(options.headers.Authorization,"token "+key);
      result=store;
    } else if(u.pathname==="/api/v1/stores/"+store.id+"/invoices"
       &&options.method==="POST"){
      assert.equal(options.headers.Authorization,"token "+key);
      assert.deepEqual(JSON.parse(options.body),
        {amount:"0.0001",currency:"BTC",metadata:{orderId:"APEX-REGTEST-001"}});
      result=invoice;
    } else if(u.pathname==="/api/v1/stores/"+store.id+"/invoices/"+invoice.id){
      result=invoice;
    } else throw Error("Unexpected network request "+u.pathname);
    const out=override?.({path:u.pathname,method:options.method,result});
    if(out) return out;
    return {ok:true,status:200,json:async()=>result};
  };
  return {calls,fetchImpl};
}
test("disposable test flag and exact regtest chain required before any IO",async()=>{
  let called=0;
  const fetchImpl=async()=>{called++;throw Error("must not call");};
  for(const args of [
    {testOnly:false,network:"regtest"},
    {testOnly:true,network:"mainnet"},
    {testOnly:true,network:"testnet"},
    {testOnly:true,network:undefined},
  ]) await assert.rejects(runEphemeralGreenfield({...args,fetchImpl,random:()=>fixed}));
  assert.equal(called,0);
});
test("creates synthetic account, exact store scoped key, invoice and re-fetch only",async()=>{
  const {fetchImpl,calls}=mockServer();
  const result=await runEphemeralGreenfield({
    testOnly:true,network:"regtest",fetchImpl,random:()=>fixed,
  });
  assert.equal(calls.length,8);
  assert.equal(calls.filter(x=>x.options.method==="POST").length,5);
  assert.deepEqual(result,{
    chain:"regtest",accountCreated:true,storeCreated:true,
    testWalletConfigured:true,
    storeScopedKeyCreated:true,invoiceCreated:true,invoiceReadVerified:true,
    invoiceStatus:"New",paymentFunded:false,prismVerified:false,productionReady:false,
  });
  assert.equal(Object.isFrozen(result),true);
  assert.ok(!JSON.stringify(result).includes("ephemeral_fake_scoped_key"));
});
test("rejects missing or widened key permissions",async()=>{
  const {fetchImpl}=mockServer({override:({path})=>
    path==="/api/v1/api-keys"?{ok:true,status:200,json:async()=>({
      apiKey:"ephemeral_fake_scoped_key_12345",permissions:["unrestricted"],
    })}:undefined
  });
  await assert.rejects(runEphemeralGreenfield({
    testOnly:true,network:"regtest",fetchImpl,random:()=>fixed,
  }),/did not report requested store scope/);
});
test("rejects mismatched invoice store/order and hides upstream response body",async()=>{
  const {fetchImpl}=mockServer({override:({path,result})=>
    path.endsWith("/invoice_regtest_1")?{ok:true,status:200,json:async()=>({
      ...result,storeId:"otherStore",
    })}:undefined
  });
  await assert.rejects(runEphemeralGreenfield({
    testOnly:true,network:"regtest",fetchImpl,random:()=>fixed,
  }),/invoice did not match/);
  const failing=mockServer({override:({path})=>
    path==="/api/v1/stores"?{ok:false,status:403,text:async()=>"SECRET_SERVER_BODY"}:undefined
  });
  await assert.rejects(runEphemeralGreenfield({
    testOnly:true,network:"regtest",fetchImpl:failing.fetchImpl,random:()=>fixed,
  }),e=>e.message.includes("HTTP 403")&&!e.message.includes("SECRET"));
});
test("rejects invalid entropy before network IO",async()=>{
  let called=0;
  await assert.rejects(runEphemeralGreenfield({
    testOnly:true,network:"regtest",random:()=>"too short",fetchImpl:async()=>{called++;},
  }),/entropy/);
  assert.equal(called,0);
});
