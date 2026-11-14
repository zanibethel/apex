import {CustomerCartPage} from "./customer-cart-page";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isRetailNonpayableSubmissionEnabledV1}
 from "@/lib/checkout/retail-nonpayable-route-release-v1.mjs";

export const dynamic="force-dynamic";
export const revalidate=0;
export const metadata={title:"Your Cart | Apex Anabolics",robots:{index:false,follow:false}};

export default async function CartPage(){
 const enabled=isRetailNonpayableSubmissionEnabledV1(process.env);
 let signedIn=false;
 if(enabled){
  try{
   const client=await createSupplierServerClient();
   if(client){
    const {data,error}=await client.auth.getUser();
    signedIn=Boolean(!error&&data.user&&
     data.user.aud==="authenticated"&&
     data.user.is_anonymous!==true&&data.user.email_confirmed_at);
   }
  }catch{
   signedIn=false;
  }
 }
 return <CustomerCartPage nonpayableEnabled={enabled} signedIn={signedIn}/>;
}
