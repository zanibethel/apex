// A private, content-only checklist to help suppliers finish draft metadata.
// This is NOT an approval, publication or product eligibility determination.
// Keep this pure/read-only; never grant access or change is_published based on it.
export function draftContentChecklist(product) {
  const fields = [
    {label:"Name",complete:typeof product.name==="string" && product.name.trim().length>0},
    {label:"SKU",complete:typeof product.sku==="string" && product.sku.trim().length>0},
    {label:"Description",complete:typeof product.description==="string" && product.description.trim().length>0},
    {label:"Category",complete:typeof product.category_id==="string" && product.category_id.length>0},
    {label:"Image",complete:typeof product.image_path==="string" && product.image_path.length>0},
    {label:"Price",complete:Number.isSafeInteger(product.price_cents) && product.price_cents>0},
  ];
  const completed=fields.filter(field=>field.complete).length;
  return {
    completed,
    total:fields.length,
    missing:fields.filter(field=>!field.complete).map(field=>field.label),
    contentComplete:completed===fields.length,
  };
}


// UI-only setup status for a *private* supplier draft. An "all complete"
// result means the owner filled these fields, never that a product is eligible,
// approved, published or publicly purchasable.
export function draftSetupSteps(product, inventory) {
  const count=Number(inventory?.quantity_on_hand);
  const reserved=Number(inventory?.quantity_reserved);
  const validStock=Number.isSafeInteger(count)&&count>0&&
    Number.isSafeInteger(reserved)&&reserved>=0&&reserved<=count;
  const positivePrice=Number.isSafeInteger(product.price_cents)&&product.price_cents>0;
  const steps=[
    {id:"name",label:"Product name",complete:typeof product.name==="string"&&Boolean(product.name.trim()),action:"details"},
    {id:"sku",label:"Unique SKU",complete:typeof product.sku==="string"&&Boolean(product.sku.trim()),action:"details"},
    {id:"description",label:"Product description",complete:typeof product.description==="string"&&Boolean(product.description.trim()),action:"details"},
    {id:"category",label:"Product category",complete:typeof product.category_id==="string"&&Boolean(product.category_id),action:"category"},
    {id:"image",label:"Saved product image",complete:typeof product.image_path==="string"&&Boolean(product.image_path),action:"image"},
    {id:"price",label:"Purchase price",complete:positivePrice,action:"details"},
    {id:"active",label:"Active in internal catalog",complete:product.is_active===true,action:"details"},
    {id:"stock",label:"Confirmed stock on hand",complete:validStock,action:"inventory"},
  ];
  const completed=steps.filter(step=>step.complete).length;
  return {steps,completed,total:steps.length,remaining:steps.length-completed,
    setupComplete:completed===steps.length};
}
