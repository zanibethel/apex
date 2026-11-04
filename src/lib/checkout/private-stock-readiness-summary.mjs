// Summary of authenticated admin-only stock observations. Never convert an
// inventory count into public listing approval or order admission.
export function summarizePrivateStockObservations(observations){
 if(!Array.isArray(observations)||observations.length>250)
  return Object.freeze({
   status:"unverified",itemsChecked:0,stockObserved:0,inStock:0,
   soldOut:0,notVerified:0,canOpenPublicCatalog:false,canCreateOrder:false,
  });
 let observed=0,stock=0,empty=0,unknown=0;
 for(const item of observations){
  if(item&&item.observed===true&&item.status==="observed_private"&&
   Number.isSafeInteger(item.availableUnits)&&
   item.availableUnits>=0&&item.availableUnits<=1000000000&&
   item.canOrder===false&&item.canPay===false){
   observed++;
   if(item.availableUnits>0)stock++;
   else empty++;
  }else unknown++;
 }
 return Object.freeze({
  status:"private_only",itemsChecked:observations.length,
  stockObserved:observed,inStock:stock,soldOut:empty,notVerified:unknown,
  canOpenPublicCatalog:false,canCreateOrder:false,
 });
}
