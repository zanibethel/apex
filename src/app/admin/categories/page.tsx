import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {
 parseAdminCategories,categoryPublicationSummary,
} from "@/lib/catalog/admin-category-publication.mjs";
import {AdminCategoryPublicationForm} from "./form";

export const dynamic="force-dynamic";
export const metadata={title:"Category Controls | Apex",
 robots:{index:false,follow:false}};

export default async function AdminCategories(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))
  redirect("/admin/sign-in");
 // A deliberately narrow SECURITY DEFINER readback handles global admin
 // visibility without widening category RLS or using a service-role client.
 const result=await client.rpc("get_admin_category_publication_overview");
 const categories=result.error?null:parseAdminCategories(result.data);
 const summary=categoryPublicationSummary(categories);
 return <main className="container supplier-shell apex-branded-dashboard"
  style={{minWidth:0,overflowWrap:"anywhere"}}>
  <Link className="back" href="/admin">← Admin dashboard</Link>
  <p className="eyebrow">APEX / ADMIN / CATALOG CATEGORIES</p>
  <h1>Category publishing</h1>
  <p className="lead">Manage the category visibility setting for each
   private supplier storefront.</p>
  <p className="notice"><strong>Publishing a category does not publish its
   products.</strong> Product Publish/Unpublish settings, admin holds,
   independent eligibility reviews and the site-wide release gate still
   determine what appears to customers. Checkout is unavailable.</p>
  <section className="feature-grid" aria-label="Category publishing summary">
   {[
    ["Categories",summary.total],
    ["Published categories",summary.published],
    ["Unpublished categories",summary.unpublished],
    ["Product records",summary.products],
   ].map(([label,value])=><article key={label} className="feature-card">
    <p className="eyebrow">{label}</p>
    <h2>{value===null?"Unavailable":value}</h2>
   </article>)}
  </section>
  {categories===null?
   <p role="status" className="notice">Category publishing data is
    unavailable. The authenticated administration RPC may not be installed.
    Nothing has been changed.</p>
  :categories.length===0?
   <p className="notice">No private storefront categories were found.</p>
  :<div className="apex-product-grid" style={{marginTop:24}}>
   {categories.map(c=><article key={c.storeId+":"+c.categoryId}
     className="apex-product-card">
    <div className="apex-product-card-head">
     <p className="eyebrow">{c.published?"Published category":"Category not published"}</p>
     <h2>{c.categoryName}</h2>
    </div>
    <p className="notice"><strong>Store:</strong> {c.storeName}</p>
    <p className="notice"><strong>Products:</strong> {c.productCount} total
     {" · "}{c.activeCount} active</p>
    <p className="notice">This control does not approve products or enable
     Bitcoin payments. Publishing requires a brief internal audit note.</p>
    <AdminCategoryPublicationForm storeId={c.storeId}
     categoryId={c.categoryId} published={c.published}/>
   </article>)}
  </div>}
  <div className="actions">
   <Link className="button secondary" href="/admin/catalog-release">
    View product release status</Link>
   <Link className="button secondary" href="/admin/listing-controls">
    Review admin holds</Link>
   <Link className="button secondary" href="/supplier/catalog/bulk">
    Supplier product editor</Link>
  </div>
 </main>;
}
