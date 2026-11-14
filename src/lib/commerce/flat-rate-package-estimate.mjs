// Conservative dimensional estimates, NOT a USPS rate, actual fit guarantee or
// label purchase. Dimensions are PACKED-unit measurements in millimeters.
// USPS padded envelope external face: 12.5 x 9.5 in; allow 12 x 9 x 1 in
// only for flexible goods. USPS medium box interior variants are 11 x 8.5 x
// 5.5 and 13.625 x 11.875 x 3.375 inches. Slightly round DOWN in millimeters.
// Cap fill at 68% to discourage optimistic mixed-item volume packing.
const BOXES=Object.freeze([
 Object.freeze({kind:"medium",variant:"A",dimensions:[279,215,139]}),
 Object.freeze({kind:"medium",variant:"B",dimensions:[345,301,85]}),
]);
const ENVELOPE=Object.freeze({kind:"envelope",variant:"padded",dimensions:[304,228,25]});
const MAX_GRAMS=31750; // 70 lb USPS flat-rate weight limit (rounded DOWN)
const FILL=0.68;
const productId=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const dims=arr=>[...arr].sort((a,b)=>b-a);
const volume=arr=>arr[0]*arr[1]*arr[2];
const fits=(item,container)=>dims(item).every((n,i)=>n<=dims(container.dimensions)[i]);
const number=(n,max)=>Number.isSafeInteger(n)&&n>=1&&n<=max;

export function validPackedProfile(profile){
 return profile&&typeof profile==="object"&&!Array.isArray(profile)&&
  Object.keys(profile).length===6&&
  typeof profile.product_id==="string"&&productId.test(profile.product_id)&&
  number(profile.length_mm,2000)&&number(profile.width_mm,2000)&&
  number(profile.height_mm,2000)&&number(profile.weight_g,MAX_GRAMS)&&
  typeof profile.flexible==="boolean";
}

// First-fit-decreasing approximation; each unit must individually fit the
// chosen container, plus a conservative volume/weight allowance for additions.
// It can overestimate packages; fulfillment confirms physical fit.
function pack(items,preferred="A",envelopes=false){
 const medium=[...BOXES].sort((a,b)=>a.variant===preferred?-1:b.variant===preferred?1:0);
 const bins=[];
 for(const item of items){
  const order=envelopes&&item.flexible?[ENVELOPE,...medium]:medium;
  const allowed=order.filter(container=>fits(item.dimensions,container));
  if(allowed.length===0)return null;
  const cb=allowed.find(container=>{
   const v=volume(container.dimensions);
   return bins.some(bin=>bin.container===container&&bin.weightG+item.weight_g<=MAX_GRAMS&&
    bin.usedVolume+item.volume<=Math.max(Math.floor(v*FILL),item.volume)&&
    // never squeeze a full-size item into an occupied package
    bin.usedVolume<=Math.floor(v*FILL));
  });
  let bin=cb?bins.find(bin=>bin.container===cb&&
   bin.weightG+item.weight_g<=MAX_GRAMS&&
   bin.usedVolume+item.volume<=Math.max(Math.floor(volume(cb.dimensions)*FILL),item.volume)&&
   bin.usedVolume<=Math.floor(volume(cb.dimensions)*FILL)):undefined;
  if(!bin){
   // Prefer the least-cost compatible medium or padded envelope, with a
   // smaller carton variant first. The other candidate plans cover choices.
   const container=allowed[0];
   bin={container,units:0,weightG:0,usedVolume:0};
   bins.push(bin);
  }
  bin.units++;
  bin.weightG+=item.weight_g;
  bin.usedVolume+=item.volume;
  if(bins.length>50)return null;
 }
 return bins;
}
const sum=arr=>arr.reduce((n,item)=>n+item,0);
/**
 * @param {{productId:string,quantity:number}[]} lines
 * @param {Array<object|null>} profiles One exact source profile per line.
 * @param {{flat_shipping_cents:number,medium_flat_shipping_cents:number}} policy
 */
export function estimateFlatRatePackages(lines,profiles,policy){
 if(!Array.isArray(lines)||lines.length<1||lines.length>20||
  !Array.isArray(profiles)||profiles.length!==lines.length||
  !policy||!Number.isSafeInteger(policy.flat_shipping_cents)||
  !Number.isSafeInteger(policy.medium_flat_shipping_cents)||
  policy.flat_shipping_cents<0||policy.medium_flat_shipping_cents<policy.flat_shipping_cents)
  return {ok:false,reason:"invalid_profiles"};
 const units=[];
 const ids=new Set();
 for(let i=0;i<lines.length;i++){
  const line=lines[i],p=profiles[i];
  if(!line||typeof line.productId!=="string"||!productId.test(line.productId)||
   ids.has(line.productId)||!number(line.quantity,10))
   return {ok:false,reason:"invalid_profiles"};
  ids.add(line.productId);
  if(p===null)return {ok:false,reason:"missing_profiles"};
  if(!validPackedProfile(p)||p.product_id!==line.productId)
   return {ok:false,reason:"invalid_profiles"};
  const dimensions=[p.length_mm,p.width_mm,p.height_mm];
  const unit={dimensions,volume:volume(dimensions),weight_g:p.weight_g,flexible:p.flexible};
  if(!BOXES.some(b=>fits(dimensions,b)))return {ok:false,reason:"oversize"};
  for(let n=0;n<line.quantity;n++)units.push(unit);
 }
 if(units.length>50)return {ok:false,reason:"invalid_profiles"};
 units.sort((a,b)=>b.volume-a.volume||b.weight_g-a.weight_g);
 const candidates=[];
 for(const prefer of ["A","B"]){
  for(const envelopes of [false,true]){
   const bins=pack(units,prefer,envelopes);
   if(!bins)continue;
   const fees=bins.map(b=>b.container.kind==="envelope"?
    policy.flat_shipping_cents:policy.medium_flat_shipping_cents);
   candidates.push({bins,cost:sum(fees)});
  }
 }
 if(!candidates.length)return {ok:false,reason:"oversize"};
 candidates.sort((a,b)=>a.cost-b.cost||a.bins.length-b.bins.length);
 const chosen=candidates[0];
 return {
  ok:true,
  shippingBoxSize:chosen.bins.some(x=>x.container.kind==="medium")?"medium":"small",
  shippingPackages:chosen.bins.map(b=>({
   kind:b.container.kind==="envelope"?"padded_envelope":"medium_box",
   variant:b.container.variant,units:b.units,weightGrams:b.weightG,
   feeCents:b.container.kind==="envelope"?
    policy.flat_shipping_cents:policy.medium_flat_shipping_cents,
  })),
  packageCount:chosen.bins.length,
  originalShippingCents:chosen.cost,
 };
}
