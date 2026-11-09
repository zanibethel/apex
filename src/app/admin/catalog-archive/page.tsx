import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";

export const dynamic="force-dynamic";
export const metadata={title:"Archived product records | Apex Admin",robots:{index:false,follow:false}};

export default async function ArchiveReview(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))redirect("/admin/sign-in");
 const {data:products,error,count}=await client.from("products")
  .select("id,sku,name,price_cents,created_at,archived_at,is_active,is_published,store_id",{count:"exact"})
  .not("archived_at","is",null).order("archived_at",{ascending:false}).limit(100);
 if(error||count===null||!products||products.length!==count)
  return <main className="container supplier-shell">
   <Link href="/admin">← Admin</Link>
   <h1>Archive unavailable</h1>
   <p>The complete archived catalog could not be verified. No partial data is displayed.</p>
  </main>;
 const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
 return <main className="container supplier-shell" style={{maxWidth:980}}>
  <Link href="/admin">← Admin dashboard</Link>
  <p className="eyebrow">ADMIN / HISTORICAL CATALOG · PRIVATE</p>
  <h1>Archived product records</h1>
  <p className="notice">These {products.length} records are preserved with their original identities, prices and audit links. They have not been deleted. Archived entries are hidden from active supplier editing, chat and storefront testing. This view cannot publish, sell, edit or restore products.</p>
  {products.length===0?<p>No archived records found.</p>:
   <div className="supplier-panel" style={{overflowX:"auto"}}>
    <table style={{width:"100%",borderCollapse:"collapse",minWidth:460}}>
     <thead><tr><th scope="col">Historical product</th><th scope="col">SKU</th><th scope="col">Saved price</th><th scope="col">Archived</th></tr></thead>
     <tbody>{products.map(p=><tr key={p.id}>
      <td style={{padding:"10px 6px"}}>{p.name}</td>
      <td style={{padding:"10px 6px"}}>{p.sku}</td>
      <td style={{padding:"10px 6px"}}>{money(Number(p.price_cents))}</td>
      <td style={{padding:"10px 6px"}}>{new Date(p.archived_at).toLocaleDateString("en-US")}</td>
     </tr>)}</tbody>
    </table>
   </div>}
  <p className="notice">To restore a legacy record, use a reviewed admin recovery migration. The public release gate and BTCPay are unchanged.</p>
  <Link href="/admin/storefront-preview" className="button secondary">View active retail samples</Link>
 </main>;
}
