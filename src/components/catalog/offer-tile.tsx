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

// Pure presentation. A customer-facing *shape* used in private previews.
// Does not fetch data, grant access, expose a private storage path or sell.
export function OfferTile({name,sku,description,category,priceCents,compareAtCents,
 imageUrl,currency,availableStock}:OfferTileProps){
 const discount=Number.isSafeInteger(compareAtCents)&&compareAtCents!==null&&
   compareAtCents>priceCents&&priceCents>0;
 const percent=discount?Math.round((1-priceCents/compareAtCents)*100):0;
 return <article className="apex-offer-tile" aria-label={`Offer preview: ${name}`}>
  <div className="apex-offer-image">
   {imageUrl?<Image src={imageUrl} alt={name} width={640} height={480}
    unoptimized style={{width:"100%",height:"100%",objectFit:"contain"}}/>
    :<div className="apex-offer-placeholder" role="img" aria-label="Product image not uploaded">Image pending</div>}
   {discount&&<span className="apex-offer-discount">{percent}% OFF</span>}
  </div>
  <div className="apex-offer-content">
   <p className="apex-offer-category">{category}</p>
   <h2>{name}</h2>
   <p className="apex-offer-sku">SKU: {sku}</p>
   <p className="apex-offer-description">{description?.trim()||"Product description coming soon."}</p>
   <div className="apex-offer-price">
    <strong>{formatPrice(priceCents,currency)}</strong>
    {discount&&<s>{formatPrice(compareAtCents,currency)}</s>}
   </div>
   <p className="apex-offer-availability">{availableStock==null?"Stock not entered":availableStock>0?"In stock":"Out of stock"}</p>
  </div>
 </article>;
}
