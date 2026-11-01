#!/usr/bin/env bash
# PR #127: build a NEW disposable PostgreSQL database on the upstream regtest
# runner. DO NOT invoke against hosted Supabase or a production database.
set -euo pipefail
test "${CI:-}" = true
test "${GITHUB_ACTIONS:-}" = true
test "${APEX_BTCPAY_EPHEMERAL:-}" = true
test "${APEX_BTCPAY_TEST_NETWORK:-}" = regtest
test "${PGHOST:-}" = localhost
test "${PGPORT:-}" = 5432
test "${PGUSER:-}" = postgres
test "${PGDATABASE:-}" = apex_test
test -n "${PGPASSWORD:-}"
psql -X -d postgres -v ON_ERROR_STOP=1 -q -c 'CREATE DATABASE apex_test'
files=(
 tests/payout-rls/btcpay-real-provider-second-db-bootstrap.sql
 supabase/migrations/20261029233701_apex_initial_catalog_readonly.sql
 supabase/migrations/20261030222500_payout_reporting_readonly.sql
 supabase/migrations/20261030233000_multi_split_draft_rpc.sql
 supabase/migrations/20261030234500_payout_recipient_admin.sql
 database/sql/apex_btcpay_test_receipt_journal_REVIEW_ONLY.sql
 database/sql/apex_btcpay_test_order_status_REVIEW_ONLY.sql
 database/sql/apex_btcpay_test_split_activation_REVIEW_ONLY.sql
 database/sql/apex_btcpay_test_invoice_sync_hold_REVIEW_ONLY.sql
 database/sql/apex_btcpay_test_sync_recovery_audit_REVIEW_ONLY.sql
 database/sql/apex_btcpay_test_dual_control_release_REVIEW_ONLY.sql
 database/sql/apex_btcpay_test_atomic_resume_fence_REVIEW_ONLY.sql
 database/sql/apex_btcpay_test_external_prepost_intent_REVIEW_ONLY.sql
 database/sql/apex_btcpay_test_trusted_pg_worker_REVIEW_ONLY.sql
)
for file in "${files[@]}"; do
 psql -X -q -v ON_ERROR_STOP=1 -f "$file" >/dev/null
done
echo "PASS: fresh isolated PostgreSQL schema for real-loopback BTCPay worker"
