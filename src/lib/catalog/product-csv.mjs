// Spreadsheet-compatible private draft catalog CSV. No server-side parsing,
// external CSV dependency, network access or product publication actions.
export const PRODUCT_CSV_HEADERS=Object.freeze([
 "product_id","sku","title","description","source_cost","price",
 "compare_at_price","category","active",
]);
export const PRODUCT_CSV_TEMPLATE=PRODUCT_CSV_HEADERS.join(",")+"\r\n";
const DANGEROUS_SHEET_CELL=/^[\s\u0000-\u001f]*[=+@\-]/u;
const PRICE=/^\d{1,7}(?:\.\d{1,2})?$/;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SKU=/^[A-Za-z0-9._-]{1,60}$/;
const MAX_FILE_BYTES=256000;
export function csvCell(value){
 const original=String(value??"");
 // Neutralize spreadsheet formula execution on exported text. Do not modify
 // imported product data; formula-looking input is rejected instead.
 const safe=DANGEROUS_SHEET_CELL.test(original)?"'"+original:original;
 return '"'+safe.replaceAll('"','""')+'"';
}
export function buildProductCsv(rows){
 return PRODUCT_CSV_HEADERS.join(",")+"\r\n"+
  rows.map(row=>PRODUCT_CSV_HEADERS.map(key=>csvCell(row[key])).join(",")).join("\r\n")+
  (rows.length?"\r\n":"");
}
// RFC4180 quoted multiline CSV parser with fail-closed header checking.
export function parseProductCsv(text){
 if(typeof text!=="string"||new TextEncoder().encode(text).length>MAX_FILE_BYTES)
  return {rows:[],errors:["CSV must be a text file no larger than 256 KB."]};
 const source=text.replace(/^\uFEFF/,"");
 const lines=[];let cells=[];let field="";let quoted=false;let justClosed=false;
 let line=1,rowStart=1;const errors=[];
 for(let i=0;i<source.length;i++){
  const ch=source[i],next=source[i+1];
  if(quoted){
   if(ch==='"'&&next==='"'){field+='"';i++;continue}
   if(ch==='"'){quoted=false;justClosed=true;continue}
   if(ch==="\n")line++;
   if(ch==="\r"){line++;if(next==="\n"){field+="\r\n";i++;continue}}
   field+=ch;continue;
  }
  if(ch==='"'&&!field&&!justClosed){quoted=true;continue}
  if(ch==='"'){errors.push("Unexpected quote near CSV line "+line+".");break}
  if(ch===","||ch==="\n"||ch==="\r"){
   cells.push(field);field="";justClosed=false;
   if(ch===",")continue;
   if(cells.some(c=>c!==""))lines.push({line:rowStart,values:cells});
   cells=[];if(ch==="\r"&&next==="\n")i++;
   line++;rowStart=line;continue;
  }
  if(justClosed&&ch!==" "&&ch!=="\t"){errors.push("Unexpected characters after closing quote on line "+line+".");break}
  if(justClosed){if(ch===" "||ch==="\t")continue}
  field+=ch;
 }
 if(quoted)errors.push("CSV has an unclosed quoted field.");
 if(errors.length)return {rows:[],errors};
 cells.push(field);
 if(cells.some(c=>c!==""))lines.push({line:rowStart,values:cells});
 if(!lines.length)return {rows:[],errors:["CSV is empty. Download the template first."]};
 const [headerRow,...values]=lines;
 const headers=headerRow.values.map(v=>v.trim().toLowerCase());
 const duplicate=headers.filter((h,i)=>headers.indexOf(h)!==i);
 const unknown=headers.filter(h=>!PRODUCT_CSV_HEADERS.includes(h));
 if(duplicate.length||unknown.length||!headers.includes("title")||!headers.includes("price")){
  return {rows:[],errors:[
   ...(duplicate.length?["Duplicate columns: "+[...new Set(duplicate)].join(", ")]:[]),
   ...(unknown.length?["Unknown columns: "+unknown.join(", ")]:[]),
   ...(!headers.includes("title")||!headers.includes("price")
    ?["Required CSV columns: title, price."]:[]),
  ]};
 }
 if(values.length>100)return {rows:[],errors:["Import up to 100 product rows at a time."]};
 const rows=[];const rowErrors=[];
 for(const {line:lineNo,values:fields} of values){
  if(fields.length!==headers.length){rowErrors.push("Line "+lineNo+": expected "+headers.length+" columns; found "+fields.length+".");continue}
  const item=Object.fromEntries(headers.map((h,i)=>[h,fields[i].trim()]));
  const badText=["title","description","category","sku"].find(k=>DANGEROUS_SHEET_CELL.test(item[k]??""));
  if(badText){rowErrors.push("Line "+lineNo+": formula-style content not permitted in "+badText+".");continue}
  if((item.title??"").length<1||(item.title??"").length>120 ||
     (item.description??"").length>1500 ||
     (item.sku&&!SKU.test(item.sku)) ||
     (item.product_id&&!UUID.test(item.product_id)) ||
     !PRICE.test(item.price||"")||Number(item.price)<=0 ||
     (item.source_cost&&!PRICE.test(item.source_cost)) ||
     (item.compare_at_price&&(!PRICE.test(item.compare_at_price)||
        Number(item.compare_at_price)<=Number(item.price))) ||
     (item.active&&!["true","false","yes","no","1","0"].includes(item.active.toLowerCase())) ||
     (item.category??"").length>80){
   rowErrors.push("Line "+lineNo+": check title, SKU, prices, category and active value.");continue;
  }
  rows.push({line:lineNo,...item});
 }
 return {rows,errors:rowErrors};
}
