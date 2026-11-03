import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {PromotionEditor,PromotionStatus,PromotionCalculator}
 from "@/app/supplier/discounts/forms";
import "@/app/supplier/discounts/promotions.css";

export const dynamic="force-dynamic";
export const metadata={title:"Shipping & Discount Codes | Apex Admin",
 robots:{index:false,follow:false}};
const STORE_ID="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";

export default async function AdminShippingPromotions(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(auth.user))redirect("/admin/sign-in");
 const {data,error:loadError}=await client.from("supplier_discount_codes")
  .select("id,store_id,code,discount_kind,discount_value,min_subtotal_cents,starts_at,ends_at,usage_limit,redemption_count,is_active")
  .eq("store_id",STORE_ID).order("created_at",{ascending:false}).limit(100);
 const enabled=process.env.APEX_DRAFT_PROMOS_ENABLED==="true";
 return <main className="container supplier-shell apex-branded-dashboard apex-promo-page">
  <Link className="back" href="/admin/checkout-rules">← Shipping rules</Link>
  <p className="eyebrow">APEX / ADMIN / PROMOTIONS</p>
  <h1>Discount &amp; free-shipping codes</h1>
  <p className="lead">Manage the same discount codes suppliers use.
   Free-shipping codes waive delivery fees, while percentage and fixed
   discounts reduce merchandise totals.</p>
  <PromotionEditor storeId={STORE_ID} enabled={enabled}/>
  <section className="supplier-panel apex-promo-panel">
   <h2>Existing codes</h2>
   {loadError?<p role="alert">Discount codes are unavailable right now.</p>:
    !data?.length?<p>No discount codes yet. Create one above to get started.</p>:
    <div className="apex-promo-code-grid">
     {data.map(p=><article key={p.id} className="apex-promo-code">
      <div className="apex-promo-code-top">
       <h3>{p.code}</h3>
       <span className="apex-promo-state">{p.is_active?"Active":"Inactive"}</span>
      </div>
      <p>{p.discount_kind==="free_shipping"?"Free shipping":
       p.discount_kind==="percentage"?`${p.discount_value}% off`:
       `${(p.discount_value/100).toFixed(2)} USD off`}</p>
      <p className="apex-promo-meta">Uses: {p.redemption_count}
       {p.usage_limit?` of ${p.usage_limit}`:""}</p>
      <PromotionStatus storeId={STORE_ID} promotion={p} enabled={enabled}/>
      <details className="apex-promo-edit">
       <summary>Edit code</summary>
       <PromotionEditor storeId={STORE_ID} existing={p} enabled={enabled}/>
      </details>
     </article>)}
    </div>}
  </section>
  <PromotionCalculator storeId={STORE_ID}/>
  <p><Link href="/admin/checkout-rules">
   Shipping fees and free-shipping threshold</Link></p>
 </main>;
}
