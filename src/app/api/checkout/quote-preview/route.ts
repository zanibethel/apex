import {NextResponse} from "next/server";
import {calculateDemoServerQuote,DemoQuoteInputError} from "@/lib/checkout/server-demo-quote.mjs";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store, private","X-Content-Type-Options":"nosniff"};
const MAX_BYTES=2048;
const error=(status:number,code:string)=>NextResponse.json({
 mode:"demo_only",payable:false,canCreateOrder:false,
 canCreatePayment:false,error:code,
},{status,headers});

// This endpoint is exclusively for fictional UI verification. It creates
// no orders, payments, BTC invoice, records, reservations or credentials.
export async function POST(request:Request){
 if(process.env.APEX_CHECKOUT_MODE!=="demo")
  return error(404,"not_available");
 const origin=request.headers.get("origin");
 const fetchSite=request.headers.get("sec-fetch-site");
 // Reject cross-site form submissions. Origin must be the exact request host.
 if((origin&&origin!==new URL(request.url).origin)||
    fetchSite==="cross-site")
  return error(403,"origin_not_allowed");
 const type=request.headers.get("content-type")??"";
 if(!/^application\/json(?:\s*;|$)/i.test(type))
  return error(415,"json_only");
 const declaredSize=Number(request.headers.get("content-length")??"0");
 if(!Number.isFinite(declaredSize)||declaredSize>MAX_BYTES)
  return error(413,"request_too_large");
 let body:string;
 try{body=await request.text();}
 catch{return error(400,"invalid_request");}
 if(Buffer.byteLength(body,"utf8")>MAX_BYTES)
  return error(413,"request_too_large");
 try{
  const response=calculateDemoServerQuote(JSON.parse(body));
  return NextResponse.json(response,{status:200,headers});
 }catch(e){
  if(e instanceof DemoQuoteInputError || e instanceof SyntaxError)
   return error(400,"invalid_demo_cart");
  // No internal DB or provider information exposed.
  return error(503,"quote_unavailable");
 }
}
