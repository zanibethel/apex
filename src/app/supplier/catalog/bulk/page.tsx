import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {BulkDraftEditor} from "../bulk-editor";
import {SourceDraftImport} from "../source-draft-import";
import {proposedSoldOutPricing} from "@/lib/catalog/sold-out-import-pricing.mjs";
import {privateSourceDraftDescription} from "@/lib/catalog/private-source-draft-description.mjs";
import {draftSetupSteps} from "@/lib/catalog/draft-content-checklist.mjs";
import {listingControlStatus} from "@/lib/catalog/listing-control.mjs";
import {supplierStorefrontVisibility} from "@/lib/catalog/supplier-storefront-visibility.mjs";
import {awaitingAdministratorCorrectionReview} from "@/lib/catalog/listing-resubmission.mjs";
import {supplierImageCorrectionStatus} from "@/lib/catalog/supplier-image-correction-status.mjs";
import {SUPPLIER_BULK_PRODUCT_CAPACITY,SUPPLIER_BULK_PRODUCT_QUERY_LIMIT,supplierBulkProductWindowStatus} from "@/lib/catalog/supplier-bulk-capacity.mjs";

export const dynamic="force-dynamic";
export const metadata={title:"Bulk Product Editor | Apex Supplier",robots:{index:false,follow:false}};

