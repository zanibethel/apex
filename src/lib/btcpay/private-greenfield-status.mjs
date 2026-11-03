// Private, read-only BTCPay Greenfield connection checks.
// Never import this module into a client component or create invoices here.
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STORE=/^[A-Za-z0-9_-]{1,100}$/;
const KEY_ENV=/^APEX_BTCPAY_KEY_[A-Z0-9_]{1,64}$/;
const MAX_BINDINGS=20;

function canonicalHttpsOrigin(input){
 if(typeof input!=="string"||input.length>250)return null;
 try{
  const url=new URL(input);
  const host=url.hostname.toLowerCase();
  if(url.protocol!=="https:"||url.username||url.password||
   url.pathname!=="/"||url.search||url.hash||
   host==="localhost"||host.endsWith(".localhost")||
   host.endsWith(".local")||host.endsWith(".internal")||
   /^\d{1,3}(\.\d{1,3}){3}$/.test(host)||
   host.startsWith("[")||url.port)return null;
  return url.origin;
 }catch{return null;}
}
export function parsePrivateGreenfieldBindings(raw){
 if(raw===undefined||raw===null||raw==="")
  return {state:"unconfigured",bindings:[]};
 if(typeof raw!=="string"||raw.length>12000)
  return {state:"invalid",bindings:[]};
 let parsed;
 try{parsed=JSON.parse(raw);}catch{return {state:"invalid",bindings:[]};}
 if(!Array.isArray(parsed)||parsed.length<1||parsed.length>MAX_BINDINGS)
  return {state:"invalid",bindings:[]};
 const seenApex=new Set(),seenProvider=new Set(),seenKeys=new Set(),bindings=[];
 for(const b of parsed){
  if(!b||typeof b!=="object"||Array.isArray(b)||
   Object.keys(b).sort().join(",")!==
    "apexStoreId,keyEnv,providerStoreId,providerUrl"||
   typeof b.apexStoreId!=="string"||!UUID.test(b.apexStoreId)||
   typeof b.providerStoreId!=="string"||!STORE.test(b.providerStoreId)||
   typeof b.keyEnv!=="string"||!KEY_ENV.test(b.keyEnv))
   return {state:"invalid",bindings:[]};
  const origin=canonicalHttpsOrigin(b.providerUrl);
  if(!origin||seenApex.has(b.apexStoreId)||seenKeys.has(b.keyEnv)||
   seenProvider.has(origin+":"+b.providerStoreId))
   return {state:"invalid",bindings:[]};
  seenApex.add(b.apexStoreId);
  seenKeys.add(b.keyEnv);
  seenProvider.add(origin+":"+b.providerStoreId);
  bindings.push(Object.freeze({
   apexStoreId:b.apexStoreId,providerStoreId:b.providerStoreId,
   keyEnv:b.keyEnv,providerOrigin:origin,
  }));
 }
 return {state:"configured",bindings:Object.freeze(bindings)};
}
function status(kind,providerName=null,defaultCurrency=null){
 return Object.freeze({status:kind,providerName,defaultCurrency});
}
/**
 * @param {{apexStoreId:string,rawBindings?:string,
 * env?:Record<string,string|undefined>,fetchImpl?:typeof fetch}} options
 */
export async function probePrivateGreenfieldStore({
 apexStoreId,rawBindings,env={},fetchImpl=fetch,
}){
 if(typeof apexStoreId!=="string"||!UUID.test(apexStoreId))
  return status("invalid_store");
 const config=parsePrivateGreenfieldBindings(rawBindings);
 if(config.state!=="configured")
  return status(config.state==="unconfigured"?"no_bindings":"invalid_bindings");
 const binding=config.bindings.find(b=>b.apexStoreId===apexStoreId);
 if(!binding)return status("no_store_binding");
 const apiKey=env[binding.keyEnv];
 if(!apiKey)return status("missing_key");
 if(typeof apiKey!=="string"||apiKey.length<16||apiKey.length>300||
    /[^\x21-\x7E]/.test(apiKey))
  return status("invalid_key");
 const endpoint=binding.providerOrigin+"/api/v1/stores/"+
  encodeURIComponent(binding.providerStoreId);
 let response;
 try{
  response=await fetchImpl(endpoint,{
   method:"GET",headers:{Accept:"application/json",
    Authorization:"token "+apiKey},
   redirect:"error",cache:"no-store",signal:AbortSignal.timeout(5500),
  });
 }catch{return status("unreachable");}
 if(response.status===401||response.status===403)return status("key_denied");
 if(response.status===404)return status("store_not_found");
 if(!response.ok)return status("provider_error");
 let json;
 try{
  const raw=await response.text();
  if(raw.length>16000)return status("invalid_response");
  json=JSON.parse(raw);
 }catch{return status("invalid_response");}
 if(!json||typeof json!=="object"||Array.isArray(json)||
   json.id!==binding.providerStoreId||
   typeof json.name!=="string"||!json.name.trim()||
   json.name.length>180)return status("store_mismatch");
 if(json.defaultCurrency!=="USD")return status("currency_mismatch");
 return status("store_verified",json.name,"USD");
}
