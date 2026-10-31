import Link from "next/link";
import {redirect} from "next/navigation";
import {createSupplierServerClient} from "@/lib/supabase/server";
import {BulkDraftEditor} from "../bulk-editor";

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
 const [{data:products,error:productError},{data:categories,error:categoryError},{data:linked,error:linkedError}]=await Promise.all([
  client.from("products")
   .select("id,sku,name,description,price_cents,compare_at_price_cents,internal_source_cost_cents,category_id,is_active")
   .eq("store_id",store.id).eq("is_published",false).order("name").limit(100),
  client.from("categories").select("id,name").eq("store_id",store.id).order("name").limit(100),
  client.from("supplier_candidate_drafts").select("product_id").eq("store_id",store.id).limit(500),
 ]);
 if(productError||categoryError||linkedError)return <main className="container supplier-shell">
  <h1>Private catalog temporarily unavailable.</h1>
  <Link href="/supplier/catalog">Back to product manager</Link>
 </main>;
 const linkedProducts=new Set((linked??[]).map(p=>p.product_id));
 const initialRows=(products??[]).map(p=>({
  key:p.id,id:p.id,name:p.name,sku:p.sku,description:p.description??"",
  price:(Number(p.price_cents)/100).toFixed(2),
  comparePrice:p.compare_at_price_cents===null?"":(Number(p.compare_at_price_cents)/100).toFixed(2),
  sourceCost:p.internal_source_cost_cents==null?"":(Number(p.internal_source_cost_cents)/100).toFixed(2),
  linkedSource:linkedProducts.has(p.id),categoryId:p.category_id??"",isActive:p.is_active,
 }));
 return <main className="container supplier-shell apex-bulk-page">
  <Link className="back" href="/supplier/catalog">← Product manager</Link>
  <p className="eyebrow">APEX / SUPPLIER BULK PRODUCT MANAGEMENT</p>
  <h1>Add and edit multiple products</h1>
  <p className="lead">Select products, make changes, save them, then choose Preview single or Preview all before publishing.</p>
  <p className="notice">This is your private product workspace. New products begin with no stock and no image; complete those in the product manager before requesting publication. Saving here never makes anything publicly visible.</p>
  <BulkDraftEditor storeId={store.id} editable={process.env.APEX_DRAFT_CATALOG_WRITES_ENABLED==="true"}
   categories={categories??[]} initialRows={initialRows}/>
  <p className="notice">Source cost can be edited for direct drafts. Linked imported-variant source costs still use Source review. Images and stock remain on their existing management screens. Up to 100 private products are shown.</p>
 </main>;
}
