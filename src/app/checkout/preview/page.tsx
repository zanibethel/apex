import {notFound} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {CheckoutPreview} from "./checkout-preview";
import "./checkout-preview.css";

// Internal design verification only. Never exposed as a customer checkout,
// including when legacy checkout-demo mode is enabled.
export const dynamic="force-dynamic";
export const metadata={
 title:"Checkout Design Review | Apex",
 description:"Restricted checkout interaction test. No orders or payments.",
 robots:{index:false,follow:false},
};

export default async function CheckoutPreviewPage(){
 if(process.env.APEX_CHECKOUT_MODE!=="demo")notFound();
 const client=await createSupplierServerClient();
 if(!client)notFound();
 const {data,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(data.user))notFound();
 return <CheckoutPreview/>;
}
