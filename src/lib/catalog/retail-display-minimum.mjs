// Pure supplier-facing retail display prerequisites. The server-side RPC
// remains authoritative for admin holds, category policy and publication.
export function retailDisplayMinimum(product){
 const missing=[];
 if(typeof product?.name!=="string"||!product.name.trim()||product.name.trim().length>120)
  missing.push("Product name");
 if(!Number.isSafeInteger(product?.price_cents)||product.price_cents<=0||
    product.price_cents>999999999)missing.push("Purchase price");
 if(typeof product?.description!=="string"||!product.description.trim()||
    product.description.trim().length>1500)missing.push("Product description");
 if(product?.is_active!==true)missing.push("Active in private catalog");
 return Object.freeze({ready:missing.length===0,missing});
}
