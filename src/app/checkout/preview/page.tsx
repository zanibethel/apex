import {notFound,redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";

// Deprecated internal sample checkout route. The only supported Admin checkout
// screen is the saved-catalog review; never render fictional payment handoffs.
export const dynamic="force-dynamic";
export const metadata={
 title:"Checkout | Apex",
 robots:{index:false,follow:false},
};

export default async function LegacyCheckoutRedirect(){
 const client=await createSupplierServerClient();
 if(!client)notFound();
 const {data,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(data.user))notFound();
 redirect("/admin/checkout-review");
}
