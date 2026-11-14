import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {ControlledCartQa} from "./controlled-cart-qa";
import "./cart-qa.css";

export const dynamic="force-dynamic";
export const metadata={title:"Cart & Inventory QA | Apex Admin",robots:{index:false,follow:false}};

export default async function ControlledCartQaPage(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(data.user))redirect("/admin/sign-in");
 return <main className="container supplier-shell apex-cart-qa">
  <Link href="/admin" className="back">← Admin dashboard</Link>
  <p className="eyebrow">APEX / ADMIN / CHECKOUT READINESS</p>
  <h1>Cart &amp; inventory test</h1>
  <p className="notice"><strong>Synthetic in-stock product, not a public listing.</strong>
   This safe test uses Apex’s existing cart pricing, discount, and automatic shipping
   calculations. The server—not your browser—sets the test price and available
   quantity. No live Supabase inventory is changed, no purchase is placed,
   and checkout, BTCPay invoices and shipping stay disabled.</p>
  <ControlledCartQa/>
  <div className="actions" style={{marginTop:22}}>
   <Link href="/cart" className="button secondary">Customer cart (real Sold Out products)</Link>
   <Link href="/admin/checkout-integration" className="button secondary">Checkout integration status</Link>
  </div>
 </main>;
}
