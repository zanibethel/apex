import Image from "next/image";

type OfferTileProps={
 name:string;
 sku:string;
 description:string|null;
 category:string;
 priceCents:number;
 compareAtCents:number|null;
 imageUrl?:string;
 currency:string;
 availableStock?:number;
};

function formatPrice(cents:number,currency:string) {
 if(!Number.isSafeInteger(cents)||cents<0||currency!=="USD")return "Price unavailable";
 return new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
}

// Keep the existing detailed description editable, but present a concise card
// excerpt. A complete product writeup remains in the expandable details.
export function shortPrivateCatalogDescription(description:string|null):string{
 const raw=(description??"").trim();
 if(!raw)return "Product description coming soon.";
 const withoutImportPrefix=raw.replace(/^Supplier-listed variant:\s*[^.]{1,120}\.\s*/i,"");
 const text=withoutImportPrefix||raw;
 if(text.length<=185)return text;
 const prefix=text.slice(0,185);
 const boundary=prefix.lastIndexOf(" ");
 return (boundary>=125?prefix.slice(0,boundary):prefix).trimEnd()+"…";
}

// Pure presentation. A customer-facing *shape* used in private previews.
// Does not fetch data, grant access, expose a private storage path or sell.
export function OfferTile({name,sku,description,category,priceCents,
 imageUrl,currency,availableStock,compareAtCents}:OfferTileProps){
 // The stored 2.5× compare-at figure is a proposal, NOT a verified historical
 // or market price. Do not advertise a discount without substantiation.
 return <article className="apex-offer-tile" aria-label={`Offer preview: ${name}`}>
  <div className="apex-offer-image">
   {imageUrl?<Image src={imageUrl} alt={name} width={640} height={480}
    unoptimized style={{width:"100%",height:"100%",objectFit:"contain"}}/>
    :<div className="apex-offer-placeholder" role="img" aria-label="Apex Anabolics product image"><Image src="/apex-logo.png" alt="" width={240} height={120} style={{maxWidth:"64%",height:"auto",objectFit:"contain",opacity:.7}}/></div>}
  </div>
  <div className="apex-offer-content">
   <p className="apex-offer-category">{category}</p>
   <h2>{name}</h2>
   <p className="apex-offer-sku">SKU: {sku}</p>
   <p className="apex-offer-description">{shortPrivateCatalogDescription(description)}</p>
   {description?.trim()&&<details className="apex-offer-full-description">
    <summary>Full description</summary>
    <p>{description}</p>
   </details>}
   <div className="apex-offer-price">
    <strong>{formatPrice(priceCents,currency)}</strong>
    {compareAtCents!==null&&Number.isSafeInteger(compareAtCents)&&
     compareAtCents>priceCents&&<span className="apex-offer-reference">
      Compare at {formatPrice(compareAtCents,currency)}
     </span>}
   </div>
   <p className="apex-offer-availability">{availableStock==null?"Stock not entered":availableStock>0?"In stock":"Out of stock"}</p>
  </div>
 </article>;
}
