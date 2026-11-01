/**
 * CI-ONLY bridge: a HMAC-validated, independently Greenfield-verified regtest
 * webhook becomes one atomic private Postgres order-status observation.
 * Requires disposable PostgreSQL fixture; never writes hosted Supabase.
 */
import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {fileURLToPath} from "node:url";
const execAsync=promisify(execFile);
const id=/^[a-zA-Z0-9_-]{1,100}$/;
const hash=/^[a-f0-9]{64}$/;
const status=new Set(["New","Processing","Settled","Expired","Invalid"]);
const extra=new Set(["None","PaidPartial","PaidOver","PaidLate","Marked","Invalid"]);
const events=new Set(["InvoiceSettled","InvoiceProcessing","InvoiceReceivedPayment"]);
const initialized= new URL("../tests/payout-rls/btcpay-live-journal-seed.sql",import.meta.url);
const record= new URL("../tests/payout-rls/btcpay-live-journal-record.sql",import.meta.url);
const verify= new URL("../tests/payout-rls/btcpay-live-journal-check.sql",import.meta.url);

export function createEphemeralPgBridge({
  testOnly,network,runPsql,
}={}){
  if(testOnly!==true||network!=="regtest")
    throw Error("Disposable regtest PostgreSQL bridge only");
  const exec=runPsql||async(args)=>{
    const {stdout}=await execAsync("psql",args,{
      encoding:"utf8",timeout:20000,maxBuffer:1024*512,
      stdio:["ignore","pipe","pipe"],
    });
    return stdout.trim();
  };
  const run=async(file,values)=>{
    const args=["-X","-v","ON_ERROR_STOP=1","-At"];
    for(const [key,value] of Object.entries(values)){
      if(!/^[a-z_]+$/.test(key)||typeof value!=="string" ||
         !/^[a-zA-Z0-9_-]{1,100}$/.test(value))
        throw Error("Unsafe ephemeral SQL parameter");
      args.push("-v",key+"="+value);
    }
    args.push("-f",fileURLToPath(file));
    try{return String(await exec(args)).trim();}
    catch{throw Error("Disposable PostgreSQL journal transaction failed");}
  };
  let order;
  async function initialize({storeId,invoiceId,orderId,amountSats}){
    if(order||![storeId,invoiceId,orderId].every(x=>id.test(x))||
       typeof amountSats!=="bigint"||amountSats<1000n||
       amountSats>100000000n)
      throw Error("Invalid or repeated synthetic order snapshot");
    const variables={store_id:storeId,invoice_id:invoiceId,
      order_id:orderId,amount_sats:amountSats.toString()};
    if(await run(initialized,variables)!=="seeded")
      throw Error("Synthetic order snapshot was not durably saved");
    order=Object.freeze({storeId,invoiceId,orderId,amountSats});
  }
  async function recordVerified({event,invoice,payloadSha256}){
    if(!order || !event||!invoice||
       !events.has(event.type)||!id.test(event.deliveryId)||
       event.storeId!==order.storeId||event.invoiceId!==order.invoiceId||
       invoice.id!==order.invoiceId||invoice.storeId!==order.storeId||
       invoice.metadata?.orderId!==order.orderId||
       invoice.currency!=="BTC"||!hash.test(payloadSha256)||
       !status.has(invoice.status)||!extra.has(invoice.additionalStatus))
      throw Error("Untrusted or uninitialized synthetic event");
    // Both caller and DB use exact integer satoshi snapshot; no JS floats.
    const amount=String(invoice.amount);
    if(!/^(0|[1-9]\d{0,7})(?:\.\d{1,8})?$/.test(amount))
      throw Error("Invalid BTC invoice amount");
    const [whole,fract=""]=amount.split(".");
    const sats=BigInt(whole)*100000000n+BigInt(fract.padEnd(8,"0"));
    if(sats!==order.amountSats)
      throw Error("Provider amount differs from immutable test snapshot");
    const answer=await run(record,{
      store_id:order.storeId,invoice_id:order.invoiceId,
      order_id:order.orderId,amount_sats:order.amountSats.toString(),
      delivery_id:event.deliveryId,event_type:event.type,
      payload_hash:payloadSha256,provider_status:invoice.status,
      additional_status:invoice.additionalStatus,
    });
    if(answer!=="accepted"&&answer!=="duplicate")
      throw Error("Disposable journal rejected verified event");
    return answer;
  }
  async function assertSettledOnce(){
    if(!order)throw Error("Missing snapshot");
    if(await run(verify,{
      store_id:order.storeId,invoice_id:order.invoiceId,
      order_id:order.orderId,amount_sats:order.amountSats.toString(),
    })!=="passed")
      throw Error("Webhook did not persist exactly one settled observation");
    return true;
  }
  return Object.freeze({initialize,recordVerified,assertSettledOnce});
}
