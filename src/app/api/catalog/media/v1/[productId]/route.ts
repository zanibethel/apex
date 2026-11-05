import {NextResponse} from "next/server";

// Browser-facing public image proxy. It cannot access the private database,
// a service-role key, or Supabase private object URLs. The Edge service
// checks BOTH release gates and all per-product approvals on EVERY request.
export const dynamic="force-dynamic";
export const runtime="nodejs";
const SUPABASE_ORIGIN="https://fhqpkpztercadcxspdkg.supabase.co";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[0-9a-f]{12}$/i;
const allowed=new Set(["image/png","image/jpeg","image/webp"]);
const MAX=3145728;
const notFound=()=>NextResponse.json({state:"unavailable"},{
 status:404,headers:{"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"},
});

export async function GET(_req:Request,{params}:{
 params:Promise<{productId:string}>;
}){
 const {productId}=await params;
 if(!UUID.test(productId))return notFound();
 const origin=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(origin!==SUPABASE_ORIGIN||!key||!key.startsWith("sb_publishable_"))
  return notFound();
 try{
  const target=SUPABASE_ORIGIN+"/functions/v1/apex-media-v1/asset/"+productId;
  const response=await fetch(target,{
   method:"GET",headers:{apikey:key,Accept:"image/png,image/jpeg,image/webp"},
   cache:"no-store",redirect:"manual",signal:AbortSignal.timeout(8000),
  });
  const mime=response.headers.get("content-type")?.split(";")[0].trim()??"";
  const size=Number(response.headers.get("content-length")??"0");
  if(response.status!==200||!allowed.has(mime)||
   !Number.isSafeInteger(size)||size<12||size>MAX)return notFound();
  const raw=new Uint8Array(await response.arrayBuffer());
  if(raw.length!==size||raw.length>MAX)return notFound();
  return new Response(raw,{
   status:200,headers:{"Content-Type":mime,
    "Content-Length":String(raw.length),"Cache-Control":"private, no-store, max-age=0",
    "X-Content-Type-Options":"nosniff",
    "Content-Security-Policy":"default-src 'none'; sandbox"},
  });
 }catch{return notFound();}
}
