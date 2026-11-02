import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {sourceReviewSummary} from "@/lib/catalog/bulk-source-review.mjs";
import {BulkSourceReviewPanel} from "./bulk-review-panel";
import "./bulk-review.css";

export const dynamic="force-dynamic";
export const metadata={title:"Bulk Source Review | Apex Supplier",
 robots:{index:false,follow:false}};

export default async function BulkSourceReview(){
 const workspace=await getSupplierWorkspace();
 if(!workspace)redirect("/supplier/sign-in");
 const stores=workspace.stores.filter(s=>!s.is_public&&
  workspace.memberships.some(m=>m.supplier_id===s.supplier_id&&
   ["owner","manager"].includes(m.role)));
 if(stores.length!==1)return <main className="container supplier-shell">
  <h1>Choose one authorized private storefront.</h1>
  <p className="notice">Bulk review is restricted to a single verified supplier store.</p>
  <Link href="/supplier/imports">Return to source records</Link>
 </main>;
 const store=stores[0];
 const [source,linked,art]=await Promise.all([
  workspace.client.from("supplier_import_candidates")
   .select("id,store_id,source_index,product_name,strength,wholesale_cost_cents,review_status",{count:"exact"})
   .eq("store_id",store.id).order("source_index",{ascending:true}).limit(100),
  workspace.client.from("supplier_candidate_drafts")
   .select("candidate_id").eq("store_id",store.id).limit(100),
  workspace.client.from("products").select("id,image_path")
   .eq("store_id",store.id).eq("is_published",false)
   .not("image_path","is",null).order("updated_at",{ascending:false}).limit(1),
 ]);
 if(source.error||linked.error||art.error||source.count===null||
    source.count>100||source.count!==source.data?.length)
  return <main className="container supplier-shell">
   <Link href="/supplier/imports" className="back">← Source import review</Link>
   <h1>Source review unavailable</h1>
   <p className="notice">The complete import queue and saved records could not be verified.
    No statuses were changed.</p>
  </main>;

 const linkedIds=new Set((linked.data??[]).map(x=>x.candidate_id));
 const records=(source.data??[]).map(candidate=>sourceReviewSummary(
  candidate,linkedIds.has(candidate.id))).filter(r=>r!==null);
 if(records.length!==source.count)return <main className="container supplier-shell">
  <h1>Import data needs correction</h1><p className="notice">Some private source entries were
   invalid. Bulk review is unavailable until records have been corrected.</p>
  <Link href="/supplier/imports">Return to imports</Link>
 </main>;
 const originalImage=art.data?.[0]?.image_path;
 const signed=originalImage?await workspace.client.storage
  .from("apex-draft-product-images").createSignedUrl(originalImage,120):null;
 const imageUrl=signed&&!signed.error?signed.data?.signedUrl:undefined;
 const count=(status:string)=>records.filter(r=>r.status===status&&!r.linked).length;
 return <main className="container supplier-shell apex-bulk-review-page">
  <Link className="back" href="/supplier/imports">← Private source import review</Link>
  <p className="eyebrow">APEX / PRIVATE SUPPLIER WORKSPACE</p>
  <h1>Bulk source review</h1>
  <p className="lead">Review imported variants side by side, including source
   prices, proposed 2× selling prices, 2.5× reference prices, default descriptions,
   and a shared illustrative image.</p>
  <p className="notice"><strong>Approval here means ready to create a private draft.</strong>
   It does not verify legal sale eligibility, publish products, change inventory,
   or enable customer purchases. Confirm source identity and documentation before
   approving each item.</p>
  <div className="apex-review-summary-strip" role="status">
   <span>Imported <strong>{records.length}</strong></span>
   <span>Unverified <strong>{count("unverified")}</strong></span>
   <span>Under review <strong>{count("under_review")}</strong></span>
   <span>On hold <strong>{count("hold")}</strong></span>
   <span>Ready for draft <strong>{count("approved_for_draft")}</strong></span>
   <span>Saved <strong>{records.filter(r=>r.linked).length}</strong></span>
  </div>
  <BulkSourceReviewPanel storeId={store.id} rows={records} sharedImage={imageUrl}
   enabled={process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED==="true"}/>
  <div className="actions">
   <Link href="/supplier/imports/bulk-drafts" className="button secondary">
    Continue to zero-stock draft creation</Link>
   <Link href="/supplier/imports/sold-out-preview" className="button secondary">
    View all sold-out preview cards</Link>
  </div>
 </main>;
}
