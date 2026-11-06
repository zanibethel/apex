// Pure, read-only product option selection for an approved public variant feed.
// Never derives prices, creates missing combinations, or changes inventory.
export const PRODUCT_OPTION_PICKER_VERSION=1;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LABEL=/^[A-Za-z0-9][A-Za-z0-9 .,_()+-]{0,39}$/;
const KEYS=["id","carrierOil","strength","size","retailPriceCents"];
const FIELDS=["carrierOil","strength","size"];
const exact=(value,keys)=>value&&typeof value==="object"&&!Array.isArray(value)&&
  Object.keys(value).length===keys.length&&Object.keys(value).every(key=>keys.includes(key));
const canonical=x=>x.trim().replace(/\s+/g," ");
const key=row=>JSON.stringify([row.carrierOil,row.strength.toLowerCase(),row.size.toLowerCase()]);

export function validateProductOptions(rows){
 if(!Array.isArray(rows)||rows.length===0||rows.length>100)return null;
 const ids=new Set(),options=new Set(),result=[];
 for(const input of rows){
  if(!exact(input,KEYS)||typeof input.id!=="string"||!UUID.test(input.id)||
   typeof input.carrierOil!=="string"||!["","MCT","GSO"].includes(input.carrierOil)||
   typeof input.strength!=="string"||typeof input.size!=="string"||
   !Number.isSafeInteger(input.retailPriceCents)||input.retailPriceCents<=0||
   input.retailPriceCents>999999999)return null;
  const row=Object.freeze({
   id:input.id.toLowerCase(),carrierOil:input.carrierOil,
   strength:canonical(input.strength),size:canonical(input.size),
   retailPriceCents:input.retailPriceCents,
  });
  if((row.strength&&!LABEL.test(row.strength))||
     (row.size&&!LABEL.test(row.size))||
     ids.has(row.id)||options.has(key(row)))return null;
  ids.add(row.id);options.add(key(row));result.push(row);
 }
 return Object.freeze(result);
}

// Oil determines the available strengths; oil + strength determine sizes.
// Never display a combination unless it exists in the supplied list.
export function productOptionChoices(rows,selectedId,field){
 const variants=validateProductOptions(rows);
 if(!variants||!FIELDS.includes(field))return [];
 const current=variants.find(v=>v.id===selectedId)||variants[0];
 const filtered=field==="carrierOil"?variants:
  field==="strength"?variants.filter(v=>v.carrierOil===current.carrierOil):
  variants.filter(v=>v.carrierOil===current.carrierOil&&v.strength===current.strength);
 return [...new Set(filtered.map(v=>v[field]))];
}

export function pickProductOption(rows,selectedId,field,value){
 const variants=validateProductOptions(rows);
 if(!variants||!FIELDS.includes(field)||typeof value!=="string")return null;
 const current=variants.find(v=>v.id===selectedId)||variants[0];
 const allowed=productOptionChoices(variants,current.id,field);
 if(!allowed.includes(value))return current;
 const candidates=variants.filter(v=>v[field]===value&&
  (field==="carrierOil"||v.carrierOil===current.carrierOil)&&
  (field!=="size"||v.strength===current.strength));
 if(!candidates.length)return current;
 // Preserve the other selections when possible, otherwise move to a
 // real supported combination. The source order makes ties deterministic.
 const score=v=>(v.carrierOil===current.carrierOil?4:0)+
  (v.strength===current.strength?2:0)+(v.size===current.size?1:0);
 return candidates.reduce((best,next)=>score(next)>score(best)?next:best,candidates[0]);
}
