// Private supplier card review snapshot. Used by the server preview and
// tests; the DB trigger independently checks every field before recording.
export const SUPPLIER_OPTION_BATCH="supplier-initial-2026-11-05";
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function supplierParentSnapshot(sourceRows){
 if(!Array.isArray(sourceRows)||sourceRows.length<1||sourceRows.length>100)return null;
 const ids=new Set();
 const sorted=[...sourceRows].sort((a,b)=>
  Number(a.source_row)-Number(b.source_row)||String(a.id).localeCompare(String(b.id)));
 const result=[];
 for(const r of sorted){
  if(!r||typeof r!=="object"||typeof r.id!=="string"||!ID.test(r.id)||
   ids.has(r.id)||!Number.isSafeInteger(r.source_row)||r.source_row<2||
   !["pending_review","needs_clarification"].includes(r.review_status)||
   !["","MCT","GSO"].includes(r.carrier_oil))return null;
  const fields=["source_name","source_section","strength","size","review_note"];
  if(fields.some(field=>typeof r[field]!=="string"))return null;
  const price=r.retail_price_cents==null?"":String(r.retail_price_cents);
  if(price!==""&&!/^[1-9]\d{0,8}$/.test(price))return null;
  ids.add(r.id);
  result.push({
   id:r.id.toLowerCase(),row:r.source_row,
   sourceName:r.source_name,section:r.source_section,
   strength:r.strength,size:r.size,carrier:r.carrier_oil,
   price,status:r.review_status,note:r.review_note,
  });
 }
 return result;
}

const snapshotTuple=rows=>{
 if(!Array.isArray(rows))return null;
 return rows.map(r=>[
  r?.id,r?.row,r?.sourceName,r?.section,r?.strength,r?.size,
  r?.carrier,r?.price,r?.status,r?.note,
 ]);
};

export function sameSupplierParentSnapshot(previous,current){
 const a=snapshotTuple(previous),b=snapshotTuple(current);
 return a!==null&&b!==null&&JSON.stringify(a)===JSON.stringify(b);
}

// Source ingredient lists sometimes contain slashes and can be much longer
// than ordinary strength labels. They are details, NOT invented variants.
export function reviewFormula(strength){
 if(typeof strength!=="string")return "";
 return strength.includes("/")||strength.length>40?strength:"";
}
