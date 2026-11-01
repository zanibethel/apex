#!/usr/bin/env node
/**
 * Synthetic local-only BTCPay Greenfield bootstrap + invoice smoke.
 * This is for a disposable GitHub-hosted regtest runner ONLY.
 * No real wallets, mainnet, Vercel, Supabase or public API access.
 */
import { randomBytes } from "node:crypto";

const ORIGIN = "http://127.0.0.1:14142";
const safeId = /^[a-zA-Z0-9_-]{1,100}$/;

async function endpoint(path, { method="GET", json, auth, fetchImpl=fetch }={}) {
  const headers = {Accept:"application/json"};
  if (json !== undefined) headers["Content-Type"] = "application/json";
  if (auth) headers.Authorization=auth;
  let response;
  try {
    response=await fetchImpl(ORIGIN+path,{
      method,headers,
      ...(json!==undefined?{body:JSON.stringify(json)}:{}),
      redirect:"error",signal:AbortSignal.timeout(15000),
    });
  } catch {
    throw Error("Local BTCPay Greenfield transport failed; no external request allowed");
  }
  if (!response?.ok) {
    const status = Number.isInteger(response?.status) ? response.status : 0;
    // Upstream bodies may contain secrets: never copy them into CI logs.
    throw Error("Local BTCPay Greenfield request failed at "+path.split("?")[0]+" (HTTP "+status+")");
  }
  try { return await response.json(); }
  catch { throw Error("Local BTCPay Greenfield returned invalid JSON"); }
}

export async function runEphemeralGreenfield({
  testOnly, network, fetchImpl=fetch, random=()=>randomBytes(18).toString("hex"),
}={}) {
  if(testOnly!==true||network!=="regtest") {
    throw Error("STOP: Greenfield smoke requires explicit disposable regtest mode");
  }
  const suffix=random();
  if(typeof suffix!=="string"||!/^[a-f0-9]{36}$/.test(suffix))
    throw Error("Invalid synthetic test entropy");
  const email="apex-smoke-"+suffix.slice(0,16)+"@example.com";
  const password="A7!q"+suffix+"Zz9";
  const request=(path,opts={})=>endpoint(path,{...opts,fetchImpl});
  const account=await request("/api/v1/users",{
    method:"POST",json:{email,name:"Apex synthetic regtest",password,
      isAdministrator:true,sendInvitationEmail:false},
  });
  if(!account?.id || typeof account.id!=="string")throw Error("Synthetic administrator creation was not verified");
  const basic="Basic "+Buffer.from(email+":"+password).toString("base64");
  const me=await request("/api/v1/users/me",{auth:basic});
  if(me.id!==account.id)throw Error("Synthetic account identity mismatch");
  const store=await request("/api/v1/stores",{
    method:"POST",auth:basic,json:{name:"Apex Disposable Regtest"},
  });
  if(typeof store?.id!=="string"||!safeId.test(store.id))
    throw Error("Synthetic BTCPay store creation was not verified");
  // Disposable regtest-only wallet. The API returns a mnemonic; keep it
  // strictly in-process and NEVER print, upload, persist, or reuse it.
  const wallet=await request("/api/v1/stores/"+store.id+
    "/payment-methods/BTC-CHAIN/wallet/generate",{
    method:"POST",auth:basic,json:{
      label:"Disposable CI Regtest Wallet",savePrivateKeys:false,
      scriptPubKeyType:"Segwit",
    },
  });
  if(wallet?.paymentMethodId!=="BTC-CHAIN" ||
     typeof wallet?.config?.derivationScheme!=="string" ||
     wallet.config.derivationScheme.length<20) {
    throw Error("Synthetic regtest on-chain wallet configuration was not verified");
  }
  const permissions=[
    "btcpay.store.canviewstoresettings:"+store.id,
    "btcpay.store.cancreateinvoice:"+store.id,
    "btcpay.store.canviewinvoices:"+store.id,
  ];
  const key=await request("/api/v1/api-keys",{
    method:"POST",auth:basic,json:{label:"Ephemeral Apex invoice smoke",permissions},
  });
  if(typeof key?.apiKey!=="string"||key.apiKey.length<12)
    throw Error("Synthetic scoped Greenfield key was not returned");
  if(!Array.isArray(key.permissions)||!permissions.every(
    p=>key.permissions.some(x=>x===p||x?.policy===p||x?.toString?.()===p)
  )) {
    // A mismatch in returned scope must fail, not silently widen access.
    throw Error("Synthetic Greenfield API key did not report the requested store scope");
  }
  const token="token "+key.apiKey;
  const readStore=await request("/api/v1/stores/"+store.id,{auth:token});
  if(readStore?.id!==store.id)throw Error("Synthetic read-only store check failed");
  const orderId="APEX-REGTEST-001";
  const invoice=await request("/api/v1/stores/"+store.id+"/invoices",{
    method:"POST",auth:token,
    json:{amount:"0.0001",currency:"BTC",metadata:{orderId}},
  });
  if(typeof invoice?.id!=="string"||!safeId.test(invoice.id))
    throw Error("Synthetic invoice was not created");
  const observed=await request("/api/v1/stores/"+store.id+"/invoices/"+invoice.id,{
    auth:token,
  });
  if(observed?.id!==invoice.id||observed?.storeId!==store.id||
    observed?.metadata?.orderId!==orderId||
    observed?.currency!=="BTC") {
    throw Error("Synthetic Greenfield invoice did not match trusted store/order metadata");
  }
  return Object.freeze({
    chain:"regtest",accountCreated:true,storeCreated:true,
    testWalletConfigured:true,
    storeScopedKeyCreated:true,invoiceCreated:true,invoiceReadVerified:true,
    invoiceStatus:observed.status,
    paymentFunded:false,prismVerified:false,productionReady:false,
  });
}

if(process.argv[1]?.endsWith("btcpay-ephemeral-greenfield.mjs")){
  runEphemeralGreenfield({
    testOnly:process.env.APEX_BTCPAY_EPHEMERAL==="true",
    network:process.env.APEX_BTCPAY_TEST_NETWORK,
  }).then(out=>process.stdout.write(JSON.stringify(out,null,2)+"\n"))
    .catch(e=>{process.stderr.write(e.message+"\n");process.exitCode=1;});
}
