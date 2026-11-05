import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
test("product detail route uses only exact released public catalog page",()=>{
 const page=read("src/app/catalog/product/[id]/page.tsx");
 const projection=read("src/lib/supabase/approved-sold-out-catalog.ts");
 assert.match(page,/readApprovedSoldOutCatalog\(page\)/);
 assert.match(page,/result\.state==="connected"/);
 assert.match(page,/result\.products\.find\(item=>item\.id===id\)/);
 assert.match(page,/notFound\(\)/);
 assert.match(page,/Number\(raw\)>417/);
 assert.match(page,/product\.availability==="in_stock"/);
 assert.match(page,/Checkout is currently unavailable/);
 assert.doesNotMatch(page,/service_role|inventory_items|supabaseAdmin|createInvoice|fetch\(/);
 assert.match(projection,/private_release_gate|APEX_PUBLIC_SOLD_OUT_CATALOG/);
});
test("catalog tile links to verified product details and preserves sold-out handling",()=>{
 const shelf=read("src/app/catalog/approved-sold-out-shelf.tsx");
 assert.match(shelf,/\/catalog\/product\/\$\{p\.id\}\?page=\$\{result\.page\}/);
 assert.match(shelf,/View full details/);
 assert.match(shelf,/p\.availability==="in_stock"/);
 assert.match(shelf,/disabled className="apex-approved-disabled"/);
});
