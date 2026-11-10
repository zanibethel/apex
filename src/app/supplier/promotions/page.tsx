import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {ChatOperationsTools} from "@/app/chat-operations-tools";

export const dynamic="force-dynamic";
export const metadata={title:"Supplier Promotions | Apex",robots:{index:false,follow:false}};
export default async function SupplierPromotionsPage(){
 const workspace=await getSupplierWorkspace();
 if(!workspace||!workspace.memberships.some(m=>m.role==="owner"||m.role==="manager"))
  redirect("/supplier/sign-in");
 return <main className="container supplier-shell">
  <Link className="back" href="/supplier">← Supplier dashboard</Link>
  <p className="eyebrow">APEX / SUPPLIER / PROMOTIONS</p><h1>Notices and discounts</h1>
  <p className="lead">These controls are also available inside the supplier chat.
   Set a headline, schedule the banner, and confirm to save.</p>
  <section className="supplier-panel" style={{maxWidth:"none"}}><h2>Rotating storefront notices</h2>
   <ChatOperationsTools mode="banners"/>
  </section>
  <section className="supplier-panel" style={{maxWidth:"none",marginTop:20}}><h2>Discount codes</h2>
   <ChatOperationsTools mode="discounts"/>
  </section>
  <p className="notice">Public notices are display-only. Checkout and payments remain separately gated.</p>
 </main>;
}
