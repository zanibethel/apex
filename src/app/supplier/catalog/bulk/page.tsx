import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {BulkDraftEditor} from "../bulk-editor";
import {SupplierIntakeCards} from "../supplier-intake-cards";
import type {IntakeCard} from "../supplier-intake-cards";
import {supplierIntakeCards,INTAKE_MAX_ROWS} from "@/lib/catalog/supplier-intake-cards.mjs";
import {reconcileIntakeWithSaved} from "@/lib/catalog/supplier-intake-reconcile.mjs";
import {SUPPLIER_OPTION_BATCH} from "@/lib/catalog/supplier-parent-review-snapshot.mjs";
import "./mobile-layout.css";
import "./quick-image-picker.css";
import {SourceDraftImport} from "../source-draft-import";
import {SharedPrivateImageBulkApply} from "../shared-private-image-bulk-apply";
import {proposedSoldOutPricing} from "@/lib/catalog/sold-out-import-pricing.mjs";
import {privateSourceDraftDescription} from "@/lib/catalog/private-source-draft-description.mjs";
import {draftSetupSteps} from "@/lib/catalog/draft-content-checklist.mjs";
import {retailDisplayMinimum} from "@/lib/catalog/retail-display-minimum.mjs";
import {listingControlStatus} from "@/lib/catalog/listing-control.mjs";
import {privateInventoryState} from "@/lib/catalog/private-inventory-state.mjs";
import {supplierStorefrontVisibility} from "@/lib/catalog/supplier-storefront-visibility.mjs";
import {awaitingAdministratorCorrectionReview} from "@/lib/catalog/listing-resubmission.mjs";
import {supplierImageCorrectionStatus} from "@/lib/catalog/supplier-image-correction-status.mjs";
import {SUPPLIER_BULK_PRODUCT_CAPACITY,SUPPLIER_BULK_PRODUCT_QUERY_LIMIT,supplierBulkProductWindowStatus} from "@/lib/catalog/supplier-bulk-capacity.mjs";
import {apexTaxonomyStoreId,apexTaxonomyProposal} from "@/lib/catalog/apex-reviewed-taxonomy-20261102.mjs";

export const dynamic="force-dynamic";
export const metadata={title:"Products | Apex Supplier",robots:{index:false,follow:false}};

