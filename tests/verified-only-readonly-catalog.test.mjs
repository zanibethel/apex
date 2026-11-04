import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");

test("public feed requires global opt-in, verified seller/product evidence, and supplier intent",()=>{
 const sql=read("database/sql/apex_verified_only_sold_out_feed_REVIEW_ONLY.sql");
 assert.match(sql,/singleton=true and enabled=true/);
 assert.match(sql,/supplier_wants_listing=true/);
 assert.match(sql,/admin_gate='clear'/);
 assert.match(sql,/sa.status='verified'/);
 assert.match(sql,/pa.status='verified'/);
 assert.match(sql,/sa.evidence_reference/);
 assert.match(sql,/pa.evidence_reference/);
 assert.match(sql,/sa.valid_until>=current_date/);
 assert.match(sql,/pa.valid_until>=current_date/);
 assert.match(sql,/listing_identity_holds/);
 assert.match(sql,/src.review_status='approved_for_draft'/);
 assert.match(sql,/content_review|pending_review/);
 assert.match(sql,/i.quantity_on_hand>=0/);
 assert.doesNotMatch(sql,/i.quantity_on_hand>0|v_stock_ok/);
 assert.match(sql,/security definer/);
 assert.match(sql,/revoke all on function/);
 assert.match(sql,/grant execute on function[\s\S]*to anon,authenticated/);
 assert.match(sql,/enabled=false/);
 assert.doesNotMatch(sql,/update public\.products set|update public\.stores set|create_invoice|bitcoin|checkout_url/i);
});

test("public JSON contains only non-purchasable minimal metadata, not provisional discounts",()=>{
 const sql=read("database/sql/apex_verified_only_sold_out_feed_REVIEW_ONLY.sql");
 const from=sql.indexOf("jsonb_build_object(");
 const to=sql.indexOf(") order by eligible.name");
 const projection=sql.slice(from,to);
 assert.match(projection,/'availability','sold_out'/);
 assert.match(projection,/'can_checkout',false/);
 for(const banned of ["compare_at_price_cents","source_cost","image_path","quantity_on_hand","wallet","supplier_id"]){
  assert.doesNotMatch(projection,new RegExp(banned));
 }
 const tile=read("src/components/catalog/offer-tile.tsx");
 assert.doesNotMatch(tile,/% OFF|<s>\{|apex-offer-discount/);
});

test("public Next pagination is bounded and uses the read-only verified-only RPC",()=>{
 const client=read("src/lib/supabase/approved-sold-out-catalog.ts");
 const page=read("src/app/catalog/page.tsx");
 const shelf=read("src/app/catalog/approved-sold-out-shelf.tsx");
 assert.match(client,/APEX_PUBLIC_SOLD_OUT_CATALOG!=="enabled"/);
 assert.match(client,/get_public_inventory_catalog/);
 assert.match(client,/searchParams.set\("p_offset"/);
 assert.match(client,/searchParams.set\("p_limit","24"\)/);
 assert.match(client,/raw\.length>24/);
 assert.match(page,/notFound\(\)/);
 assert.match(page,/readApprovedSoldOutCatalog\(page\)/);
 assert.match(shelf,/result.hasNext/);
 assert.match(shelf,/href=\{"\/catalog\?page="/);
});
