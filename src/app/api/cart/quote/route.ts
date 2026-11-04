import {NextRequest,NextResponse} from "next/server";
import {normalizeCartSelections,buildCartReview}
 from "@/lib/cart/customer-cart.mjs";

export const dynamic="force-dynamic";
const APEX_ORIGIN="https://fhqpkpztercadcxspdkg.supabase.co";
const HEADERS={"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"};
const fail=(reason:string,status=409)=>NextResponse.json(
 {ok:false,reason,canPlaceOrder:false,canPay:false},
 {status,headers:HEADERS});

export async function POST(request:NextRequest){
 if(process.env.APEX_PUBLIC_SOLD_OUT_CATALOG!=="enabled")
  return fail("Catalog items or inventory are currently unavailable",503);
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
 const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 if(url!==APEX_ORIGIN||!key?.startsWith("sb_publishable_"))
  return fail("Catalog verification unavailable",503);
 if(request.headers.get("content-type")?.split(";")[0]!=="application/json")
  return fail("Invalid request",415);
 let body:unknown;
 try{
  const raw=await request.text();
  if(raw.length>2400)return fail("Cart is too large",413);
  body=JSON.parse(raw);
 }catch{return fail("Invalid cart selection",400);}
 if(!body||typeof body!=="object"||Array.isArray(body))
  return fail("Invalid cart selection",400);
 const values=body as Record<string,unknown>;
 if(Object.keys(values).length!==3||Object.keys(values).some(k=>
   !["items","boxSize","code"].includes(k))||
   !Array.isArray(values.items)||values.items.length<1||
   !normalizeCartSelections(values.items).length||
   (values.boxSize!=="auto"&&values.boxSize!=="medium")||
   typeof values.code!=="string"||
   (values.code!==""&&!/^[A-Z0-9_-]{3,24}$/.test(values.code)))
  return fail("Invalid cart selection",400);
 const items=normalizeCartSelections(values.items);
 try{
  const result=await fetch(APEX_ORIGIN+"/rest/v1/rpc/get_public_cart_quote_source",{
   method:"POST",cache:"no-store",signal:AbortSignal.timeout(6000),
   headers:{"apikey":key,"Content-Type":"application/json",Accept:"application/json"},
   body:JSON.stringify({p_items:items,p_code:values.code}),
  });
  if(!result.ok)return fail("Catalog verification unavailable",503);
  const source:unknown=await result.json();
  const review=buildCartReview(source,{
   items,code:values.code,boxSize:values.boxSize,
  });
  if(!review.ok)return fail(review.reason);
  return NextResponse.json(review,{status:200,headers:HEADERS});
 }catch{return fail("Catalog verification unavailable",503);}
}
export async function GET(){
 return fail("Cart verification requires a POST request",405);
}
