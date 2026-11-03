import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {parseAdminCheckoutJournalSummary} from "../src/lib/checkout/admin-private-order-journal.mjs";

const read=path=>readFileSync(path,"utf8");
const safe={
 status:"journal_foundation",held_order_records:0,held_provider_intents:0,
 invoice_post_enabled:false,checkout_enabled:false,
};
test("read-only journal status validates exact, held-only aggregate",()=>{
 const value=parseAdminCheckoutJournalSummary(safe);
 assert.deepEqual(value,{
  heldOrderRecords:0,heldProviderIntents:0,
  invoicePostEnabled:false,checkoutEnabled:false,
 });
 assert.ok(Object.isFrozen(value));
 assert.deepEqual(parseAdminCheckoutJournalSummary({...safe,
  held_order_records:1,held_provider_intents:1}),{
   heldOrderRecords:1,heldProviderIntents:1,
   invoicePostEnabled:false,checkoutEnabled:false,
 });
 for(const invalid of [
  null,undefined,[],{},
  {...safe,status:"paid"},
  {...safe,held_order_records:-1},
  {...safe,held_order_records:"1"},
  {...safe,held_order_records:0,held_provider_intents:1},
  {...safe,invoice_post_enabled:true},
  {...safe,checkout_enabled:true},
  {...safe,customer_email:"do-not-expose"},
 ])assert.equal(parseAdminCheckoutJournalSummary(invalid),null);
});
test("migration installs private durable, held-only and immutable tables",()=>{
 const sql=read("supabase/migrations/20261103150000_apex_private_checkout_order_journal.sql");
 const integration=read("tests/payout-rls/private-checkout-order-journal.sql");
 const workflow=read(".github/workflows/payout-rls.yml");
 assert.match(sql,/create table apex_internal\.checkout_order_intents/);
 assert.match(sql,/create table apex_internal\.btcpay_invoice_post_intents/);
 assert.match(sql,/unique\(store_id,idempotency_hash\)/);
 assert.match(sql,/unique\(store_id,order_id\)/);
 assert.match(sql,/unique\(provider_store_id,provider_order_ref\)/);
 assert.match(sql,/foreign key\(order_id,store_id\)/);
 assert.match(sql,/force row level security/);
 assert.match(sql,/deny_checkout_journal_mutation/);
 assert.match(sql,/status='held_no_post'/);
 assert.match(sql,/status='held_no_payment'/);
 assert.match(sql,/private_release_gate/);
 assert.match(sql,/revoke all on table apex_internal\.checkout_order_intents/);
 assert.match(sql,/get_admin_checkout_journal_overview/);
 assert.match(sql,/app_metadata,apex_role/);
 assert.doesNotMatch(sql,/createInvoice|fetch\(|createPayout|UPDATE public\.products|is_published=true|enabled=true/i);
 assert.match(integration,/Duplicate idempotent request accepted/);
 assert.match(integration,/Provider amount mismatch accepted/);
 assert.match(integration,/Supplier inserted a provider intent/);
 assert.match(integration,/Order journal could be rewritten/);
 assert.match(integration,/Private journal published products/);
 assert.match(workflow,/private-checkout-order-journal\.sql/);
});
test("admin aggregate has no browser write path and payment remains explicitly disabled",()=>{
 const page=read("src/app/admin/payment-monitor/page.tsx");
 assert.match(page,/isVerifiedPlatformAdmin\(identity.user\)/);
 assert.match(page,/rpc\("get_admin_checkout_journal_overview"\)/);
 assert.match(page,/parseAdminCheckoutJournalSummary\(journalRead.data\)/);
 assert.match(page,/Order and invoice safety journal/);
 assert.match(page,/Invoice submission<\/span><strong>Disabled/);
 assert.match(page,/Customer checkout<\/span><strong>Disabled/);
 assert.match(page,/href="\/admin\/btcpay"/);
 assert.doesNotMatch(page,/createInvoice|\.from\("checkout_order_intents"\)|\.insert\(|\.update\(|\.upsert\(/);
});
