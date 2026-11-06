import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {isVerifiedPlatformAdmin} from "@/lib/auth/admin-access";
import {createTrack3QaFixtures} from "@/lib/supplier/track3-qa-fixtures.mjs";
import FulfillmentQaWorkbench from "./workbench";
import SamplePurchaseFlow from "./sample-purchase-flow";
import CompactVariantCard from "@/components/catalog/compact-variant-card";
import {runEndToEndSamplePurchaseQa} from "@/lib/checkout/end-to-end-sample-purchase-qa.mjs";


// Synthetic option combinations for a private UI preview only.
// No supplier workbook rows, product database lookups or checkout calls.
const sampleOptions=[
 {id:"11111111-1111-4111-8111-111111111111",carrierOil:"MCT",strength:"100 mg",size:"10 mL",retailPriceCents:1200},
 {id:"22222222-2222-4222-8222-222222222222",carrierOil:"GSO",strength:"100 mg",size:"10 mL",retailPriceCents:1200},
 {id:"33333333-3333-4333-8333-333333333333",carrierOil:"MCT",strength:"100 mg",size:"20 mL",retailPriceCents:1900},
 {id:"44444444-4444-4444-8444-444444444444",carrierOil:"GSO",strength:"100 mg",size:"20 mL",retailPriceCents:1900},
 {id:"55555555-5555-4555-8555-555555555555",carrierOil:"MCT",strength:"200 mg",size:"10 mL",retailPriceCents:1500},
] as const;
// A product with only one size/strength should not require a dropdown.
const singleSampleOption=[
 {id:"66666666-6666-4666-8666-666666666666",carrierOil:"",strength:"",size:"",retailPriceCents:900},
] as const;

export const dynamic="force-dynamic";
export const metadata={
 title:"Fulfillment Acceptance QA | Apex Admin",
 robots:{index:false,follow:false},
};

export default async function Track3FulfillmentQA(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/admin/sign-in");
 const {data,error}=await client.auth.getUser();
 if(error||!isVerifiedPlatformAdmin(data.user))
  redirect("/admin/sign-in");

 const sample=runEndToEndSamplePurchaseQa();
 const f=createTrack3QaFixtures();
 const m=f.manifest;
 return <main className="container supplier-shell apex-branded-dashboard"
  style={{minWidth:0}}>
  <Link className="back" href="/admin">← Admin dashboard</Link>
  <p className="eyebrow">APEX / ADMIN / TECHNICAL ACCEPTANCE</p>
  <h1>Fulfillment QA workbench</h1>
  <p className="lead">Test order identity, cumulative review CSVs, stale edits,
   duplicate prevention and a protected email attachment manifest without
   using customer information, changing an order or purchasing postage.</p>
  <section className="supplier-panel" style={{maxWidth:"none",marginTop:18}}>
   <p className="eyebrow">ONE CARD PER PRODUCT · SAMPLE ONLY</p>
   <h2>Try the product cards</h2>
   <p>Each product has one card. If there are different options, choose one
    inside the card and its price changes automatically. No extra product
    cards for every strength, size or oil.</p>
   <div className="apex-compact-product-grid">
    <CompactVariantCard name="Sample Product A" category="Multiple options"
     description="One product with oil, strength and size variations."
     variants={sampleOptions}/>
    <CompactVariantCard name="Sample Product B" category="Single option"
     description="A product without variations needs no dropdown."
     variants={singleSampleOption}/>
   </div>
   <p className="notice">Private demo with invented sample amounts, not Lily&apos;s
    product list. No product, inventory, cart, order or payment is changed.</p>
  </section>
  <SamplePurchaseFlow result={sample}/>
  <section className="supplier-panel" style={{maxWidth:"none"}}>
   <h2>Deterministic two-day acceptance scenario</h2>
   <div style={{display:"grid",gap:12,
    gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))"}}>
    {([
     ["Day 3 originals",f.day3Orders],
     ["Day 4 cumulative",f.totalOrders],
     ["New on Day 4",f.newToday],
     ["Carried forward",f.carriedForward],
    ] as [string,number][]).map(([label,count])=>
     <article key={label} className="supplier-panel"
      style={{padding:14,margin:0}}>
      <span className="eyebrow">{label}</span>
      <strong style={{display:"block",fontSize:28}}>{count}</strong>
     </article>)}
   </div>
   <p className="notice">Dates: {f.day3} and {f.day4}.
    Ten older shipment-plan versions change between those dates;
    old offline edits must be rejected without silently overwriting
    newer source revisions.</p>
  </section>
  <FulfillmentQaWorkbench
   storeId={f.storeId} previousCsv={f.previousCsv}
   currentCsv={f.currentCsv} staleCsv={f.staleCsv}
   freshCsv={f.freshCsv} currentRows={f.currentRows}/>
  <section className="supplier-panel"
   style={{maxWidth:"none",marginTop:18}}>
   <h2>Email attachment contract inspection</h2>
   <p>Rows: <strong>{m.rows}</strong> · New: <strong>{m.newToday}</strong>
    {" "}· Carried forward: <strong>{m.carriedForward}</strong></p>
   <p>Attachment file: <code>{m.attachmentName}</code></p>
   <p>Bytes: {m.attachmentBytes} · SHA-256 digest:
    {" "}<code style={{overflowWrap:"anywhere"}}>{m.digestSha256}</code></p>
   <p className="notice">This is a synthetic, metadata-only attachment
    preview. There is no recipient, customer address, carrier tracking,
    real order payment or email dispatch. Shipment and postage purchase
    controls remain disabled.</p>
  </section>
  <div className="actions" style={{marginTop:18}}>
   <Link className="button secondary" href="/admin/email-reports">
    Provider delivery monitoring
   </Link>
   <Link className="button secondary" href="/supplier/usps">
    USPS readiness
   </Link>
   <a className="button secondary"
    href="https://github.com/zanibethel/apex/blob/main/docs/APEX_TRACK3_ACCEPTANCE_TEST_PLAN_2026-11-05.md"
    target="_blank" rel="noopener noreferrer">
    Full test checklist
   </a>
  </div>
 </main>;
}
