import Link from "next/link";
import {redirect} from "next/navigation";
import {getSupplierWorkspace} from "@/lib/auth/supplier-workspace";
import {reviewedImportDraftPlan} from "@/lib/catalog/reviewed-import-draft-batch.mjs";
import {ReviewedDraftBatchForm} from "./reviewed-draft-batch-form";

export const dynamic="force-dynamic";
export const metadata={title:"Reviewed Source Drafts | Apex Supplier",
 robots:{index:false,follow:false}};

export default async function BulkReviewedDrafts(){
 const w=await getSupplierWorkspace();
 if(!w)redirect("/supplier/sign-in");
 const stores=w.stores.filter(s=>!s.is_public&&
  w.memberships.some(m=>m.supplier_id===s.supplier_id&&
    ["owner","manager"].includes(m.role)));
 if(stores.length!==1)return <main className="container supplier-shell">
  <h1>Choose one authorized private supplier storefront.</h1>
  <Link href="/supplier/imports">Back to source review</Link>
 </main>;
 const store=stores[0];
 const [source,linked]=await Promise.all([
  w.client.from("supplier_import_candidates")
   .select("id,source_index,product_name,strength,wholesale_cost_cents,review_status",{count:"exact"})
   .eq("store_id",store.id).order("source_index",{ascending:true}).limit(100),
  w.client.from("supplier_candidate_drafts")
   .select("candidate_id").eq("store_id",store.id).limit(100),
 ]);
 if(source.error||linked.error||source.count==null||
  source.count>100||source.count!==source.data?.length)
  return <main className="container supplier-shell">
   <Link href="/supplier/imports">← Source review</Link>
   <h1>Draft preparation unavailable</h1>
   <p className="notice">The complete private source and linked drafts could not be verified. Nothing was changed.</p>
  </main>;
 const mappings=new Set((linked.data??[]).map(x=>x.candidate_id));
 const plans=(source.data??[]).map(candidate=>
  reviewedImportDraftPlan(candidate,mappings.has(candidate.id)));
 const ready=plans.filter(p=>p?.status==="ready");
 const counted=(status:string)=>plans.filter(p=>p?.status===status).length;
 return <main className="container supplier-shell" style={{minWidth:0}}>
  <Link href="/supplier/imports" className="back">← Source review</Link>
  <p className="eyebrow">APEX / SUPPLIER / PRIVATE DRAFTS</p>
  <h1>Prepare reviewed product drafts</h1>
  <p className="lead">Convert individually approved imported variants into actual
   editable product records with automatically generated SKUs, factual descriptions
   and zero inventory.</p>
  <p className="notice"><strong>Private preparation only.</strong>
   This step does not make products public, publish descriptions or prices,
   alter approval status, create orders or enable Bitcoin checkout.
   Updating inventory later does not override legal and admin listing gates.</p>
  <div className="apex-soldout-summary" style={{display:"flex",flexWrap:"wrap",gap:10}}>
   <span>Sources: <strong>{source.count}</strong></span>
   <span>Already saved: <strong>{counted("already_saved")}</strong></span>
   <span>Awaiting source review: <strong>{counted("requires_review")}</strong></span>
   <span>Ready to prepare: <strong>{ready.length}</strong></span>
   <span>Needs correction: <strong>{counted("invalid_source")}</strong></span>
  </div>
  <ReviewedDraftBatchForm storeId={store.id}
   enabled={process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED==="true"}
   ready={ready.map(p=>({
    candidateId:p!.candidateId,name:p!.name,sourceIndex:p!.sourceIndex,
    sourceCostCents:p!.sourceCostCents!,salePriceCents:p!.salePriceCents!,
    proposedCompareAtCents:p!.proposedCompareAtCents!,
   }))}/>
  <section className="supplier-panel" style={{maxWidth:"none"}}>
   <h2>Image and publication follow-up</h2>
   <p className="notice">The shared sample image remains available in the existing
    private preview. For each newly created draft, use the product editor’s
    <strong> Choose existing image</strong> option to save a separate authenticated
    private copy of the image, or upload a product-specific image. Do not treat
    the shared illustration as a verified photograph of a different product.</p>
   <p className="notice">Private drafts may be edited in product management:
    title, description, selling price, compare-at proposal and source cost.
    Actual inventory starts at zero. A supplier can edit stock, but stock alone
    never switches a product to public or available-for-purchase.</p>
   <div className="actions">
    <Link className="button secondary" href="/supplier/imports">Review pending variants</Link>
    <Link className="button secondary" href="/supplier/catalog/bulk">Edit saved product cards</Link>
    <Link className="button secondary" href="/supplier/imports/sold-out-preview">Preview sold-out gallery</Link>
   </div>
  </section>
 </main>;
}
