// Strict portable CSV for private sales-history review. Does not touch
// shipping, payment or fulfillment state.
export const HEADERS=[
 "store_id","order_reference","purchased_at_utc",
 "sale_state","gross_cents","review_state","review_note","version",
];
const UUID=/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const PURCHASE=/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const REVIEW=new Set(["unreviewed","reviewed","needs_attention"]);
const SALE=new Set(["pending","confirmed","refunded","cancelled"]);
const safeValue=(x)=>x===null||x===undefined?"":String(x);
const escapeCell=(v)=>{
 let cell=safeValue(v);
 if(/^[=+\-@\t\r]/.test(cell))cell="'"+cell;
 return /[",\n\r]/.test(cell)?'"'+cell.replace(/"/g,'""')+'"':cell;
};
export function serializeSalesReviewCsv(rows,storeId){
 if(!UUID.test(storeId)||!Array.isArray(rows)||rows.length>500)
  throw Error("Invalid verified sales export");
 const lines=[HEADERS.join(",")];
 for(const r of rows){
  if(!r||typeof r!=="object"||!r.order_reference||
   !PURCHASE.test(r.purchased_at_utc)||!SALE.has(r.sale_state)||
   !/^(0|[1-9]\d*)$/.test(r.gross_cents)||
   !REVIEW.has(r.review_state)||!Number.isSafeInteger(r.version))
   throw Error("Invalid source order row");
  lines.push(HEADERS.map(h=>escapeCell(h==="store_id"?storeId:r[h])).join(","));
 }
 return lines.join("\r\n")+"\r\n";
}
export function parseCsvCells(input,{maxRows=301,maxChars=250000}={}){
 if(typeof input!=="string"||input.length>maxChars)
  throw Error("CSV exceeds allowed size");
 const rows=[];let current=[],cell="",quoted=false,afterQuote=false;
 for(let i=0;i<input.length;i++){
  const c=input[i];
  if(quoted){
   if(c==='"'&&input[i+1]==='"'){cell+='"';i++;}
   else if(c==='"'){quoted=false;afterQuote=true;}
   else cell+=c;
   continue;
  }
  if(afterQuote){
   if(c===','){current.push(cell);cell="";afterQuote=false;}
   else if(c==="\n"||c==="\r"){
    current.push(cell);cell="";afterQuote=false;
    if(current.some(x=>x!=="")){rows.push(current);if(rows.length>maxRows)throw Error("Too many CSV rows");}
    current=[];
    if(c==="\r"&&input[i+1]==="\n")i++;
   }else throw Error("Malformed quoted CSV field");
   continue;
  }
  if(c==='"'){
   if(cell!=="")throw Error("Quote inside unquoted CSV cell");
   quoted=true;
  }else if(c===','){current.push(cell);cell="";}
  else if(c==="\n"||c==="\r"){
   current.push(cell);cell="";
   if(current.some(x=>x!=="")){rows.push(current);if(rows.length>maxRows)throw Error("Too many CSV rows");}
   current=[];
   if(c==="\r"&&input[i+1]==="\n")i++;
  }else cell+=c;
 }
 if(quoted)throw Error("Unclosed quoted CSV field");
 if(cell!==""||current.length){
  current.push(cell);
  if(current.some(x=>x!==""))rows.push(current);
 }
 if(rows.length>maxRows)throw Error("Too many CSV rows");
 return rows;
}
const undoCsvProtection=x=>/^'[=+\-@\t\r]/.test(x)?x.slice(1):x;
const sameRow=(a,b)=>HEADERS.every(h=>safeValue(a[h])===safeValue(b[h]));
export function parseSalesReviewImport(csv,expectedStoreId){
 if(!UUID.test(expectedStoreId))throw Error("No authorized store");
 const rows=parseCsvCells(csv);
 if(!rows.length||rows[0].join(",")!==HEADERS.join(","))
  throw Error("Unsupported CSV template: download a current Apex report first");
 const unique=new Map(),duplicated=[];
 for(const cells of rows.slice(1)){
  if(cells.length!==HEADERS.length)throw Error("Wrong number of CSV columns");
  const row=Object.fromEntries(HEADERS.map((h,i)=>[h,undoCsvProtection(cells[i])]));
  if(row.store_id!==expectedStoreId)throw Error("CSV contains another store");
  if(!row.order_reference||row.order_reference.length>200||
   !PURCHASE.test(row.purchased_at_utc)||
   !Number.isFinite(Date.parse(row.purchased_at_utc))||
   !SALE.has(row.sale_state)||
   !/^(0|[1-9]\d{0,15})$/.test(row.gross_cents)||
   !REVIEW.has(row.review_state)||
   row.review_note.length>240||
   !/^(0|[1-9]\d{0,6})$/.test(row.version))
    throw Error("Invalid order identity or review value");
  const normalized={...row,version:Number(row.version)};
  const prior=unique.get(row.order_reference);
  if(prior){
   if(!sameRow(prior,{...normalized,version:String(normalized.version)}))
    throw Error("Conflicting duplicate order reference: "+row.order_reference);
   duplicated.push(row.order_reference);
   continue;
  }
  unique.set(row.order_reference,normalized);
 }
 if(unique.size<1||unique.size>300)throw Error("Report must contain 1–300 unique orders");
 return Object.freeze({
  rows:[...unique.values()],duplicatesInFile:duplicated.length,
  uniqueOrders:unique.size,
 });
}
export function parseVerifiedReviewRows(payload,storeId){
 if(!payload||typeof payload!=="object"||Array.isArray(payload)||
  payload.schema_version!==1||payload.store_id!==storeId||
  payload.source!=="verified_sales_history"||
  payload.shipping_data_available!==false||
  !Number.isSafeInteger(payload.total)||payload.total<0||
  typeof payload.truncated!=="boolean"||!Array.isArray(payload.rows)||
  payload.rows.length>500||payload.rows.length>payload.total)return null;
 const seen=new Set();
 for(const row of payload.rows){
  if(!row||typeof row!=="object"||!row.order_reference||
   seen.has(row.order_reference)||!PURCHASE.test(row.purchased_at_utc)||
   !SALE.has(row.sale_state)||!REVIEW.has(row.review_state)||
   !/^(0|[1-9]\d*)$/.test(row.gross_cents)||
   typeof row.review_note!=="string"||row.review_note.length>240||
   !Number.isSafeInteger(row.version)||row.version<0)return null;
  seen.add(row.order_reference);
 }
 return Object.freeze({total:payload.total,truncated:payload.truncated,rows:payload.rows});
}
