import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {PromotionEditor,PromotionStatus,PromotionCalculator} from "./forms";
import "./promotions.css";

export const dynamic="force-dynamic";
export const metadata={title:"Discount Codes | Apex",robots:{index:false,follow:false}};

export default async function SupplierDiscounts(){
 const w=await getSupplierWorkspace();
 if(!w)redirect("/supplier/sign-in");
 const ids=w.stores.map(s=>s.id);
 const {data,error}=await w.client.from("supplier_discount_codes")
  .select("id,store_id,code,discount_kind,discount_value,min_subtotal_cents,starts_at,ends_at,usage_limit,redemption_count,is_active")
  .in("store_id",ids).order("created_at",{ascending:false}).limit(100);
 const enabled=process.env.APEX_DRAFT_PROMOS_ENABLED==="true";
 return <main className="container supplier-shell apex-promo-page">
  <Link className="back" href="/supplier">← Supplier dashboard</Link>
  <p className="eyebrow">APEX / PROMOTIONS</p>
  <h1>Discount codes</h1>
  <p className="lead">Create and manage discounts for your storefront.</p>
  <p><Link href="/supplier/shipping">Shipping fees and free-shipping thresholds</Link></p>
  {w.stores.length===1&&<PromotionEditor
   storeId={w.stores[0].id} enabled={enabled&&!w.stores[0].is_public}/>}
  <section className="supplier-panel apex-promo-panel">
   <h2>Existing codes</h2>
   {error?<p role="alert">Discount codes are unavailable right now.</p>:
    !data?.length?<p>No discount codes yet. Create one above to get started.</p>:
    <div className="apex-promo-code-grid">
     {data.map(p=><article className="apex-promo-code" key={p.id}>
      <div className="apex-promo-code-top">
       <h3>{p.code}</h3>
       <span className="apex-promo-state">{p.is_active?"Active":"Inactive"}</span>
      </div>
      <p>{p.discount_kind==="free_shipping"?"Free shipping":
       p.discount_kind==="percentage"?`${p.discount_value}% off`:
       `${(p.discount_value/100).toFixed(2)} USD off`}</p>
      <p className="apex-promo-meta">Uses: {p.redemption_count}
       {p.usage_limit?` of ${p.usage_limit}`:""}</p>
      <PromotionStatus storeId={p.store_id} promotion={p} enabled={enabled}/>
      <details className="apex-promo-edit">
       <summary>Edit code</summary>
       <PromotionEditor storeId={p.store_id} existing={p} enabled={enabled}/>
      </details>
     </article>)}
    </div>}
  </section>
  {w.stores.length===1&&<PromotionCalculator storeId={w.stores[0].id}/>}
 </main>;
}
