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
