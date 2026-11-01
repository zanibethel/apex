/**
 * PR #125 — TEST-ONLY disposable Greenfield pre-POST authorization protocol.
 * Not imported by Next.js routes. Never enable against a production BTCPay.
 *
 * A trusted, durable PostgreSQL reservation MUST commit before the ONE
 * external Greenfield POST. Unknown outcomes are terminal until independent
 * operator reconciliation. Never POST again based on a timeout/status code.
 */
const safeId=/^[A-Za-z0-9_-]{1,100}$/;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function btcAmount(sats){
  if(typeof sats!=="bigint"||sats<1000n||sats>100000000n)
    throw Error("Invalid regtest amount");
  return (sats/100000000n)+"."+(sats%100000000n).toString().padStart(8,"0");
}

export async function createPreauthorizedRegtestInvoice({
  testOnly,network,serverUrl,storeId,apiKey,orderRef,amountSats,
  reserveDurably,recordObservation,fetchImpl=fetch,
}={}){
  if(testOnly!==true||network!=="regtest"||
     !safeId.test(storeId||"")||!safeId.test(orderRef||"")||
     typeof apiKey!=="string"||apiKey.length<12||
     typeof reserveDurably!=="function"||
     typeof recordObservation!=="function"||
     typeof fetchImpl!=="function") {
    throw Error("Disposable regtest provider fence required");
  }
  const amount=btcAmount(amountSats);
  let origin;
  try{origin=new URL(serverUrl);}catch{throw Error("Invalid loopback BTCPay origin");}
  // Literal numeric loopback only; no DNS resolution, IPv6 redirect, or
  // cloud instances. This is separate from the caller's regtest assertion.
  if(origin.hostname!=="127.0.0.1"||
     !["http:","https:"].includes(origin.protocol)||
     origin.pathname!=="/"||origin.username||origin.password||
     origin.search||origin.hash)
    throw Error("Disposable Greenfield requires numeric loopback origin");

  // If this fails or returns the wrong persisted identity, ZERO HTTP calls.
  // Caller must supply a trusted SQL-backed transaction, not in-memory state.
  let admission;
  try{admission=await reserveDurably({storeId,orderRef,amountSats,network});}
  catch{throw Error("Durable provider invoice reservation denied");}
  if(!admission||!uuid.test(admission.intentId||"")||
     admission.storeId!==storeId||admission.orderRef!==orderRef||
     admission.amountSats!==amountSats||admission.network!=="regtest"||
     admission.status!=="reserved_before_post") {
    throw Error("Untrusted or mismatched durable provider reservation");
  }
  const intentId=admission.intentId;
  const headers={Authorization:"token "+apiKey,Accept:"application/json"};
  const prefix="/api/v1/stores/"+encodeURIComponent(storeId)+"/invoices";
  let confirmedId=null;
  let outcome="post_outcome_unknown";
  // Any network timeout, HTTP rejection or malformed response is ambiguous:
  // the provider may have already committed an invoice. Never auto-retry.
  try{
    const response=await fetchImpl(new URL(prefix,origin).href,{
      method:"POST",redirect:"error",cache:"no-store",
      signal:AbortSignal.timeout(10000),
      headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({
        amount,currency:"BTC",
        metadata:{orderId:orderRef,apexIntentId:intentId},
      }),
    });
    if(response?.ok){
      const created=await response.json();
      if(created?.id&&safeId.test(created.id)&&created.storeId===storeId){
        const observed=await fetchImpl(
          new URL(prefix+"/"+encodeURIComponent(created.id),origin).href,{
            method:"GET",redirect:"error",cache:"no-store",
            signal:AbortSignal.timeout(10000),headers,
          });
        if(observed?.ok){
          const invoice=await observed.json();
          if(invoice?.id===created.id&&invoice.storeId===storeId&&
             invoice.currency==="BTC"&&
             invoice.metadata?.orderId===orderRef&&
             invoice.metadata?.apexIntentId===intentId&&
             invoice.amount===amount&&
             ["New","Processing","Settled","Expired","Invalid"].includes(invoice.status)){
            confirmedId=invoice.id;
            outcome="invoice_seen_by_readback";
          }
        }
      }
    }
  }catch{/* fail closed: do not log provider body or caller credentials */}

  let evidenceRecorded=false;
  try{
    const proof=await recordObservation({
      intentId,kind:outcome,invoiceId:confirmedId,network:"regtest",
    });
    evidenceRecorded=proof==="recorded_without_checkout_authorization";
  }catch{/* reservation still consumed; operator must investigate */}
  return Object.freeze({
    status:outcome==="invoice_seen_by_readback"&&evidenceRecorded
      ?"observed_regtest_invoice_no_checkout":"operator_reconciliation_required",
    intentId,
    // Never expose checkout/payment URL. Unknown outcomes omit invoice ID.
    invoiceId:outcome==="invoice_seen_by_readback"&&evidenceRecorded?confirmedId:null,
    providerPostAttempts:1,
    automaticallyRetry:false,
    fulfillmentAllowed:false,
    checkoutReleaseAllowed:false,
    splitActivationAllowed:false,
    productionReady:false,
  });
}
