// Pure private showroom simulation. It cannot grant public availability,
// make a purchase, update stock, or change supplier publishing intent.
export function initialShowroomState(products){
 const state={};
 for(const p of Array.isArray(products)?products:[]){
  if(typeof p?.id!=="string")continue;
  state[p.id]={visible:p.active===true,inStock:p.initialInStock===true};
 }
 return state;
}
export function showroomVisible(products,state,query="",category=""){
 const term=String(query).trim().toLowerCase();
 return (Array.isArray(products)?products:[]).filter(p=>
  state?.[p.id]?.visible===true &&
  (!category||p.category===category) &&
  (!term||[p.name,p.sku,p.category].some(s=>String(s??"").toLowerCase().includes(term)))
 );
}
export function showroomCartSummary(products,state,cart){
 const byId=new Map((Array.isArray(products)?products:[]).map(p=>[p.id,p]));
 let count=0,subtotalCents=0;
 const items=[];
 for(const [id,quantity] of Object.entries(cart??{})){
  const p=byId.get(id);
  if(!p||state?.[id]?.visible!==true||state?.[id]?.inStock!==true||
     !Number.isSafeInteger(quantity)||quantity<=0||quantity>10||
     !Number.isSafeInteger(p.priceCents)||p.priceCents<0)continue;
  count+=quantity;subtotalCents+=p.priceCents*quantity;
  items.push({id,name:p.name,quantity,priceCents:p.priceCents});
 }
 return {count,subtotalCents,items};
}
