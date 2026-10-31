import Link from "next/link";
import Image from "next/image";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {NewCategoryForm,NewProductForm,ProductRowEditor} from "../operations/forms";
import {ImportReviewForm} from "../imports/review-form";
import {PromoteReviewedVariantForm} from "../imports/promote-form";
import {ProductImageUploader} from "./image-uploader";
import {SourceCostEditor} from "./source-cost-editor";
import {draftContentChecklist,draftSetupSteps} from "@/lib/catalog/draft-content-checklist.mjs";
import {internalReviewLabel} from "@/lib/catalog/private-review-utils.mjs";
import {SupplierReviewSubmission} from "./review-submission";
import {listingControlStatus} from "@/lib/catalog/listing-control.mjs";
import {privateReleaseDisplay} from "@/lib/catalog/private-release-decision.mjs";
import {SupplierListingControls} from "./listing-control-form";

export const dynamic="force-dynamic";
export const metadata={title:"Shared Products | Apex",robots:{index:false,follow:false}};

function money(cents:number,currency="USD") {
  if(!Number.isSafeInteger(cents)||cents<0)return "Unavailable";
  try{return new Intl.NumberFormat("en-US",{style:"currency",currency}).format(cents/100);}
  catch{return "Unavailable";}
}

export default async function SharedCatalog() {
  const client=await createSupplierServerClient();
  if(!client)return <main className="container supplier-shell"><h1>Catalog unavailable.</h1></main>;

  const {data:session,error:authError}=await client.auth.getUser();
  if(authError||!session.user||session.user.is_anonymous||!session.user.email_confirmed_at)
    redirect("/supplier/sign-in");
  const {data:memberships,error:membershipError}=await client.from("supplier_memberships")
    .select("supplier_id,role").limit(20);
  if(membershipError||!memberships?.length)return <main className="container supplier-shell">
    <h1>Supplier access required.</h1>
    <p>You do not have an assigned catalog workspace.</p>
    <Link className="button secondary" href="/supplier">Back to supplier dashboard</Link>
  </main>;

  const {data:stores,error:storeError}=await client.from("stores")
    .select("id,display_name,supplier_id,is_public")
    .in("supplier_id",memberships.map(member=>member.supplier_id)).limit(20);
  if(storeError||!stores?.length)return <main className="container supplier-shell">
    <h1>Catalog unavailable.</h1><Link href="/supplier">Back to supplier dashboard</Link>
  </main>;

  const ids=stores.map(store=>store.id);
  const canWrite=process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED==="true" &&
    stores.length===1&&!stores[0].is_public &&
    memberships.some(member=>member.supplier_id===stores[0].supplier_id &&
      (member.role==="owner"||member.role==="manager"));

  const [products,categories,inventory,candidates,mappings,reviews,listingControls]=await Promise.all([
    client.from("products")
      .select("id,store_id,category_id,sku,name,description,price_cents,internal_source_cost_cents,compare_at_price_cents,is_active,image_path,currency,is_published")
      .in("store_id",ids).order("name",{ascending:true}).limit(100),
    client.from("categories").select("id,store_id,name").in("store_id",ids).limit(100),
    client.from("inventory_items").select("product_id,store_id,quantity_on_hand,quantity_reserved")
      .in("store_id",ids).limit(100),
    client.from("supplier_import_candidates")
      .select("id,store_id,source_index,product_name,strength,wholesale_cost_cents,review_status",{count:"exact"})
      .in("store_id",ids).order("source_index",{ascending:true}).limit(100),
    client.from("supplier_candidate_drafts")
      .select("store_id,candidate_id,product_id").in("store_id",ids).limit(500),
    client.from("private_product_review_states").select("store_id,product_id,status,review_note,submitted_at")
      .in("store_id",ids).limit(100),
    client.from("supplier_listing_controls")
      .select("store_id,product_id,supplier_wants_listing,admin_gate,republish_approval_required,republish_approved,reason")
      .in("store_id",ids).limit(100),
  ]);
  if(products.error||categories.error||inventory.error||mappings.error)
    return <main className="container supplier-shell">
      <h1>Catalog temporarily unavailable.</h1>
      <p>Product and stock details could not be loaded safely.</p>
      <Link className="button secondary" href="/supplier">Back to supplier dashboard</Link>
    </main>;

  // The server-side, authorized RPC is the only source of release readiness.
  // A missing migration or RPC error must NEVER imply a publishable product.
  const releaseDecisions=new Map<string,unknown>();
  await Promise.all((products.data??[]).filter(p=>!p.is_published).map(async p=>{
    const {data,error}=await client.rpc("get_private_release_readiness",{
      p_store_id:p.store_id,p_product_id:p.id,
    });
    if(!error&&data)releaseDecisions.set(p.id,data);
  }));
  const images=new Map<string,string>();
  await Promise.all((products.data??[]).filter(p=>p.image_path).map(async product=>{
    const {data:image,error}=await client.storage.from("apex-draft-product-images")
      .createSignedUrl(product.image_path!,120);
    if(!error&&image?.signedUrl)images.set(product.id,image.signedUrl);
  }));
  const categoryNames=new Map(categories.data?.map(c=>[c.id,c.name])??[]);
  const choices=(categories.data??[]).map(c=>({id:c.id,name:c.name}));
  const stock=new Map(inventory.data?.map(item=>[item.product_id,item])??[]);
  const productsById=new Map(products.data?.map(p=>[p.id,p])??[]);
  const reviewByProduct=new Map(reviews.data?.map(r=>[r.product_id,r])??[]);
  const listingByProduct=new Map(listingControls.data?.map(r=>[r.product_id,r])??[]);
  const draftsByCandidate=new Map(mappings.data?.map(m=>[m.candidate_id,m.product_id])??[]);
  const linkedProductIds=new Set(mappings.data?.map(m=>m.product_id)??[]);
  type ProductRow=NonNullable<typeof products.data>[number];

  function productFields(product:ProductRow,allowDirectSourceEdit=false) {
    const price=Number(product.price_cents);
    const compare=product.compare_at_price_cents==null?null:Number(product.compare_at_price_cents);
    const inv=stock.get(product.id);
    const checklist=draftContentChecklist({...product,price_cents:price});
    const setup=draftSetupSteps({...product,price_cents:price},inv);
    const missingSteps=setup.steps.filter(step=>!step.complete);
    const review=reviewByProduct.get(product.id);
    const reviewStatus=review?.status??"draft";
    const listing=listingByProduct.get(product.id);
    const listingStatus=listingControlStatus(listing);
    const releaseDecision=privateReleaseDisplay(releaseDecisions.get(product.id));
    const reusableImages=canWrite?(products.data??[])
      .filter(source=>source.store_id===product.store_id&&source.id!==product.id&&
        !source.is_published&&Boolean(source.image_path)&&images.has(source.id))
      .map(source=>({
        productId:source.id,name:source.name,sku:source.sku,
        previewUrl:images.get(source.id)!,
      })):[];
    function actionHref(action:string) {
      if(action==="inventory")return "/supplier/inventory";
      if(action==="category")return choices.length>0?`#details-${product.id}`:"#add-private-category";
      return `#${action}-${product.id}`;
    }
    return <div className="apex-product-fields">
      <div className="apex-product-photo">
        {images.get(product.id)
          ? <Image src={images.get(product.id)!} alt={product.name}
              width={480} height={320} unoptimized style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          : <div className="apex-photo-placeholder">No image uploaded</div>}
      </div>
      <div className="apex-product-meta">
        <span>SKU: {product.sku}</span>
        <span>{categoryNames.get(product.category_id??"")??"Uncategorized"}</span>
        <span>{product.is_active?"Active":"Inactive"} · {product.is_published?"Published record":"Private draft"}</span>
      </div>
      <p className="apex-product-price">
        <strong>Purchase price {money(price,product.currency)}</strong>
        {compare!==null&&compare>price&&<span>
          <s>{money(compare,product.currency)}</s>
          {" "}({Math.round(100*(compare-price)/compare)}% off)
        </span>}
      </p>
      <p className="notice">{inv
        ? `Inventory: ${inv.quantity_on_hand} on hand · ${inv.quantity_reserved} reserved`
        : "Inventory not tracked"}</p>
      {!product.is_published && <section className="apex-content-checklist" aria-label="Product setup and storefront status">
        <h4>Finish this product</h4>
        <strong>Content checklist · {checklist.completed}/{checklist.total}</strong>
        <p className="notice">{checklist.contentComplete
          ? "Metadata complete for internal review. Not approved or published."
          : `Still needed: ${checklist.missing.join(", ")}.`}</p>
        <p className="apex-setup-count">
          Draft setup: {setup.completed} of {setup.total} steps complete
        </p>
        {missingSteps.length>0
          ? <ul className="apex-setup-missing">
            {missingSteps.map(step=><li key={step.id}>
              <span>{step.label}</span>
              {canWrite ? <Link href={actionHref(step.action)}>
                {step.action==="inventory"?"Manage inventory"
                  :step.action==="image"?"Manage image"
                  :step.action==="category"?(choices.length>0?"Select category":"Add category"):"Edit details"}
              </Link> : <span className="apex-setup-view-only">Owner/manager action</span>}
            </li>)}
          </ul>
          : <p className="notice">All internal product setup fields are filled. Approval remains separate.</p>}
        <details className="apex-setup-all">
          <summary>{setup.setupComplete?"8/8 complete · View checks":`View all ${setup.total} setup checks`}</summary>
          <ul>
            {setup.steps.map(step=><li key={step.id}>
              <span aria-hidden="true">{step.complete?"✓":"○"}</span>
              {" "}{step.label}: {step.complete?"Complete":"Needed"}
            </li>)}
          </ul>
        </details>
        <div className="apex-private-review-status">
          <strong>Admin review: {reviews.error?"Unavailable":internalReviewLabel(reviewStatus)}</strong>
          {review?.review_note&&<p className="notice">Admin feedback: {review.review_note}</p>}
          {reviews.error
            ? <p className="notice">Review workflow is not installed in this environment yet.</p>
            :setup.setupComplete&&canWrite&&
             (!review||reviewStatus==="changes_requested")
             ? <SupplierReviewSubmission storeId={product.store_id} productId={product.id}
                  enabled={canWrite}/>
             :<p className="notice">{!setup.setupComplete?"Finish product setup before submitting."
               :reviewStatus==="pending_review"?"Waiting for admin decision."
               :reviewStatus==="approved_internal"?"Approved for internal review only; still not published."
               :"An authorized manager can submit this draft for private review."}</p>}
        </div>
        <div className="apex-listing-intent-status">
          <h4>Supplier publishing controls</h4>
          <strong>{listingControls.error?"Not available":listingStatus.label}</strong>
          <p className="notice"><strong>Effective release decision:</strong> {releaseDecision.label}</p>
          <p className="notice">{releaseDecision.description}</p>
          {listing?.reason&&<p className="notice">Administrator note: {listing.reason}</p>}
          {listingControls.error
           ?<p className="notice">Listing controls are not installed in this environment yet.</p>
           :<SupplierListingControls storeId={product.store_id} productId={product.id}
              canEdit={canWrite&&setup.setupComplete}
              wantsListing={listing?.supplier_wants_listing??false}
              canRequest={listingStatus.canRequest}/>}
        </div>
        <div className="apex-publication-roadmap">
          <h4>Public storefront: Not enabled</h4>
          <ol>
            <li><strong>Complete product setup</strong>
              <span>{setup.setupComplete?"Done for internal data entry":"Finish the items above"}</span>
            </li>
            <li><strong>Admin and product eligibility review</strong>
              <span>{reviewStatus==="approved_internal"?"Internal content reviewed; storefront release still blocked.":
                "Awaiting separate internal content review and any required eligibility checks."}</span>
            </li>
            <li><strong>Release to storefront</strong>
              <span>Not enabled. Public listing, category/store visibility and public image delivery require an approved release workflow.</span>
            </li>
          </ol>
          <p className="notice">Supplier publication requests are saved privately, not shown to customers. An admin hold overrides the request. Public release needs separately authorized product eligibility, storefront visibility and public image delivery.</p>
        </div>
      </section>}
      {!product.is_published && canWrite && <details id={`image-${product.id}`} className="apex-card-editor">
        <summary>Manage product image</summary>
        <ProductImageUploader storeId={product.store_id} productId={product.id}
          enabled={canWrite} existingImages={reusableImages}/>
      </details>}
      {!product.is_published && <details id={`details-${product.id}`} className="apex-card-editor">
        <summary>{canWrite?"Edit details, SKU and price":"View product details (read-only)"}</summary>
        <ProductRowEditor
          storeId={product.store_id} productId={product.id} sku={product.sku} name={product.name}
          description={product.description??""} price={(price/100).toFixed(2)}
          directSourceCost={allowDirectSourceEdit
            ? product.internal_source_cost_cents==null?""
              :(Number(product.internal_source_cost_cents)/100).toFixed(2)
            : undefined}
          comparePrice={compare===null?"":(compare/100).toFixed(2)}
          isActive={product.is_active} categoryId={product.category_id}
          categories={choices} enabled={canWrite}/>
      </details>}
      {product.is_published && <p className="notice">Published records cannot be changed from the draft editor.</p>}
    </div>;
  }

  return <main className="container supplier-shell apex-products-page">
    <Link href="/supplier" className="back">← Supplier dashboard</Link>
    <p className="eyebrow">APEX / SHARED PRODUCT MANAGER</p>
    <h1>Products.</h1>
    <p className="lead">Mobile-friendly product cards for the entire shared supplier team.</p>
    <p className="notice">Read-only preview without edit access; with supplier access you can save private draft changes. Source cost is internal and never used as the customer purchase price or compare-at price.</p>
    <div className="actions">
      <Link className="button secondary" href="/supplier/inventory">Inventory</Link>
      <Link className="button secondary" href="/supplier/imports">Import review</Link>
      <Link className="button secondary" href="/supplier/discounts">Discount codes</Link>
    </div>

    <section aria-labelledby="source-products-title">
      <div className="apex-products-heading">
        <h2 id="source-products-title">Imported products ({candidates.error?"unavailable":candidates.count??0})</h2>
        <p className="notice">All variants, including Unverified wholesale cost, appear as responsive cards. Draft listings need a separately verified purchase price.</p>
      </div>
      {candidates.error?<p>Source variants are temporarily unavailable.</p>
        :!candidates.data?.length?<p>No source variants yet.</p>
        :<div className="apex-product-grid">
          {candidates.data.map(item=>{
            const linkedId=draftsByCandidate.get(item.id);
            const linkedProduct=linkedId?productsById.get(linkedId):undefined;
            return <article className="apex-product-card" key={item.id}>
              <div className="apex-product-card-head">
                <span className="eyebrow">SOURCE #{item.source_index+1} · {item.strength}</span>
                <h3>{item.product_name}</h3>
              </div>
              <p className="apex-source-state">Source review: {item.review_status.replaceAll("_"," ")}</p>
              <details className="apex-card-editor">
                <summary>{canWrite?"Review source and cost":"View source review (read-only)"}</summary>
                <SourceCostEditor storeId={item.store_id} candidateId={item.id}
                  costCents={Number(item.wholesale_cost_cents)} enabled={canWrite}/>
                <div className="apex-product-review">
                  <ImportReviewForm storeId={item.store_id} candidateId={item.id}
                    status={item.review_status} enabled={canWrite}/>
                </div>
              </details>
              {linkedProduct?productFields(linkedProduct)
               :linkedId?<p className="notice">Draft linked. Open the full catalog to locate the product.</p>
               :item.review_status==="approved_for_draft"
                 ?<PromoteReviewedVariantForm storeId={item.store_id}
                    candidateId={item.id} productName={item.product_name}
                    strength={item.strength} enabled={canWrite}/>
                 :<div className="apex-product-awaiting">
                    <p className="notice">Approve this source variant to enter its purchase price, compare-at price and create a draft. An Upload image button appears on the new draft card.</p>
                  </div>}
            </article>;
          })}
        </div>}
    </section>

    <section aria-labelledby="standalone-products-title">
      <div className="apex-products-heading">
        <h2 id="standalone-products-title">Other draft products</h2>
        <p className="notice">Products added directly, without a linked source entry.</p>
      </div>
      {!products.data?.some(p=>!linkedProductIds.has(p.id))
        ?<p className="notice">No additional products yet.</p>
        :<div className="apex-product-grid">
          {products.data.filter(p=>!linkedProductIds.has(p.id)).map(product=>
            <article className="apex-product-card" key={product.id}>
              <div className="apex-product-card-head">
                <span className="eyebrow">{product.sku}</span>
                <h3>{product.name}</h3>
              </div>
              <p className="notice">This product has its own private, editable source cost.</p>
              {productFields(product,true)}
            </article>
          )}
        </div>}
    </section>

    {stores.length===1&&<div className="apex-product-create">
      <details className="apex-create-details">
        <summary>Create private draft product</summary>
        <NewProductForm storeId={stores[0].id} enabled={canWrite} categories={choices}/>
      </details>
      <details id="add-private-category" className="apex-create-details">
        <summary>Add private category</summary>
        <NewCategoryForm storeId={stores[0].id} enabled={canWrite}/>
      </details>
    </div>}
    {!products.data?.length&&<p className="notice">No products yet. Source variants remain private until a reviewed draft is created.</p>}
    <p className="notice">No public publishing, checkout, payments, or order creation is enabled.</p>
  </main>;
}
