import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const read=path=>readFileSync(path,"utf8");
const flow=read(".github/workflows/btcpay-upstream-regtest.yml");
const script=read("scripts/btcpay-ephemeral-greenfield.mjs");
const receiver=read("scripts/btcpay-ephemeral-webhook.mjs");
const bridge=read("scripts/btcpay-ephemeral-pg-journal.mjs");
const receipt=read("database/sql/apex_btcpay_test_receipt_journal_REVIEW_ONLY.sql");
const status=read("database/sql/apex_btcpay_test_order_status_REVIEW_ONLY.sql");

test("runner actually launches upstream BTCPay and confirms Bitcoin Core regtest",()=>{
 assert.match(flow,/git -C "\$\{RUNNER_TEMP\}\/btcpayserver" fetch --depth 1 origin "\$\{UPSTREAM_REF\}"/);
 assert.match(flow,/git -C "\$\{RUNNER_TEMP\}\/btcpayserver" rev-parse HEAD/);
 assert.match(flow,/docker compose up -d bitcoind nbxplorer postgres/);
 assert.match(flow,/getblockchaininfo/);
 assert.match(flow,/\.chain == "regtest"/);
 assert.match(flow,/dotnet run --project BTCPayServer\/BTCPayServer\.csproj/);
 assert.match(flow,/http:\/\/127\.0\.0\.1:14142/);
 assert.match(flow,/APEX_BTCPAY_TEST_NETWORK: regtest/);
 assert.match(flow,/APEX_BTCPAY_PAY_REGTEST: "true"/);
 assert.match(flow,/APEX_BTCPAY_VERIFY_WEBHOOK: "true"/);
 assert.match(flow,/APEX_BTCPAY_DURABLE_TEST_JOURNAL: "true"/);
 assert.match(flow,/docker compose down --volumes --remove-orphans/);
});
test("never use hosted credentials or remote mainnet payment endpoints",()=>{
 assert.match(flow,/permissions:\s*\n\s*contents: read/);
 assert.doesNotMatch(flow,/\$\{\{\s*secrets\.|mainnet|btcpay.*\.co\b/i);
 assert.match(receiver,/server\.listen\(port,"127\.0\.0\.1"/);
 assert.match(receiver,/parseVerifiedInvoiceEvent\(raw,signature,secret,storeId\)/);
 assert.match(script,/createEphemeralWebhookJournal/);
 assert.match(bridge,/Disposable regtest PostgreSQL bridge only/);
 assert.match(bridge,/btcpay-live-journal-record[.]sql/);
 assert.match(status,/record_verified_btcpay_event/);
});
test("signed receipt must persist before a 200 acknowledgment and duplicate never bumps status",()=>{
 const process=receiver.slice(receiver.indexOf("async function process(raw,signature)"),
  receiver.indexOf("async function begin(port=0)"));
 assert.match(process,/await recordVerified\(\{event,invoice,payloadSha256:hash\}\)/);
 assert.match(process,/receipts\.set\(event\.deliveryId/);
 assert.ok(process.indexOf("await recordVerified({event,invoice,payloadSha256:hash})")<
   process.indexOf("receipts.set(event.deliveryId"));
 assert.match(process,/saved!=="duplicate"/);
 assert.match(receiver,/res\.writeHead\(result\.status\)\.end\(\)/);
 assert.match(bridge,/recordVerified:|recordVerified/);
 assert.match(status,/on conflict \(btcpay_store_id,delivery_id\) do nothing/);
 assert.match(status,/if v_inserted is null then/);
 assert.match(status,/return 'duplicate';/);
 assert.match(status,/for update/);
});
test("receipt SQL remains review-only in disposable PG, not a live migration",()=>{
 assert.match(receipt,/REVIEW-ONLY \(not a Supabase migration\)/);
 assert.match(receipt,/enable row level security/);
 assert.match(receipt,/revoke all on public\.btcpay_test_invoices/);
 assert.match(status,/REVIEW ONLY: durable, regtest-only/);
 assert.match(status,/SECURITY INVOKER/i);
 assert.match(flow,/PGDATABASE: apex_journal_ci/);
 assert.match(flow,/Initialize synthetic Apex test receipt and status schema in disposable PostgreSQL/);
 assert.match(flow,/psql -X -v ON_ERROR_STOP=1 -f database\/sql\/apex_btcpay_test_receipt_journal_REVIEW_ONLY.sql/);
 assert.match(flow,/psql -X -v ON_ERROR_STOP=1 -f database\/sql\/apex_btcpay_test_order_status_REVIEW_ONLY.sql/);
 assert.match(script,/durableReceiptJournalVerified/);
 for(const p of ["src/app/page.tsx","src/app/catalog/page.tsx",
  "src/app/supplier/operations/actions.ts"]){
   const runtime=read(p);
   assert.doesNotMatch(runtime,/btcpay-ephemeral|btcpay_test_|apex_test_internal\.record_verified_btcpay_event/);
 }
});
