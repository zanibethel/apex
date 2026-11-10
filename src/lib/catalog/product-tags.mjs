// Shared deterministic tag validation for private writes and approved public reads.
// Tags are discovery metadata, never an authorization or eligibility signal.
export const MAX_PRODUCT_TAGS=12;
// No restricted vocabulary list. Exclude only nonprintable controls and CSV's | delimiter.
const UNSAFE=/[\u0000-\u001f\u007f-\u009f|]/u;
export function parseProductTags(value){
 const raw=Array.isArray(value)?value:typeof value==="string"?value.split("|"):null;
 if(!raw||raw.length>MAX_PRODUCT_TAGS)return {ok:false,tags:[],error:"Use up to 12 tags separated by |."};
 const seen=new Set(),tags=[];
 for(const part of raw){
  if(typeof part!=="string")return {ok:false,tags:[],error:"Each tag must be text."};
  if(UNSAFE.test(part))return {ok:false,tags:[],error:"Remove control characters and the | delimiter from each tag."};
  const tag=part.toLowerCase().trim().replace(/\s+/g," ");
  if(!tag)continue;
  if(tag.length>40||UNSAFE.test(tag))return {ok:false,tags:[],error:"Keep tags to 40 characters without control characters or the | delimiter."};
  if(!seen.has(tag)){seen.add(tag);tags.push(tag);}
 }
 return {ok:true,tags};
}
export const sameProductTags=(left,right)=>
 Array.isArray(left)&&Array.isArray(right)&&left.length===right.length&&left.every((v,i)=>v===right[i]);
