/**
 * Private read-only provider response guard. Limits HTTP response bytes while
 * streaming, BEFORE JSON parsing. Do not log provider bodies or credentials.
 * No payments, invoices, writes or network requests originate here.
 */
const MAX_BODY_BYTES=16000;

/**
 * Returns the bounded UTF-8 JSON text or null. Real Response objects are
 * required to supply their readable body; the limited text() fallback only
 * supports lightweight test doubles that have no body property.
 */
export async function readBoundedProviderJsonText(response){
 if(!response||typeof response!=="object")return null;
 const headers=response.headers;
 if(headers&&typeof headers.get==="function"){
  const rawLength=headers.get("content-length");
  if(rawLength!==null){
   if(typeof rawLength!=="string"||
    !/^(0|[1-9][0-9]{0,9})$/.test(rawLength)||
    Number(rawLength)>MAX_BODY_BYTES)return null;
  }
  const contentType=headers.get("content-type");
  if(contentType!==null&&
   !/^application\/(?:json|[a-z0-9.!#$&^_-]+\+json)(?:\s*;|\s*$)/i.test(contentType))
   return null;
 }
 const stream=response.body;
 if(stream&&typeof stream.getReader==="function"){
  let reader;
  try{
   reader=stream.getReader();
   const chunks=[];let size=0;
   while(true){
    const part=await reader.read();
    if(part.done)break;
    if(!(part.value instanceof Uint8Array))return null;
    size+=part.value.byteLength;
    if(size>MAX_BODY_BYTES){
     try{await reader.cancel();}catch{/* body intentionally discarded */}
     return null;
    }
    chunks.push(part.value);
   }
   const data=new Uint8Array(size);let offset=0;
   for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.byteLength;}
   return new TextDecoder("utf-8",{fatal:true}).decode(data);
  }catch{return null;}
  finally{try{reader?.releaseLock();}catch{/* already released */}}
 }
 if("body" in response)return null;
 // Compatibility for tests that supply a mock response without a stream.
 // Actual fetch Response objects always expose a body property.
 if(typeof response.text!=="function")return null;
 try{
  const value=await response.text();
  return typeof value==="string"&&
   new TextEncoder().encode(value).byteLength<=MAX_BODY_BYTES?value:null;
 }catch{return null;}
}
