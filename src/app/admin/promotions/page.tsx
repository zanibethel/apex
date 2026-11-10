import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {ChatOperationsTools} from "@/app/chat-operations-tools";

export const dynamic="force-dynamic";
export const metadata={title:"Promotions & Notices | Apex Admin",robots:{index:false,follow:false}};
export default async function AdminPromotionsPage(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(data.user))redirect("/admin/sign-in");
 return <main className="container supplier-shell apex-branded-dashboard">
  <Link className="back" href="/admin">← Admin dashboard</Link>
  <p className="eyebrow">APEX / PROMOTIONS</p><h1>Promotion and announcement control</h1>
  <p className="lead">Create rotating storefront notices, schedule start and expiration times,
   and manage discount-code drafts. These are the same protected tools available in chat.</p>
  <section className="supplier-panel" style={{maxWidth:"none"}}><h2>Top banner notices</h2>
   <ChatOperationsTools mode="banners" isAdmin/>
  </section>
  <section className="supplier-panel" style={{maxWidth:"none",marginTop:20}}><h2>Discount codes</h2>
   <ChatOperationsTools mode="discounts" isAdmin/>
  </section>
  <p className="notice">Announcements do not enable checkout or bypass product release rules.
   Discount creation remains subject to the existing draft-promotion write gate.</p>
 </main>;
}
