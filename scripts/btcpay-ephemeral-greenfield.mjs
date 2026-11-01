#!/usr/bin/env node
/**
 * Synthetic local-only BTCPay Greenfield bootstrap + invoice smoke.
 * This is for a disposable GitHub-hosted regtest runner ONLY.
 * No real wallets, mainnet, Vercel, Supabase or public API access.
 */
import { randomBytes } from "node:crypto";
import { createEphemeralWebhookJournal } from "./btcpay-ephemeral-webhook.mjs";

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
  payInvoice, verifyWebhook=false,
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
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
     typeof wallet?.config?.accountDerivation!=="string" ||
     wallet.config.accountDerivation.length<20) {
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
  if(verifyWebhook && typeof payInvoice!=="function")
    throw Error("Signed webhook test requires real regtest funding");
  let receiver;
  if(verifyWebhook) {
    const secret=randomBytes(24).toString("hex");
    const journal=createEphemeralWebhookJournal({
      testOnly:true,network:"regtest",storeId:store.id,
      secret,orderId,amountSats:10000n,
      readInvoice:id=>request("/api/v1/stores/"+store.id+
        "/invoices/"+id,{auth:token}),
    });
    receiver=await journal.begin();
  }
  try {
  if(receiver) {
    const hook=await request("/api/v1/stores/"+store.id+"/webhooks",{
      method:"POST",auth:basic,
      json:{url:receiver.url,secret,enabled:true,
        automaticRedelivery:false,authorizedEvents:{
          everything:false,specificEvents:["InvoiceSettled"],
        }},
    });
    if(typeof hook?.id!=="string"||!safeId.test(hook.id)||
       hook.enabled!==true)
      throw Error("Synthetic webhook registration did not complete");
  }
  const invoice=await request("/api/v1/stores/"+store.id+"/invoices",{
    method:"POST",auth:token,
    json:{amount:"0.0001",currency:"BTC",metadata:{orderId}},
  });
  if(typeof invoice?.id!=="string"||!safeId.test(invoice.id))
    throw Error("Synthetic invoice was not created");
  receiver?.setInvoiceId(invoice.id);
  const observed=await request("/api/v1/stores/"+store.id+"/invoices/"+invoice.id,{
    auth:token,
  });
  if(observed?.id!==invoice.id||observed?.storeId!==store.id||
    observed?.metadata?.orderId!==orderId||
    observed?.currency!=="BTC") {
    throw Error("Synthetic Greenfield invoice did not match trusted store/order metadata");
  }
  let funded=false,settled=false;
  if(payInvoice!==undefined) {
    if(typeof payInvoice!=="function")throw Error("Invalid disposable funding adapter");
    const methods=await request("/api/v1/invoices/"+invoice.id+
      "/payment-methods",{auth:token});
    const onChain=Array.isArray(methods)
      ?methods.find(p=>p.paymentMethodId==="BTC-CHAIN"):null;
    if(!onChain||onChain.currency!=="BTC"||
       typeof onChain.destination!=="string"||
       typeof onChain.due!=="string") {
      throw Error("Synthetic BTC-CHAIN payment destination or due amount is missing");
    }
    const receipt=await payInvoice({
      destination:onChain.destination,amount:onChain.due,
    });
    if(receipt?.network!=="regtest"||
       receipt.localTransactionCreated!==true||
       receipt.transactionIdVerified!==true) {
      throw Error("Synthetic regtest transfer did not report success");
    }
    funded=true;
    for(let attempt=0;attempt<90;attempt++) {
      const status=await request("/api/v1/stores/"+store.id+
        "/invoices/"+invoice.id,{auth:token});
      if(status?.id!==invoice.id||status?.storeId!==store.id||
         status?.metadata?.orderId!==orderId||status?.currency!=="BTC") {
        throw Error("Invoice identity drift during regtest confirmation");
      }
      if(status.status==="Settled"&&status.additionalStatus==="None"){
        settled=true;break;
      }
      if(status.status==="Invalid"||status.status==="Expired"||
         (status.additionalStatus&&status.additionalStatus!=="None")) {
        throw Error("Invoice entered an exceptional status during test settlement");
      }
      await sleep(2000);
    }
    if(!settled)throw Error("BTCPay did not report a settled regtest invoice");
  }
  let webhookProof={
    signedSettlementWebhookReceived:false,
    duplicateDeliveryIgnored:false,
    tamperingRejected:false,
    crossStoreRejected:false,
  };
  if(receiver) {
    for(let attempt=0;attempt<30&&!receiver.isSettled;attempt++)
      await sleep(500);
    if(!receiver.isSettled)
      throw Error("No authenticated BTCPay InvoiceSettled webhook received");
    const result=await receiver.replayAssertions();
    webhookProof={
      signedSettlementWebhookReceived:true,
      duplicateDeliveryIgnored:result.duplicateIgnored,
      tamperingRejected:result.tamperingRejected,
      crossStoreRejected:result.crossStoreRejected,
    };
  }
  return Object.freeze({
    chain:"regtest",accountCreated:true,storeCreated:true,
    testWalletConfigured:true,
    storeScopedKeyCreated:true,invoiceCreated:true,invoiceReadVerified:true,
    invoiceStatus:observed.status,
    paymentFunded:funded,invoiceSettledVerified:settled,
    ...webhookProof,prismVerified:false,productionReady:false,
  });
  } finally {
    if(receiver)await receiver.close();
  }
}

if(process.argv[1]?.endsWith("btcpay-ephemeral-greenfield.mjs")){
  const pay=process.env.APEX_BTCPAY_PAY_REGTEST==="true"
    ?import("./btcpay-ephemeral-regtest-payment.mjs").then(m=>m.fundEphemeralInvoice)
    :Promise.resolve(null);
  pay.then(fund=>runEphemeralGreenfield({
    testOnly:process.env.APEX_BTCPAY_EPHEMERAL==="true",
    network:process.env.APEX_BTCPAY_TEST_NETWORK,
    ...(fund?{payInvoice:payment=>fund({
      ...payment,testOnly:true,network:"regtest",
      upstreamRoot:process.env.APEX_BTCPAY_UPSTREAM_ROOT,
    })}:{}),
    verifyWebhook:process.env.APEX_BTCPAY_VERIFY_WEBHOOK==="true",
  })).then(out=>process.stdout.write(JSON.stringify(out,null,2)+"\\n"))
    .catch(e=>{process.stderr.write(e.message+"\\n");process.exitCode=1;});
}
