import Link from "next/link";
import Image from "next/image";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {NewCategoryForm,NewProductForm,ProductRowEditor} from "../operations/forms";
import {ImportReviewForm} from "../imports/review-form";
import {PromoteReviewedVariantForm} from "../imports/promote-form";
import {ProductImageUploader} from "./image-uploader";
import {SourceCostEditor} from "./source-cost-editor";

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
    stores.length===1&&!stores[0].is_public;

  const [products,categories,inventory,candidates,mappings]=await Promise.all([
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
  ]);
  if(products.error||categories.error||inventory.error||mappings.error)
    return <main className="container supplier-shell">
      <h1>Catalog temporarily unavailable.</h1>
      <p>Product and stock details could not be loaded safely.</p>
      <Link className="button secondary" href="/supplier">Back to supplier dashboard</Link>
    </main>;

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
  const draftsByCandidate=new Map(mappings.data?.map(m=>[m.candidate_id,m.product_id])??[]);
  const linkedProductIds=new Set(mappings.data?.map(m=>m.product_id)??[]);
  type ProductRow=NonNullable<typeof products.data>[number];

  function productFields(product:ProductRow,allowDirectSourceEdit=false) {
    const price=Number(product.price_cents);
    const compare=product.compare_at_price_cents==null?null:Number(product.compare_at_price_cents);
    const inv=stock.get(product.id);
    return <div className="apex-product-fields">
      <div className="apex-product-photo">
        {images.get(product.id)
          ? <Image src={images.get(product.id)!} alt={product.name}
              width={480} height={320} unoptimized style={{width:"100%",height:"100%",objectFit:"cover"}}/>
          : <div className="apex-photo-placeholder">No image uploaded</div>}
      </div>
      {!product.is_published &&
        <ProductImageUploader storeId={product.store_id} productId={product.id} enabled={canWrite}/>}
      <div className="apex-product-meta">
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
      {!product.is_published
        ? <ProductRowEditor
          storeId={product.store_id} productId={product.id} name={product.name}
          description={product.description??""} price={(price/100).toFixed(2)}
          directSourceCost={allowDirectSourceEdit
            ? product.internal_source_cost_cents==null?""
              :(Number(product.internal_source_cost_cents)/100).toFixed(2)
            : undefined}
          comparePrice={compare===null?"":(compare/100).toFixed(2)}
          isActive={product.is_active} categoryId={product.category_id}
          categories={choices} enabled={canWrite}/>
        : <p className="notice">Published records cannot be changed from the draft editor.</p>}
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
              <SourceCostEditor storeId={item.store_id} candidateId={item.id}
                costCents={Number(item.wholesale_cost_cents)} enabled={canWrite}/>
              <div className="apex-product-review">
                <ImportReviewForm storeId={item.store_id} candidateId={item.id}
                  status={item.review_status} enabled={canWrite}/>
              </div>
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
      <NewProductForm storeId={stores[0].id} enabled={canWrite} categories={choices}/>
      <NewCategoryForm storeId={stores[0].id} enabled={canWrite}/>
    </div>}
    {!products.data?.length&&<p className="notice">No products yet. Source variants remain private until a reviewed draft is created.</p>}
    <p className="notice">No public publishing, checkout, payments, or order creation is enabled.</p>
  </main>;
}
