import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=p=>readFileSync(p,"utf8");
const sql=read("supabase/migrations/20261110011000_apex_supplier_retail_showcase_display_v1.sql");

test("retail display is an independently switchable and minimal public read, not a payment release",()=>{
 assert.match(sql,/create table if not exists apex_internal\.retail_showcase_gate/);
 assert.match(sql,/values\(true,false\)/);
 assert.match(sql,/get_public_retail_showcase_catalog/);
 assert.match(sql,/where singleton=true and enabled=true/);
 assert.match(sql,/p_limit>24/);
 assert.match(sql,/'can_checkout',false/);
 assert.match(sql,/c\.slug in \('sample-apparel','sample-accessories'\)/);
 assert.match(sql,/p\.archived_at is null and p\.is_published=false and p\.is_active=true/);
 assert.match(sql,/lc\.supplier_wants_listing=true and lc\.admin_gate='clear'/);
 assert.match(sql,/not lc\.republish_approval_required or lc\.republish_approved/);
 assert.match(sql,/i\.quantity_on_hand>i\.quantity_reserved/);
 assert.match(sql,/else 'sold_out'/);
 assert.match(sql,/quantity_reserved between 0 and i\.quantity_on_hand/);
 assert.match(sql,/listing_identity_holds/);
 assert.match(sql,/private_product_review_states/);
 assert.match(sql,/supplier_candidate_drafts/);
 assert.match(sql,/revoke all on function public\.get_public_retail_showcase_catalog/);
 assert.match(sql,/grant execute on function public\.get_public_retail_showcase_catalog\(integer,integer\) to anon,authenticated/);
 assert.doesNotMatch(sql,/update public\.products\s+set\s+is_published|update public\.stores\s+set\s+is_public|createInvoice|service_role|secret_key/);
 const from=sql.indexOf("jsonb_build_object(");
 const to=sql.indexOf(") order by eligible.name",from);
 const fields=sql.slice(from,to);
 for(const sensitive of ["source_cost","image_path","supplier_id","wallet","quantity_on_hand","quantity_reserved"])
  assert.doesNotMatch(fields,new RegExp(sensitive));
});

test("supplier publishing is scoped, confirmed, overrideable and allowed at zero stock",()=>{
 assert.match(sql,/p_action is null or p_action not in \('publish','unpublish'\)/);
 assert.match(sql,/m\.user_id=v_actor and m\.role in \('owner','manager'\)/);
 assert.match(sql,/p\.archived_at is null for update/);
 assert.match(sql,/v_state\.admin_gate<>'clear'/);
 assert.match(sql,/v_state\.republish_approval_required and not v_state\.republish_approved/);
 assert.match(sql,/sample-apparel/);
 assert.match(sql,/sample-accessories/);
 assert.match(sql,/v_product\.price_cents>999999999/);
 assert.match(sql,/create a valid inventory record before public display/i);
 assert.match(sql,/then 'Live retail display enabled; checkout remains unavailable'/);
 assert.match(sql,/supplier_listing_events/);
 assert.match(sql,/else\s+'unpublish_requested'/);
 assert.match(sql,/elsif apex_internal\.private_product_review_snapshot/);
 assert.doesNotMatch(sql,/update apex_internal\.private_release_gate/);
});

test("customer catalog displays eligible neutral products with cart-only actions and no payment path",()=>{
 const client=read("src/lib/supabase/approved-sold-out-catalog.ts");
 const page=read("src/app/catalog/page.tsx");
 const shelf=read("src/app/catalog/approved-sold-out-shelf.tsx");
 const media=read("src/app/catalog/approved-product-media.tsx");
 const detail=read("src/app/catalog/product/[id]/page.tsx");
 assert.match(client,/get_public_retail_showcase_catalog/);
 assert.match(client,/can_checkout/);
 assert.doesNotMatch(client,/get_public_inventory_catalog|service_role|SUPABASE_SECRET|stripe/);
 assert.match(page,/readApprovedSoldOutCatalog/);
 assert.match(shelf,/PUBLIC RETAIL SHOWCASE/);
 assert.match(shelf,/Checkout is currently unavailable/);
 assert.match(media,/retailShowcase\?:boolean/);
 assert.match(media,/!failed&&!retailShowcase&&<Image/);
 assert.match(detail,/retailShowcase/);
 assert.doesNotMatch(page+shelf+detail,/createInvoice|createPayment|purchaseLabel|BTCPay/);
});

test("supplier product manager and chat can request retail display but not bypass admin hold",()=>{
 const bulk=read("src/app/supplier/catalog/bulk/page.tsx");
 const actions=read("src/app/supplier/catalog/bulk-actions.ts");
 const chat=read("src/app/api/assistant/supplier/route.ts");
 const messages=read("src/lib/chat/supplier-catalog.mjs");
 const ui=read("src/app/apex-assistant.tsx");
 assert.match(bulk,/retailSetupComplete/);
 assert.match(bulk,/status\.canRequest&&!control\?\.supplier_wants_listing/);
 assert.match(bulk,/Neutral retail products display on the public catalog/);
 assert.match(actions,/\.rpc\("set_supplier_listing_intent"/);
 assert.match(actions,/Live retail display enabled/);
 assert.match(chat,/client\.auth\.getUser\(\)/);
 assert.match(chat,/originAllowed\(request\)/);
 assert.match(chat,/product\.updated_at!==body\.productUpdatedAt/);
 assert.match(chat,/requested!==body\.expectedRequested/);
 assert.match(chat,/client\.rpc\("set_supplier_listing_intent"/);
 assert.match(chat,/public:retailShowcase/);
 assert.match(messages,/retailShowcase:p\.retailShowcase===true/);
 assert.match(ui,/item\.retailShowcase/);
 assert.match(ui,/checkout and payments remain unavailable/i);
 assert.doesNotMatch(chat+actions,/service_role|SUPABASE_SECRET|createInvoice|\.update\(\{is_published:true/);
});
