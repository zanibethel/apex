/**
 * Strict, POST-only, same-origin, bounded JSON transport boundary.
 * Returns delivery details exclusively to trusted server code; caller must
 * not serialize the successful result, log it, or store it in client state.
 *
 * Not exposed by the production checkout route while admission is disabled.
 */
import {parseCustomerCheckoutHandoffV1} from "./customer-handoff-v1.mjs";

export const APEX_CHECKOUT_ORIGIN_V1="https://apexanabolics.co";
export const APEX_CHECKOUT_MAX_BODY_BYTES_V1=8192;
const deny=()=>Object.freeze({ok:false,code:"INVALID_CHECKOUT_REQUEST"});
const goodHeaders=(headers)=>{
 if(!headers||typeof headers.get!=="function")return false;
 const origin=headers.get("origin");
 const fetchSite=headers.get("sec-fetch-site");
 const contentType=headers.get("content-type");
 const length=headers.get("content-length");
 const encoding=headers.get("content-encoding");
 if(origin!==APEX_CHECKOUT_ORIGIN_V1||
  (fetchSite!==null&&fetchSite!=="same-origin")||
  !/^application\/json(?:;\s*charset=utf-8)?$/i.test(contentType??"")||
  (encoding!==null&&encoding.toLowerCase()!=="identity"))return false;
 if(length!==null){
  if(!/^(0|[1-9][0-9]*)$/.test(length))return false;
  const declared=Number(length);
  if(!Number.isSafeInteger(declared)||declared<1||
   declared>APEX_CHECKOUT_MAX_BODY_BYTES_V1)return false;
 }
 return true;
};

export async function readNonpayableCheckoutRequestV1(request){
 if(!request||request.method!=="POST"||
  !goodHeaders(request.headers)||request.bodyUsed===true)return deny();
 let reader;
 try{
  const url=new URL(request.url);
  if(url.origin!==APEX_CHECKOUT_ORIGIN_V1||
   url.pathname!=="/api/checkout/handoff/v1"||
   url.search!==""||url.hash!=="")return deny();
  if(!request.body||typeof request.body.getReader!=="function")
   return deny();
  reader=request.body.getReader();
  let size=0;
  const chunks=[];
  for(;;){
   const next=await reader.read();
   if(next.done)break;
   if(!(next.value instanceof Uint8Array))return deny();
   size+=next.value.byteLength;
   if(size>APEX_CHECKOUT_MAX_BODY_BYTES_V1)return deny();
   chunks.push(next.value);
  }
  if(size<1)return deny();
  const buffer=Buffer.concat(chunks.map(v=>Buffer.from(v)),size);
  // TextDecoder fatal mode rejects malformed UTF-8 rather than replacing
  // bytes that could change normalized request identifiers.
  const body=JSON.parse(new TextDecoder("utf-8",{fatal:true})
   .decode(buffer));
  const parsed=parseCustomerCheckoutHandoffV1(body);
  if(!parsed.ok)return deny();
  return Object.freeze({ok:true,request:parsed.request});
 }catch{
  return deny();
 }finally{
  if(reader){
   try{await reader.cancel();}catch{}
   try{reader.releaseLock();}catch{}
  }
 }
}
