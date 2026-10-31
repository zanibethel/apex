#!/usr/bin/env bash
# CI only. The PostgreSQL service is disposable; never point PGHOST at Supabase.
set -euo pipefail

: "$PGHOST"
: "$PGDATABASE"
if [[ "$PGHOST" != "127.0.0.1" && "$PGHOST" != "localhost" ]]; then
  echo "Refusing to run image-policy test against a nonlocal host" >&2
  exit 2
fi
if [[ "$PGDATABASE" != "apex_test" ]]; then
  echo "Refusing to run image-policy test outside apex_test" >&2
  exit 2
fi

run_sql() { psql -X -v ON_ERROR_STOP=1 -f "$1"; }

run_sql database/tests/private_image_policy_bootstrap.sql

# Reconstruct the exact buggy policies from the corrected source without
# maintaining an independent vulnerable policy copy in version control.
# This sed transformation is used ONLY against the disposable CI database.
sed \
 -e 's/storage\.foldername(storage\.objects\.name)/storage.foldername(name)/g' \
 -e 's/storage\.filename(storage\.objects\.name)/storage.filename(name)/g' \
 database/sql/apex_private_product_images_storage.sql |
 psql -X -v ON_ERROR_STOP=1

run_sql database/tests/private_image_policy_before_repair.sql
# Exercise the actual review-only SQL, including its stored-policy preflight.
run_sql database/sql/apex_private_product_images_policy_repair_REVIEW_ONLY.sql
# Simulate hosted image_path constraint drift and verify a valid file is rejected.
run_sql database/tests/private_image_constraint_before_repair.sql
run_sql database/sql/apex_private_product_image_path_constraint_repair_REVIEW_ONLY.sql
run_sql database/tests/private_image_policy_after_repair.sql

# Repair preflight must be one-shot. Re-running against already-corrected
# policy definitions must fail without deleting the healthy policies.
if psql -X -v ON_ERROR_STOP=1 \
  -f database/sql/apex_private_product_images_policy_repair_REVIEW_ONLY.sql \
  >/tmp/apex-image-repair-repeat.log 2>&1; then
  echo "Image policy repair should reject a second application" >&2
  exit 1
fi
# The product constraint repair must also refuse a second application.
if psql -X -v ON_ERROR_STOP=1 \
  -f database/sql/apex_private_product_image_path_constraint_repair_REVIEW_ONLY.sql \
  >/tmp/apex-image-constraint-repeat.log 2>&1; then
  echo "Image path constraint repair should reject a second application" >&2
  exit 1
fi
psql -X -v ON_ERROR_STOP=1 -c "
  DO \$verify\$
  BEGIN
   IF (SELECT count(*) FROM pg_policies
       WHERE schemaname='storage' AND tablename='objects'
         AND policyname IN ('apex_member_read_draft_image',
                            'apex_member_upload_draft_image')) <> 2 THEN
      RAISE EXCEPTION 'Healthy image policies missing after rejected replay';
   END IF;
  END \$verify\$;
"
echo "PASS: private image storage policy regression and guarded repair in CI."
