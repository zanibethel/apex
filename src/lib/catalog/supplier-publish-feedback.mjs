// Supplier-facing guidance only. The authenticated database RPC is the
// authority on category eligibility, product content, supplier ownership,
// visibility restrictions and administrative holds.
export function supplierPublishBlocker({row,status,editable=true,busy=false,requested=false,ready=false}){
 if(!editable)return "Product publishing changes are currently unavailable for this supplier.";
 if(busy)return "A product save or publish operation is in progress. Try again after it finishes.";
 if(!row?.id)return "Save this new product before turning on Publish.";
 if(row.needsSave)return "Save the product edits first, then tap Publish again.";
 if(requested)return null; // Unpublish should never require new setup or review.
 if(status?.kind==="hold")return "An administrator has placed this product on hold."+
  (status.reason?" Reason: "+String(status.reason).slice(0,180):"");
 if(status?.kind==="review")return "An administrator must clear a review restriction before this product can publish."+
  (status.reason?" Reason: "+String(status.reason).slice(0,180):"");
 if(!status||status.kind==="unavailable")
  return "Publishing status could not be verified. Refresh the products page and retry.";
 if(row.linkedSource)return "This product is linked to an older supplier intake and still requires separate verification.";
 if(["pending_review","changes_requested"].includes(status.reviewStatus))
  return "This product has an outstanding administrator review or requested correction.";
 const missing=Array.isArray(status.missing)?status.missing.filter(x=>typeof x==="string"&&x.trim()).slice(0,3):[];
 if(missing.length)return "Complete and save: "+missing.join(", ")+".";
 if(!ready)return "This product is not yet eligible for public display. Check category, product details and administrator restrictions.";
 return null;
}

export function supplierPublishRpcError(error,action="publish"){
 if(action==="unpublish")return "Couldn't unpublish. Refresh this product and try again.";
 const message=typeof error?.message==="string"?error.message:"";
 if(/Admin hold or review prevents listing/i.test(message))
  return "An administrator hold or review restriction prevents publishing.";
 if(/administrator visibility restriction list/i.test(message))
  return "An administrator has restricted this product's public visibility.";
 if(/Complete retail product details/i.test(message))
  return "Save the product name, positive price, description and active status before publishing.";
 if(/Only ordinary retail products/i.test(message))
  return "This product is not eligible for direct ordinary-retail publishing.";
 if(/Product is still held for review or is a linked supplier import/i.test(message))
  return "This product has a pending review or is linked to an older supplier import.";
 if(/Complete product details and stock/i.test(message))
  return "Finish the required private product details and stock setup before requesting publication.";
 if(/Private unarchived product unavailable/i.test(message))
  return "This product is no longer an editable private draft. Refresh the page.";
 return "Publishing couldn't be completed. Refresh and check product details or administrator restrictions.";
}