export default async function BulkProductWorkspace({searchParams}:{
 searchParams:Promise<{edit?:string|string[];new?:string|string[]}>,
}){
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
 // Private intake: these are proposal cards, not authoritative saved product rows.
 const {data:intakeRows,error:intakeError,count:intakeCount}=await client
  .from("apex_supplier_variant_review_items")
  .select("id,source_row,parent_title,source_section,strength,size,carrier_oil,retail_price_cents,review_status,review_note",{count:"exact"})
  .eq("store_id",store.id).eq("source_batch",SUPPLIER_OPTION_BATCH)
  .order("parent_title").order("source_row").limit(INTAKE_MAX_ROWS);
 const proposedCards: IntakeCard[]|null=!intakeError&&intakeCount!==null&&
  intakeCount<=INTAKE_MAX_ROWS&&intakeCount===intakeRows?.length
  ?supplierIntakeCards(intakeRows) as IntakeCard[]|null:null;
 const [{data:products,error:productError},{data:categories,error:categoryError},{data:linked,error:linkedError},{data:sources,error:sourceError,count:sourceCount},{data:inventory,error:inventoryError},{data:listingControls,error:listingError},{data:listingEvents,error:eventsError},{data:reviewRows,error:reviewError,count:reviewCount},{data:imageFeedback,error:feedbackError,count:feedbackCount},
  {data:stockPreferences,error:stockPrefError,count:stockPrefCount},
  {data:retailAllowed,error:retailAllowedError}]=await Promise.all([
  client.from("products")
   .select("id,sku,name,description,tags,price_cents,compare_at_price_cents,internal_source_cost_cents,category_id,is_active,image_path")
   .eq("store_id",store.id).eq("is_published",false).is("archived_at",null).order("name").limit(SUPPLIER_BULK_PRODUCT_QUERY_LIMIT),
  client.from("categories").select("id,name,slug").eq("store_id",store.id).order("name").limit(SUPPLIER_BULK_PRODUCT_CAPACITY),
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
  client.from("supplier_private_stock_preferences")
   .select("product_id,track_quantities",{count:"exact"})
   .eq("store_id",store.id).limit(SUPPLIER_BULK_PRODUCT_QUERY_LIMIT),
  client.rpc("get_supplier_retail_eligible_categories",{p_store_id:store.id}),
 ]);
 if(productError||categoryError||linkedError||inventoryError||stockPrefError||retailAllowedError||
  !Array.isArray(retailAllowed)||
  stockPrefCount===null||stockPrefCount!==stockPreferences?.length||
  stockPrefCount>SUPPLIER_BULK_PRODUCT_QUERY_LIMIT)
  return <main className="container supplier-shell">
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
 const trackByProduct=new Map((stockPreferences??[]).map(p=>[p.product_id,p.track_quantities]));
 const media=(products??[]).map(p=>({
  productId:p.id,imageUrl:signedImages.get(p.id),
  quantityOnHand:quantities.get(p.id)?.quantity_on_hand,
  quantityReserved:quantities.get(p.id)?.quantity_reserved,
  trackQuantities:trackByProduct.get(p.id)??true,
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
 const eligibleRetailCategoryIds=new Set(retailAllowed);
 const linkedProductIds=new Set((linked??[]).map(p=>p.product_id));
 const listing=(products??[]).map(p=>{
  const control=listingByProduct.get(p.id);
  const status=listingControlStatus(control);
  const setup=draftSetupSteps(p,quantities.get(p.id));
  const stock=privateInventoryState(quantities.get(p.id));
  const mediaStatus=supplierImageCorrectionStatus(
   {id:p.id,store_id:store.id,image_path:p.image_path},
   reviewsByProduct.get(p.id),latestImageFeedback.get(p.id),mediaFeedbackAvailable);
  const isRetail=p.category_id===null||eligibleRetailCategoryIds.has(p.category_id);
  // Supplier-entered display essentials: name, positive price and description.
  // SKU is generated at draft creation. Category/image/inventory are optional for
  // checkout-disabled retail display; higher-risk categories remain gated.
  const retailMinimum=retailDisplayMinimum(p);
  const missing=isRetail?retailMinimum.missing:setup.steps.filter(step=>!step.complete).map(step=>step.label);
  const retailSetupComplete=isRetail&&retailMinimum.ready&&
   !linkedProductIds.has(p.id)&&
   !["pending_review","changes_requested"].includes(reviewsByProduct.get(p.id)?.status??"draft");
  const visibility=supplierStorefrontVisibility({
   available:!listingError,requested:!!control?.supplier_wants_listing,
   adminGate:control?.admin_gate,
   republishApprovalRequired:control?.republish_approval_required,
   republishApproved:control?.republish_approved,
  },releases.get(p.id));
  return {
   productId:p.id,retailShowcase:isRetail,
   canRequest:!listingError&&(setup.setupComplete||retailSetupComplete)&&status.canRequest&&!control?.supplier_wants_listing,
   requested:!!control?.supplier_wants_listing,
   status:listingError?"Publication status unavailable":status.label,
   kind:listingError?"unavailable":status.kind,
   reason:!listingError&&["hold","review"].includes(status.kind)?control?.reason??null:null,
   missing,
   correctionsPending:!eventsError&&awaitingAdministratorCorrectionReview(eventsByProduct.get(p.id)),
   visibilityKind:isRetail?"retail-showcase":visibility.kind,
   visibilityLabel:isRetail
    ?(control?.supplier_wants_listing?"Public retail showcase selected":"Not listed publicly")
    :visibility.label,
   visibilityDescription:isRetail
    ?"Ordinary retail products need only a name, positive price and description for display. Category, image and inventory are optional; missing stock shows Sold Out. Checkout remains disabled, and admin holds still apply."
    :visibility.description,
   stockKind:trackByProduct.get(p.id)===false?"untracked":stock.kind,
   stockLabel:trackByProduct.get(p.id)===false?"Quantity not tracked":stock.label,
   imageStatusKind:mediaStatus.kind,imageStatusLabel:mediaStatus.label,
   imageStatusMessage:mediaStatus.message,imageNeedsAction:mediaStatus.needsAction,
   hasImage:Boolean(p.image_path),
   reviewStatusAvailable:!reviewError,reviewStatus:reviewsByProduct.get(p.id)?.status??"draft",
   canSubmitReview:!reviewError&&setup.setupComplete&&
    (!reviewsByProduct.has(p.id)||reviewsByProduct.get(p.id)?.status==="changes_requested"),
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
 const importedCards: IntakeCard[]|null=proposedCards
  ?reconcileIntakeWithSaved(proposedCards,products??[]) as IntakeCard[]|null
  :null;
 const params=await searchParams;
 const requestedEdit=params?.edit;
 // An edit link only opens an existing record from this supplier's own
 // authenticated, private list. It never trusts a request to choose a store.
 const initialNewProduct=params.new==="1";
 const initialEditProductId=typeof requestedEdit==="string"&&
  (products??[]).some(p=>p.id===requestedEdit)?requestedEdit:undefined;
 const initialRows=(products??[]).map(p=>({
  key:p.id,id:p.id,name:p.name,sku:p.sku,description:p.description??"",tagsText:(p.tags??[]).join("|"),
  price:(Number(p.price_cents)/100).toFixed(2),
  comparePrice:p.compare_at_price_cents===null?"":(Number(p.compare_at_price_cents)/100).toFixed(2),
  sourceCost:p.internal_source_cost_cents==null?"":(Number(p.internal_source_cost_cents)/100).toFixed(2),
  linkedSource:linkedProducts.has(p.id),categoryId:p.category_id??"",isActive:p.is_active,
 }));
 return <main className="container supplier-shell apex-bulk-page">
  <Link className="back" href="/supplier">← Supplier dashboard</Link>
  <p className="eyebrow">APEX / SUPPLIER / PRODUCTS</p>
  <h1>Products</h1>
  <p className="notice">Manage your supplier catalog here. Create products, edit stock and pricing, import CSV files and publish eligible listings to the public storefront. Checkout remains disabled until separately verified.</p>
  {initialNewProduct&&<p className="notice" role="status"><strong>New product draft opened.</strong> Enter a name, price, and optional category, then save. Your item becomes available immediately in your private supplier catalog and showroom; BTCPay is not required.</p>}
  <p className="lead">Find a product, tap the pencil to edit details, images or stock, then Save. Publishing eligible neutral retail products makes them visible on the public showcase when enabled, even if sold out. Checkout and payments stay disabled; admin holds still apply.</p>
  <nav className="apex-bulk-quick-nav apex-supplier-simple-nav" aria-label="Product manager shortcuts">
   <a className="button primary" href="#apex-product-workspace">Saved products ({initialRows.length})</a>
   <a className="button secondary" href="#supplier-intake">Supplier intake ({importedCards?.length??"—"})</a>
   <a className="button secondary" href="#apex-csv-tools">CSV import</a>
   <a className="button secondary" href="#supplier-extra-tools">More tools</a>
  </nav>
  <p className="notice">Imported supplier items are review proposals, not saved product IDs. Verify the match before creating duplicates or changing saved product data. The per-product Track inventory option affects private quantity entry only; public availability and authorization checks still apply.</p>
  <details className="apex-bulk-advanced apex-supplier-extra-tools" id="supplier-extra-tools">
   <summary>Optional supplier tools <span>Source imports, shared images, shipping and media checks</span></summary>
   <p className="notice">Only needed for specific maintenance tasks.</p>
   <div className="actions">
    <Link className="button secondary" href="/supplier/catalog/media-readiness">Image readiness</Link>
    <Link className="button secondary" href="/supplier/shipping">Shipping rules</Link>
    <Link className="button secondary" href="/supplier/catalog">Legacy product manager</Link>
   </div>
  <div className="apex-bulk-advanced-section" aria-label="Optional bulk setup tools">
   <details className="apex-bulk-advanced" id="apex-source-tools">
    <summary>Source import <span>Prepare new product cards from saved source records</span></summary>
    {sourceListUsable?<SourceDraftImport storeId={store.id} sources={sourceOptions}
      enabled={process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED==="true"&&process.env.APEX_PRIVATE_SOURCE_DRAFTS_ENABLED==="true"}/>
     :<p role="status" className="notice">Source import queue unavailable or incomplete. Existing private product editing remains available.</p>}
   </details>
   <details className="apex-bulk-advanced" id="apex-image-tools">
    <summary>Shared product images <span>Apply one saved image to unpictured private products</span></summary>
    <SharedPrivateImageBulkApply storeId={store.id}
     products={(products??[]).map(p=>({productId:p.id,hasImage:Boolean(p.image_path)}))}
     sources={imageLibrary}
     enabled={process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED==="true"}/>
   </details>
  </div>
  </details>
  <BulkDraftEditor storeId={store.id} editable={process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED==="true"}
   initialNewProduct={initialNewProduct}
   initialEditProductId={initialEditProductId}
   categories={categories??[]} initialRows={initialRows} media={media} existingImages={imageLibrary} listing={listing}
   taxonomyProposal={store.id===apexTaxonomyStoreId?apexTaxonomyProposal:undefined}
   taxonomyStoreId={apexTaxonomyStoreId}
   resubmissionEnabled={process.env.APEX_SUPPLIER_CORRECTIONS_RESUBMIT_ENABLED==="true"}/>
  <details className="apex-bulk-advanced apex-supplier-intake-toggle" id="supplier-intake">
   <summary>Supplier intake · {importedCards?.length??"—"} product cards
    <span>{intakeCount??"—"} proposed options · review and match before creating editable product records</span>
   </summary>
   {importedCards?<SupplierIntakeCards cards={importedCards}/>:
    <p role="status" className="notice">Private supplier intake is unavailable or incomplete. Saved products are still accessible. No import was changed.</p>}
  </details>
  <p className="notice">Add / Change / Reuse image controls remain available in each product editor. Source intake does not overwrite product prices, descriptions, SKU identities, inventory, or publication settings.</p>
 </main>;
}
