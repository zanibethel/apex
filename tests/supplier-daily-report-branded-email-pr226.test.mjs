import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {renderSupplierDailyOrderHtml} from "../src/lib/supplier/daily-order-email-html.mjs";
const sample={
 report_date:"2026-11-03",recorded_order_count:0,
 confirmed_order_count:0,pending_order_count:0,
 refunded_order_count:0,cancelled_order_count:0,
 confirmed_gross_cents:"0",pending_gross_cents:"0",
 refunded_gross_cents:"0",confirmed_btc_sats:"0",
};
test("automated daily report has branded responsive HTML matching text figures",()=>{
 const html=renderSupplierDailyOrderHtml(sample);
 assert.match(html,/<!doctype html>/i);
 assert.match(html,/<meta name="viewport"/);
 assert.match(html,/table-layout:fixed/);
 assert.match(html,/APEX <span[^>]*>ANABOLICS/);
 assert.match(html,/Daily Order Report/);
 assert.match(html,/2026-11-03 · Central Time/);
 assert.match(html,/Recorded orders/);
 assert.match(html,/Confirmed gross/);
 assert.match(html,/\$0\.00/);
 assert.match(html,/No verified orders were recorded/);
 assert.match(html,/https:\/\/apexanabolics\.co\/supplier\/reports\/daily/);
 assert.doesNotMatch(html,/TEST EMAIL|fictitious|fake payment|src="https|customer_address|shipping_label/i);
});
test("nonzero and cancelled figures render correctly without an empty-sales notice",()=>{
 const html=renderSupplierDailyOrderHtml({
  ...sample,
  recorded_order_count:19,confirmed_order_count:10,pending_order_count:6,
  refunded_order_count:2,cancelled_order_count:1,
  confirmed_gross_cents:"109995",pending_gross_cents:"2075",
  refunded_gross_cents:"3125",confirmed_btc_sats:"12500",
 });
 assert.match(html,/\$1,099\.95/);
 assert.match(html,/\$20\.75/);
 assert.match(html,/\$31\.25/);
 assert.match(html,/12500 sats/);
 assert.doesNotMatch(html,/No verified orders were recorded/);
});
test("invalid or injected report fields are rejected before HTML rendering",()=>{
 for(const v of [
  {...sample,report_date:'<script>alert(1)</script>'},
  {...sample,confirmed_gross_cents:"100<script>"},
  {...sample,recorded_order_count:1},
  {...sample,confirmed_order_count:-1},
  {...sample,confirmed_btc_sats:'1" onclick="alert(1)'},
  {...sample,pending_order_count:0.5},
 ])assert.throws(()=>renderSupplierDailyOrderHtml(v),/Invalid supplier daily report/);
});
test("live cron always sends HTML and plain text, unchanged tenant and idempotency protections",()=>{
 const src=readFileSync("src/app/api/cron/daily-supplier-reports/route.ts","utf8");
 assert.match(src,/html:renderSupplierDailyOrderHtml\(item\)/);
 assert.match(src,/text:emailText\(item\)/);
 assert.match(src,/claim_supplier_daily_report_emails/);
 assert.match(src,/accept_supplier_daily_report_email/);
 assert.match(src,/to:\[item.email\]/);
 assert.match(src,/Idempotency-Key/);
 assert.match(src,/request\.headers\.get\("authorization"\)/);
 assert.doesNotMatch(src,/customer_address|NEXT_PUBLIC_RESEND|service_role|purchaseLabel/);
});