export default async function BulkProductWorkspace(){
 const client=await createSupplierServerClient();
 if(!client)redirect("/supplier/sign-in");
 const {data:auth,error:authError}=await client.auth.getUser();
 if(authError||!auth.user||auth.user.is_anonymous||!auth.user.email_confirmed_at)
  redirect("/supplier/sign-in");
 const {data:memberships,error:memberError}=await client.from("supplier_memberships")
  .select("supplier_id,role").in("role",["owner","manager"]).limit(20);
 if(memberError||!memberships?.length)return <main className="container supplier-shell">
  <h1>Supplier owner or manager access required.</h1>
  <Link href="/supplier/catalog">Back to product manager</Link>
 </main>;
 const {data:stores,error:storeError}=await client.from("stores")
  .select("id,supplier_id,is_public").in("supplier_id",memberships.map(m=>m.supplier_id))
  .eq("is_public",false).limit(20);
 if(storeError||!stores||stores.length!==1)return <main className="container supplier-shell">
  <h1>Choose a single private supplier storefront.</h1>
  <p>Bulk editing is available for an assigned private store. No products have been changed.</p>
  <Link href="/supplier/catalog">Back to product manager</Link>
 </main>;
 const store=stores[0];
 const [{data:products,error:productError},{data:categories,error:categoryError},{data:linked,error:linkedError},{data:sources,error:sourceError,count:sourceCount},{data:inventory,error:inventoryError},{data:listingControls,error:listingError},{data:listingEvents,error:eventsError},{data:reviewRows,error:reviewError,count:reviewCount},{data:imageFeedback,error:feedbackError,count:feedbackCount}]=await Promise.all([
  client.from("products")
   .select("id,sku,name,description,price_cents,compare_at_price_cents,internal_source_cost_cents,category_id,is_active,image_path")
   .eq("store_id",store.id).eq("is_published",false).order("name").limit(SUPPLIER_BULK_PRODUCT_QUERY_LIMIT),
  client.from("categories").select("id,name").eq("store_id",store.id).order("name").limit(SUPPLIER_BULK_PRODUCT_CAPACITY),
  client.from("supplier_candidate_drafts").select("candidate_id,product_id").eq("store_id",store.id).limit(500),
  client.from("supplier_import_candidates").select("id,source_index,product_name,strength,wholesale_cost_cents",{count:"exact"})
   .eq("store_id",store.id).order("source_index").limit(250),
  client.from("inventory_items").select("product_id,quantity_on_hand,quantity_reserved").eq("store_id",store.id).limit(250),
  client.from("supplier_listing_controls")
   .select("product_id,supplier_wants_listing,admin_gate,republish_approval_required,republish_approved,reason")
   .eq("store_id",store.id).limit(250),
  client.from("supplier_listing_events").select("product_id,action")
   .eq("store_id",store.id).order("id",{ascending:false}).limit(500),
  client.from("private_product_review_states")
   .select("store_id,product_id,submission_id,status,snapshot",{count:"exact"})
   .eq("store_id",store.id).limit(250),
  client.from("supplier_media_feedback_events")
   .select("store_id,product_id,submission_id,image_path,outcome,supplier_note,created_at,evidence_event_id",{count:"exact"})
   .eq("store_id",store.id).order("created_at",{ascending:false})
   .order("evidence_event_id",{ascending:false}).limit(1000),
 ]);
 if(productError||categoryError||linkedError||inventoryError)return <main className="container supplier-shell">
  <h1>Private catalog temporarily unavailable.</h1>
  <Link href="/supplier/catalog">Back to product manager</Link>
 </main>;
 // Never silently display only a subset of a supplier's private products.
 // Truncating product reads also prevents CSV from matching off-page SKUs, so
 // fail closed before rendering an incomplete bulk workspace.
 if(supplierBulkProductWindowStatus(products)!=="complete")return <main className="container supplier-shell">
  <h1>Bulk workspace product limit reached.</h1>
  <p>This private catalog has more than {SUPPLIER_BULK_PRODUCT_CAPACITY} products, or its product list could not be verified. No products were changed.</p>
  <p>Use the standard product manager while a larger-catalog workflow is prepared. Bulk edits are available for storefronts with {SUPPLIER_BULK_PRODUCT_CAPACITY} or fewer private products.</p>
  <Link href="/supplier/catalog">Back to product manager</Link>
 </main>;
 // Signed URLs are generated only for draft products in this authenticated
 // supplier's private store. No public bucket policy or public URLs.
 const signedImages=new Map<string,string>();
 await Promise.all((products??[]).filter(p=>p.image_path).map(async product=>{
  const {data,error}=await client.storage.from("apex-draft-product-images")
   .createSignedUrl(product.image_path!,120);
  if(!error&&data?.signedUrl)signedImages.set(product.id,data.signedUrl);
 }));
 const imageLibrary=(products??[]).filter(p=>signedImages.has(p.id)).map(p=>({
  productId:p.id,name:p.name,sku:p.sku,previewUrl:signedImages.get(p.id)!,
 }));
 const quantities=new Map((inventory??[]).map(i=>[i.product_id,i]));
 const media=(products??[]).map(p=>({
  productId:p.id,imageUrl:signedImages.get(p.id),
  quantityOnHand:quantities.get(p.id)?.quantity_on_hand,
  quantityReserved:quantities.get(p.id)?.quantity_reserved,
 }));
 const listingByProduct=new Map((listingControls??[]).map(c=>[c.product_id,c]));
 const mediaFeedbackAvailable=!reviewError&&!feedbackError&&
  reviewCount!==null&&reviewCount===reviewRows?.length&&reviewCount<=250&&
  feedbackCount!==null&&feedbackCount===imageFeedback?.length&&feedbackCount<=1000;
 const reviewsByProduct=new Map((reviewRows??[]).map(r=>[r.product_id,r]));
 const latestImageFeedback=new Map<string,NonNullable<typeof imageFeedback>[number]>();
 if(mediaFeedbackAvailable)for(const feedback of imageFeedback??[])
  if(!latestImageFeedback.has(feedback.product_id))
   latestImageFeedback.set(feedback.product_id,feedback);
 // Only products requesting publication need a protected release check.
 // Fail closed on RPC failures; a supplier preference is never live status.
 const releases=new Map<string,unknown>();
 if(!listingError)await Promise.all((products??[]).filter(p=>
  listingByProduct.get(p.id)?.supplier_wants_listing===true).map(async p=>{
   const {data,error}=await client.rpc("get_private_release_readiness",{
    p_store_id:store.id,p_product_id:p.id,
   });
   if(!error&&data)releases.set(p.id,data);
  }));
 const eventsByProduct=new Map<string,{action:string}[]>();
 for(const event of listingEvents??[]){
  const existing=eventsByProduct.get(event.product_id)??[];
  existing.push({action:event.action});
  eventsByProduct.set(event.product_id,existing);
 }
 const listing=(products??[]).map(p=>{
  const control=listingByProduct.get(p.id);
  const status=listingControlStatus(control);
  const setup=draftSetupSteps(p,quantities.get(p.id));
  const missing=setup.steps.filter(step=>!step.complete).map(step=>step.label);
  const mediaStatus=supplierImageCorrectionStatus(
   {id:p.id,store_id:store.id,image_path:p.image_path},
   reviewsByProduct.get(p.id),latestImageFeedback.get(p.id),mediaFeedbackAvailable);
  const visibility=supplierStorefrontVisibility({
   available:!listingError,requested:!!control?.supplier_wants_listing,
   adminGate:control?.admin_gate,
   republishApprovalRequired:control?.republish_approval_required,
   republishApproved:control?.republish_approved,
  },releases.get(p.id));
  return {
   productId:p.id,
   canRequest:!listingError&&setup.setupComplete&&status.canRequest&&!control?.supplier_wants_listing,
   requested:!!control?.supplier_wants_listing,
   status:listingError?"Publication status unavailable":status.label,
   kind:listingError?"unavailable":status.kind,
   reason:!listingError&&["hold","review"].includes(status.kind)?control?.reason??null:null,
   missing,
   correctionsPending:!eventsError&&awaitingAdministratorCorrectionReview(eventsByProduct.get(p.id)),
   visibilityKind:visibility.kind,visibilityLabel:visibility.label,
   visibilityDescription:visibility.description,
   imageStatusKind:mediaStatus.kind,imageStatusLabel:mediaStatus.label,
   imageStatusMessage:mediaStatus.message,imageNeedsAction:mediaStatus.needsAction,
  };
 });
 const linkedProducts=new Set((linked??[]).map(p=>p.product_id));
 const linkedSources=new Set((linked??[]).map(p=>p.candidate_id));
 const sourceListUsable=!sourceError&&sourceCount!==null&&sourceCount===sources?.length&&sourceCount<=250;
 const sourceOptions=sourceListUsable?(sources??[]).filter(s=>!linkedSources.has(s.id)).map(s=>{
  const cost=proposedSoldOutPricing(s.wholesale_cost_cents);
  const name=[s.product_name?.trim(),s.strength?.trim()].join(" — ");
  return {id:s.id,sourceIndex:s.source_index,name:s.product_name,strength:s.strength,
   costCents:cost?.sourceCostCents??0,eligible:Boolean(cost)&&Boolean(privateSourceDraftDescription(s.product_name,s.strength))&&name.length<=120};
 }):[];
 const initialRows=(products??[]).map(p=>({
  key:p.id,id:p.id,name:p.name,sku:p.sku,description:p.description??"",
  price:(Number(p.price_cents)/100).toFixed(2),
  comparePrice:p.compare_at_price_cents===null?"":(Number(p.compare_at_price_cents)/100).toFixed(2),
  sourceCost:p.internal_source_cost_cents==null?"":(Number(p.internal_source_cost_cents)/100).toFixed(2),
  linkedSource:linkedProducts.has(p.id),categoryId:p.category_id??"",isActive:p.is_active,
 }));
 return <main className="container supplier-shell apex-bulk-page">
  <Link className="back" href="/supplier/catalog">← Product manager</Link>
  <Link className="button secondary" href="/supplier/catalog/media-readiness">Review image readiness</Link>
  <p className="eyebrow">APEX / SUPPLIER BULK PRODUCT MANAGEMENT</p>
  <h1>Add and edit multiple products</h1>
  <p className="lead">Select products, make changes, save them, then choose Preview single or Preview all before publishing.</p>
  <p className="notice">New products begin as private drafts with zero stock. Save a draft to unlock its inline image picker and stock editor, then preview the completed offer. Nothing is made public by saving.</p>
  {sourceListUsable?<SourceDraftImport storeId={store.id} sources={sourceOptions}
    enabled={process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED==="true"&&process.env.APEX_PRIVATE_SOURCE_DRAFTS_ENABLED==="true"}/>
   :<p role="status" className="notice">Source import queue unavailable or incomplete. Existing private product editing remains available.</p>}
  <BulkDraftEditor storeId={store.id} editable={process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED==="true"}
   categories={categories??[]} initialRows={initialRows} media={media} existingImages={imageLibrary} listing={listing}
   resubmissionEnabled={process.env.APEX_SUPPLIER_CORRECTIONS_RESUBMIT_ENABLED==="true"}/>
  <p className="notice">Upload a new PNG/JPEG/WebP image or reuse an existing private product image; each reuse makes its own private copy. On-hand inventory updates use expected-count checks and are audited. Private source cost for linked variants still requires Source review. The bulk editor loads all private products in storefronts with 250 or fewer private products.</p>
 </main>;
}
