import {NextRequest,NextResponse} from "next/server";
import {createSupplierServerClient} from "@/lib/supabase/server";

export const runtime="nodejs";
export const dynamic="force-dynamic";
export const revalidate=0;
const BASE="https://apexanabolics.co";
type ConfirmationResult="confirmed"|"check"|"invalid";
function finish(status:ConfirmationResult){
 // The status is informational only, never a substitute for getUser()
 // on protected routes. Keep token hashes and session codes off redirects.
 const url=BASE+"/account/verified?status="+status;
 const response=NextResponse.redirect(url,{status:303});
 response.headers.set("Cache-Control","private, no-store");
 response.headers.set("Referrer-Policy","no-referrer");
 response.headers.set("X-Robots-Tag","noindex, nofollow");
 return response;
}
const HASH=/^[A-Za-z0-9_-]{16,512}$/;
export async function GET(request:NextRequest){
 const params=request.nextUrl.searchParams;
 const tokenHash=params.get("token_hash");
 const code=params.get("code");
 const type=params.get("type");

 // Supabase's default {{ .ConfirmationURL }} confirms the user *before*
 // redirecting here, often with no token or code, especially when Gmail
 // opens in a different browser. That is not proof of a failed confirmation.
 // Ask the user to sign in; never claim verification without an Auth session.
 if(!tokenHash&&!code)return finish("check");
 if((tokenHash&&code)||
    (tokenHash&&(type!=="email"||!HASH.test(tokenHash)))||
    (code&&!HASH.test(code)))return finish("invalid");
 const client=await createSupplierServerClient();
 if(!client)return finish("invalid");
 try{
  const result=tokenHash?
   await client.auth.verifyOtp({type:"email",token_hash:tokenHash}):
   await client.auth.exchangeCodeForSession(code!);
  // Successful Auth verification must not be labeled invalid merely because
  // the browser receiving the email does not yet have a signed-in cookie.
  // /account/verified checks getUser before granting a profile link.
  return finish(result.error?"invalid":"confirmed");
 }catch{return finish("invalid");}
}
