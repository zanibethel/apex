import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {PromotionEditor,PromotionStatus,PreviewPromotion}
 from "@/app/supplier/discounts/forms";

export const dynamic="force-dynamic";
export const metadata={title:"Shipping & Discount Codes | Apex Admin",
 robots:{index:false,follow:false}};
const STORE_ID="bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3";

export default async function AdminShippingPromotions(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data:auth,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(auth.user))redirect("/admin/sign-in");
 const {data, error:loadError}=await client.from("supplier_discount_codes")
  .select("id,store_id,code,discount_kind,discount_value,min_subtotal_cents,starts_at,ends_at,usage_limit,redemption_count,is_active")
  .eq("store_id",STORE_ID).order("created_at",{ascending:false}).limit(100);
 const enabled=process.env.APEX_DRAFT_PROMOS_ENABLED==="true";
 return <main className="container supplier-shell apex-branded-dashboard">
  <Link className="back" href="/admin/checkout-rules">← Shipping rules</Link>
  <p className="eyebrow">APEX / ADMIN / PROMOTIONS</p>
  <h1>Discount &amp; free-shipping codes</h1>
  <p className="lead">Manage the same private-store discount codes suppliers use.
   A Free shipping code waives the configured shipping fee; a percentage or
   fixed code reduces merchandise.</p>
  <p className="notice">Checkout and Bitcoin payments remain disabled.
   A code can be tested without placing an order or redeeming it.</p>
  <PromotionEditor storeId={STORE_ID} enabled={enabled}/>
  <section className="supplier-panel" style={{maxWidth:"none"}}>
   <h2>Existing codes</h2>
   {loadError?<p role="alert">The private promotion list could not be verified.</p>:
    !data?.length?<p>No saved discount codes.</p>:
    <div className="feature-grid" style={{gridTemplateColumns:"repeat(auto-fit,minmax(270px,1fr))"}}>
     {data.map(p=><article key={p.id} className="feature-card">
      <h3>{p.code}</h3>
      <p>{p.discount_kind==="free_shipping"?"Free shipping":
       p.discount_kind==="percentage"?`${p.discount_value}% off`:
       `${(p.discount_value/100).toFixed(2)} USD off`}</p>
      <p className="notice">{p.is_active?"Active":"Inactive"}
       {" · "}Uses {p.redemption_count}{p.usage_limit?` / ${p.usage_limit}`:""}</p>
      <PromotionStatus storeId={STORE_ID} promotion={p} enabled={enabled}/>
      <PromotionEditor storeId={STORE_ID} existing={p} enabled={enabled}/>
     </article>)}
    </div>}
  </section>
  <PreviewPromotion storeId={STORE_ID}/>
  <div className="actions">
   <Link className="button secondary" href="/admin/checkout-rules">
    Shipping fees and free-shipping threshold</Link>
  </div>
 </main>;
}
