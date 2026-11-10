import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {classifyAdminRelease,summarizeAdminRelease}
 from "@/lib/catalog/admin-release-board.mjs";
import {draftSetupSteps} from "@/lib/catalog/draft-content-checklist.mjs";
import {privateInventoryState} from "@/lib/catalog/private-inventory-state.mjs";
import {AdminProductDisplayRestrictionForm} from "./restriction-form";

export const dynamic="force-dynamic";
export const metadata={title:"Catalog Release | Apex",robots:{index:false,follow:false}};
const PAGE_LIMIT=100;
const RPC_CONCURRENCY=8;
const formatPrice=(cents:number)=>Number.isSafeInteger(cents)&&cents>=0?
 new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100):"Unavailable";

export default async function CatalogReleaseDashboard({searchParams}:{
 searchParams:Promise<{page?:string|string[]}>,
}){
 const params=await searchParams;
 const rawPage=typeof params.page==="string"?Number(params.page):1;
 const page=Number.isSafeInteger(rawPage)&&rawPage>=1&&rawPage<=100?rawPage:1;
 const from=(page-1)*PAGE_LIMIT;
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!isVerifiedPlatformAdmin(auth.user))redirect("/admin/sign-in");

 const [productsResult,controlsResult,categoriesResult,stockResult,restrictionResult]=await Promise.all([
  client.from("products")
   .select("id,store_id,category_id,sku,name,description,price_cents,is_active,is_published,image_path")
   .order("name",{ascending:true}).range(from,from+PAGE_LIMIT-1),
  client.from("supplier_listing_controls")
   .select("store_id,product_id,supplier_wants_listing,admin_gate,republish_approval_required,republish_approved")
   .limit(250),
  client.from("categories").select("id,store_id,name,is_published").limit(250),
  client.from("inventory_items")
   .select("store_id,product_id,quantity_on_hand,quantity_reserved").limit(250),
  client.rpc("get_admin_retail_product_restrictions"),
 ]);
 const products=productsResult.error?[]:productsResult.data??[];
 type DisplayRestriction={
  store_id:string;product_id:string;product_name:string;product_sku:string;
  store_name:string;reason:string;changed_at:string;
 };
 const restrictionRows:Array<DisplayRestriction>=!restrictionResult.error&&
  Array.isArray(restrictionResult.data)&&restrictionResult.data.every((r:unknown)=>
   Boolean(r)&&typeof r==="object"&&
   ["store_id","product_id","reason","product_name","product_sku","store_name"].every(k=>
    typeof (r as Record<string,unknown>)[k]==="string"))
   ?restrictionResult.data as Array<DisplayRestriction>:[];
 const restrictionsAvailable=!restrictionResult.error&&
  Array.isArray(restrictionResult.data)&&restrictionRows.length===restrictionResult.data.length;
 const restrictionsByProduct=new Map(restrictionRows.map(r=>
  [r.store_id+":"+r.product_id,r]));
 const controls=new Map((controlsResult.error?[]:controlsResult.data??[])
  .map(c=>[c.store_id+":"+c.product_id,c]));
 const categories=new Map((categoriesResult.error?[]:categoriesResult.data??[])
  .map(c=>[c.store_id+":"+c.id,c]));
 const stock=new Map((stockResult.error?[]:stockResult.data??[])
  .map(i=>[i.store_id+":"+i.product_id,i]));

 // This protected RPC verifies both caller identity and product ownership.
 // The UI never infers public visibility from the local Publish toggle.
 const decisions=new Map<string,unknown>();
 if(!productsResult.error)for(let i=0;i<products.length;i+=RPC_CONCURRENCY){
  await Promise.all(products.slice(i,i+RPC_CONCURRENCY).map(async p=>{
   const {data,error}=await client.rpc("get_private_release_readiness",{
    p_store_id:p.store_id,p_product_id:p.id,
   });
   if(!error&&data)decisions.set(p.id,data);
  }));
 }
 const rows=products.map(p=>({
  product:p,
  control:controls.get(p.store_id+":"+p.id),
  category:categories.get(p.store_id+":"+(p.category_id??"")),
  stock:stock.get(p.store_id+":"+p.id),
  decision:decisions.get(p.id),
  publishEnabled:controls.get(p.store_id+":"+p.id)?.supplier_wants_listing===true,
 }));
 const summary=summarizeAdminRelease(rows);
 const extrasUnavailable=Boolean(controlsResult.error||categoriesResult.error||stockResult.error);
 return <main className="container supplier-shell apex-branded-dashboard"
  style={{minWidth:0,overflowWrap:"anywhere"}}>
  <Link href="/admin" className="back">← Admin dashboard</Link>
  <p className="eyebrow">APEX / ADMIN / CATALOG RELEASE</p>
  <h1>Catalog release</h1>
  <p className="lead">Review product publishing, public visibility, and the
   exact reason an offer cannot appear on the storefront.</p>
  <p className="notice"><strong>Read-only release status.</strong> Suppliers
   choose Publish or Unpublish. Admin holds override those settings.
   Public Sold Out listings require verified release eligibility.
   This page cannot approve products, change release permissions,
   create orders, or accept payments.</p>
  <section className="feature-grid" aria-label="Current catalog release counts">
   {[
    ["Products reviewed",summary.total],
    ["Supplier Publish on",summary.publishOn],
    ["Verified public listings",summary.visible],
    ["Blocked by release checks",summary.review],
    ["Publish off",summary.private],
    ["Status unavailable",summary.unavailable],
    ["Retail display restrictions",restrictionsAvailable?restrictionRows.length:"Unavailable"],
    ["Inactive products",productsResult.error?"Unavailable":products.filter(p=>p.is_active!==true).length],
   ].map(([label,value])=><article key={label} className="feature-card">
    <p className="eyebrow">{label}</p><h2>{value}</h2>
   </article>)}
  </section>
  {productsResult.error?<p role="status" className="notice">
    Products cannot be read with the current admin session.
    No release status is asserted.</p>:
   <>
    {!restrictionsAvailable&&<p role="alert" className="notice">
     Admin restriction status is unavailable. No product should be assumed unrestricted until this readback is restored.</p>}
    {extrasUnavailable&&<p role="status" className="notice">
     Some supporting records were not available. Supplier settings,
     categories, or stock are not assumed to be approved.</p>}
    <p className="notice">Product page {page} · showing up to {PAGE_LIMIT} products per page.</p>
    <nav aria-label="Product pages" className="actions">
     {page>1&&<Link className="button secondary"
       href={"/admin/catalog-release?page="+(page-1)}>Previous products</Link>}
     {products.length===PAGE_LIMIT&&page<100&&<Link className="button secondary"
       href={"/admin/catalog-release?page="+(page+1)}>Next products</Link>}
    </nav>
    {!products.length?<p className="notice">No products found in the current
      authorized catalog.</p>:
     <div className="apex-product-grid" style={{marginTop:24}}>
      {rows.map(row=>{
       const p=row.product;
       const status=classifyAdminRelease(row.decision);
       const inventory=row.stock;
       const assessment=privateInventoryState(inventory);
       const setup=draftSetupSteps(p,inventory);
       const missing=setup.steps.filter(step=>!step.complete).map(step=>step.label);
       const restriction=restrictionsByProduct.get(p.store_id+":"+p.id);
       return <article className="apex-product-card" key={p.id}>
        <div className="apex-product-card-head">
         <p className="eyebrow">{status.label}</p>
         <h2>{p.name}</h2>
        </div>
        <p className="notice">SKU {p.sku} · {formatPrice(Number(p.price_cents))}</p>
        <p><strong>Publish:</strong> {row.publishEnabled?"On":"Off"}</p>
        <p><strong>Admin retail restriction:</strong>{" "}
         {!restrictionsAvailable?"Status unavailable":restriction?"Restricted":"None"}</p>
        {restriction&&<p className="apex-review-note"><strong>Reason:</strong> {restriction.reason}</p>}
        {restrictionsAvailable&&<AdminProductDisplayRestrictionForm
         storeId={p.store_id} productId={p.id} restricted={Boolean(restriction)}/>}
        <p><strong>Customer visibility:</strong> {status.visible?"Visible · Sold Out":"Not visible"}</p>
        <p className="notice"><strong>Category:</strong> {row.category?.name??"Unavailable"}{" · "}
         {row.category?.is_published===true?"Published":"Not published or unavailable"}</p>
        <p className="notice"><strong>Current availability:</strong> {assessment.label}</p>
        <p className="notice"><strong>Stock:</strong> {inventory?
         inventory.quantity_on_hand===0&&inventory.quantity_reserved===0
          ?"Sold Out (0 available)"
          :inventory.quantity_on_hand+" on hand; "+inventory.quantity_reserved+" reserved"
         :"Unavailable"}</p>
        <p className="notice"><strong>Product:</strong> {p.is_active?"Active":"Inactive"}
         {" · "}{p.image_path?"Image saved":"Image missing"}</p>
        <p className="notice"><strong>Setup:</strong> {setup.completed} of {setup.total} fields ready
         {missing.length>0?" · Needs: "+missing.join(", "):" · Core details complete"}</p>
        <p className="notice">The label above comes from the protected database
         verdict. Changing a Publish switch does not override a product restriction,
         administrative hold, or independent product release check.</p>
       </article>;
      })}
     </div>}
   </>}
  {restrictionsAvailable&&<section aria-label="Currently restricted retail products"
    className="supplier-panel" style={{marginTop:24}}>
   <h2>Retail product restriction list ({restrictionRows.length})</h2>
   <p className="notice">These products are hidden from the public retail showcase regardless of category or supplier Publish preference. Removing a restriction does not override other release checks.</p>
   {restrictionRows.length===0?<p>No products are on the admin restriction list.</p>:
    <div className="apex-product-grid">{restrictionRows.map(r=>
     <article key={r.store_id+":"+r.product_id} className="apex-product-card">
      <h3>{r.product_name}</h3>
      <p className="notice">{r.store_name} · SKU {r.product_sku}</p>
      <p className="notice">{r.reason}</p>
      <AdminProductDisplayRestrictionForm storeId={r.store_id}
       productId={r.product_id} restricted={true}/>
     </article>)}</div>}
   </section>}
  <div className="actions">
   <Link className="button secondary" href="/admin/categories">
    Category controls</Link>
   <Link className="button primary" href="/admin/listing-controls">
    Manage admin holds</Link>
   <Link className="button secondary" href="/admin/product-reviews">
    Product reviews</Link>
   <Link className="button secondary" href="/supplier/catalog/bulk">
    Finish product setup in bulk</Link>
   <Link className="button secondary" href="/admin/storefront-preview">
    Review product cards</Link>
   <Link className="button secondary" href="/catalog">Public catalog</Link>
  </div>
 </main>;
}
