/**
 * Read-only health assessment for the initial ONE BTCPay provider store.
 * Does not create invoices, configure Prism, authorize wallet access, or
 * activate payments. Never return API keys or wallet destinations.
 */
import {parsePrivateGreenfieldBindings,probePrivateGreenfieldStore} from "./private-greenfield-status.mjs";

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READ_ENV="APEX_BTCPAY_KEY_READ_ONLY";
const WRITER_ENV="APEX_BTCPAY_KEY_INVOICE_WRITER";
function checkedRecipientDirectory(rows){
 if(!Array.isArray(rows))return "unavailable";
 const platform=rows.filter(r=>r?.recipient_type==="platform");
 const suppliers=rows.filter(r=>r?.recipient_type==="supplier");
 if(rows.length!==3||platform.length!==1||suppliers.length!==2)
  return "three_recipients_required";
 if(rows.some(r=>r.status!=="active"))return "inactive_recipients";
 // Active *database directory* entries do not establish wallet ownership.
 return "directory_only_wallets_unverified";
}
function result(storeStatus,recipientStatus,writerStatus,providerName=null){
 return Object.freeze({
  storeStatus,recipientStatus,writerStatus,providerName,
  readScopeStatus:"independent_permission_review_required",
  prismSyncStatus:"not_implemented",
  feeAndRefundPolicyStatus:"operator_review_required",
  freezeAndDrainStatus:"not_implemented",
  confirmedWalletCount:0,
  canCreateInvoice:false,canExecutePayout:false,canReleaseCheckout:false,
  canShip:false,productionReady:false,
 });
}
/**
 * @param {{
 * apexStoreIds?:string[],rawBindings?:string,
 * env?:Record<string,string|undefined>,recipients?:Array<object>,
 * fetchImpl?:typeof fetch
 * }} options
 */
export async function inspectSharedBtcpayReadinessV1({
 apexStoreIds,rawBindings,env={},recipients,fetchImpl,
}={}){
 const recipientStatus=checkedRecipientDirectory(recipients);
 const writer=env[WRITER_ENV];
 const read=env[READ_ENV];
 const writerStatus=!writer?"not_configured":
   typeof writer!=="string"||writer.length<16?"invalid":
   writer===read?"same_key_rejected":"configured_not_authorized";
 if(!Array.isArray(apexStoreIds)||apexStoreIds.length!==1||
    typeof apexStoreIds[0]!=="string"||!UUID.test(apexStoreIds[0]))
  return result("single_apex_store_required",recipientStatus,writerStatus);
 const config=parsePrivateGreenfieldBindings(rawBindings);
 if(config.state==="unconfigured")return result("no_bindings",recipientStatus,writerStatus);
 if(config.state!=="configured"||config.bindings.length!==1)
  return result("single_provider_binding_required",recipientStatus,writerStatus);
 const binding=config.bindings[0];
 if(binding.apexStoreId!==apexStoreIds[0]||binding.keyEnv!==READ_ENV)
  return result("wrong_store_or_read_key",recipientStatus,writerStatus);
 if(writerStatus==="same_key_rejected")
  return result("credential_reuse_rejected",recipientStatus,writerStatus);
 const probe=await probePrivateGreenfieldStore({
  apexStoreId:apexStoreIds[0],rawBindings,env,
  ...(fetchImpl?{fetchImpl}:{}),
 });
 return result(probe.status,recipientStatus,writerStatus,probe.providerName);
}
