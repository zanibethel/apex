import {NextResponse} from "next/server";
// Temporary diagnostic for preview-only cross-service verification; remove before merging.
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(){
 const headers={"Cache-Control":"no-store"};
 if(process.env.VERCEL_ENV!=="preview")return NextResponse.json({error:"Not found"},{status:404,headers});
 const endpoint=process.env.COOPERATIVE_APEX_CHAT_URL;
 const token=process.env.COOPERATIVE_APEX_CHAT_TOKEN;
 if(!endpoint||!token||token.length<32)return NextResponse.json({connected:false,reason:"not-configured"},{headers});
 try {
  const url=new URL(endpoint);
  if(url.protocol!=="https:")return NextResponse.json({connected:false,reason:"invalid-url"},{headers});
  const response=await fetch(url,{
   method:"POST",
   headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify({version:1,message:"hello",catalogState:"unavailable",products:[]}),
   cache:"no-store",
   signal:AbortSignal.timeout(4000),
  });
  let body:unknown=null;
  try{body=await response.json();}catch{}
  const v=body&&typeof body==="object"&&!Array.isArray(body)?body as Record<string,unknown>:{};
  const connected=response.status===200&&v.source==="cooperative-code-v1";
  return NextResponse.json({connected,status:response.status,source:connected?"cooperative-code-v1":"unverified"},{headers});
 }catch{return NextResponse.json({connected:false,reason:"network-or-timeout"},{headers});}
}
