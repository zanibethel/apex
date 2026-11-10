// Shared deterministic tag validation for private writes and approved public reads.
// Tags are discovery metadata, never an authorization or eligibility signal.
export const MAX_PRODUCT_TAGS=12;
const ALLOWED=/^[a-z0-9][a-z0-9 '&/-]{0,39}$/;
export function parseProductTags(value){
 const raw=Array.isArray(value)?value:typeof value==="string"?value.split("|"):null;
 if(!raw||raw.length>MAX_PRODUCT_TAGS)return {ok:false,tags:[],error:"Use up to 12 tags separated by |."};
 const seen=new Set(),tags=[];
 for(const part of raw){
  if(typeof part!=="string")return {ok:false,tags:[],error:"Each tag must be text."};
  const tag=part.toLowerCase().trim().replace(/\s+/g," ");
  if(!tag)continue;
  if(!ALLOWED.test(tag))return {ok:false,tags:[],error:"Tags must be 1-40 characters using letters, numbers, spaces, apostrophes, &, / or -."};
  if(!seen.has(tag)){seen.add(tag);tags.push(tag);}
 }
 return {ok:true,tags};
}
export const sameProductTags=(left,right)=>
 Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((v,i)=>v===right[i]);
