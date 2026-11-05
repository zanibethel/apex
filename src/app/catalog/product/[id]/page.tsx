import Link from "next/link";
import {notFound} from "next/navigation";
import {SaveCatalogItem} from "@/app/cart/cart-provider";
import {ApprovedProductMedia} from "../../approved-product-media";
import {readApprovedSoldOutCatalog} from "@/lib/supabase/approved-sold-out-catalog";
import "../../sold-out-catalog.css";

export const dynamic="force-dynamic";
export const metadata={title:"Product Details | Apex Anabolics",robots:{index:false,follow:false}};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const money=(cents:number)=>new Intl.NumberFormat("en-US",{
 style:"currency",currency:"USD",
}).format(cents/100);

export default async function ProductDetails({
 params,searchParams,
}:{
 params:Promise<{id:string}>;
 searchParams:Promise<{page?:string}>;
}){
 const [{id},{page:rawPage}]=await Promise.all([params,searchParams]);
 const raw=typeof rawPage==="string"?rawPage:"1";
 if(!UUID.test(id)||!/^[1-9][0-9]{0,2}$/.test(raw)||Number(raw)>417)
  notFound();
 const page=Number(raw);
 // Release-gated, no-store public projection only. The page hint is part
 // of the URL so we never scan private data or run unbounded lookups by ID.
 const result=await readApprovedSoldOutCatalog(page);
 const product=result.state==="connected"?result.products.find(item=>item.id===id):null;
 if(!product)notFound();
 return <main className="container catalog apex-product-detail-view">
  <Link className="back" href={"/catalog?page="+page}>← Back to products</Link>
  <p className="eyebrow">APEX ANABOLICS / PRODUCT DETAILS</p>
  <article className="apex-product-detail-card">
   <ApprovedProductMedia productId={product.id} availability={product.availability}/>
   <div className="apex-approved-body">
    {product.categoryName&&<p className="eyebrow">{product.categoryName}</p>}
    <h1>{product.name}</h1>
    <p>{product.description}</p>
    <div className="apex-approved-price">
     <strong>{money(product.priceCents)}</strong>
     <span>USD · Current listed price</span>
    </div>
    {product.availability==="in_stock"?
     <SaveCatalogItem id={product.id} name={product.name} actionLabel="Add to cart"/>:
     <button type="button" disabled className="apex-approved-disabled">Sold out</button>}
    <p className="apex-approved-meta">Prices and inventory are rechecked in your cart.
     Checkout is currently unavailable.</p>
    <Link className="apex-approved-details-link" href="/cart">View cart</Link>
   </div>
  </article>
 </main>;
}
