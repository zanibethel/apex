import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {OrderAdmissionWorkspace} from "./order-admission-workspace";

export const dynamic="force-dynamic";
export const metadata={
 title:"Order Readiness | Apex Admin",robots:{index:false,follow:false},
};
const STORE_ID="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";

export default async function AdminOrderAdmissionPage(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))redirect("/admin/sign-in");
 const {data:products,error}=await client.from("products")
  .select("id,name,sku")
  .eq("store_id",STORE_ID).order("name",{ascending:true}).limit(100);
 const list=error?[]:(products??[]).filter(p=>typeof p.id==="string"&&
  typeof p.name==="string"&&typeof p.sku==="string");
 return <main className="container supplier-shell apex-branded-dashboard"
  style={{minWidth:0,overflowWrap:"anywhere"}}>
  <Link className="back" href="/admin">← Admin dashboard</Link>
  <p className="eyebrow">APEX / ADMIN / ORDER READINESS</p>
  <h1>Order admission review</h1>
  <p className="notice">Inspect an order using saved private product, inventory,
   authorization, shipping and discount records. This page does not release
   products, reserve stock, submit an order, or create Bitcoin invoices.</p>
  {error?<p role="status" className="notice">Product list unavailable.
    No order can be prepared.</p>:list.length===0?
   <p className="notice">No products are currently available for review.</p>:
   <OrderAdmissionWorkspace products={list}/>}
  <div className="actions" style={{marginTop:20}}>
   <Link href="/admin/catalog-release" className="button secondary">Catalog release</Link>
   <Link href="/admin/checkout-readiness" className="button secondary">Checkout readiness</Link>
   <Link href="/admin/checkout-rules" className="button secondary">Shipping settings</Link>
  </div>
 </main>;
}
