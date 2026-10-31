-- CI-only integration tests after applying the actual review-only policy repair.
-- Uses synthetic suppliers, memberships and draft products; no Supabase connection.
\set ON_ERROR_STOP on

DO $assert$
BEGIN
 IF (SELECT count(*) FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects'
       AND policyname IN ('apex_member_upload_draft_image','apex_member_read_draft_image'))<>2
    OR EXISTS(SELECT 1 FROM pg_policies
      WHERE schemaname='storage' AND tablename='objects'
       AND (qual like '%storage.foldername(p.name)%'
        OR with_check like '%storage.foldername(p.name)%')) THEN
   RAISE EXCEPTION 'Storage image policies were not correctly repaired';
 END IF;
 IF has_table_privilege('authenticated','storage.objects','UPDATE')
  OR has_table_privilege('authenticated','storage.objects','DELETE')
  OR has_table_privilege('anon','storage.objects','SELECT') THEN
  RAISE EXCEPTION 'Repair accidentally broadened storage access';
 END IF;
END $assert$;

-- Beta manager can insert and read their assigned PRIVATE DRAFT image.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
-- Diagnostic until the isolated policy expression passes for a real draft path.
SELECT policyname, with_check FROM pg_policies
 WHERE schemaname='storage' AND tablename='objects'
   AND policyname='apex_member_upload_draft_image';
SELECT p.sku, auth.uid() AS actor, p.id AS product_id,
 p.store_id::text||'/'||p.id::text||'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png' AS path,
 storage.foldername(p.store_id::text||'/'||p.id::text||'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png') AS folders,
 storage.filename(p.store_id::text||'/'||p.id::text||'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png') AS filename,
 (storage.filename(p.store_id::text||'/'||p.id::text||'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png') ~
  '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}\\.(png|jpg|webp)INSERT INTO storage.objects(bucket_id,name)
 SELECT 'apex-draft-product-images',
  p.store_id::text||'/'||p.id::text||'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png'
 FROM public.products p WHERE p.sku='B-NEW-DRAFT';
DO $assert$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='apex-draft-product-images')<>1 THEN
  RAISE EXCEPTION 'Manager cannot see assigned private draft image';
 END IF;
END $assert$;

-- Beta OWNER has the same rights, including uploads.
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000005',false);
INSERT INTO storage.objects(bucket_id,name)
 SELECT 'apex-draft-product-images',
  p.store_id::text||'/'||p.id::text||'/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp'
 FROM public.products p WHERE p.sku='B-NEW-DRAFT';
DO $assert$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='apex-draft-product-images')<>2 THEN
  RAISE EXCEPTION 'Owner cannot see their supplier images';
 END IF;
END $assert$;

-- File path restrictions deny invalid extension and uploaded images for published rows.
DO $assert$
DECLARE accepted boolean;
BEGIN
 accepted:=false;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name)
   SELECT 'apex-draft-product-images',
    p.store_id::text||'/'||p.id::text||'/cccccccc-cccc-4ccc-8ccc-cccccccccccc.exe'
   FROM public.products p WHERE p.sku='B-NEW-DRAFT';
  accepted:=true;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF accepted THEN RAISE EXCEPTION 'Disallowed extension inserted'; END IF;

 accepted:=false;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name)
   SELECT 'apex-draft-product-images',
    p.store_id::text||'/'||p.id::text||'/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png'
   FROM public.products p WHERE p.sku='B-PRIVATE';
  accepted:=true;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF accepted THEN RAISE EXCEPTION 'Published private-store product allowed image upload'; END IF;
END $assert$;

-- Beta STAFF: can read assigned private product rows but cannot list/upload private images.
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000004',false);
DO $assert$
DECLARE accepted boolean:=false;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE sku='B-NEW-DRAFT') THEN
  RAISE EXCEPTION 'Staff cannot read assigned product fixture';
 END IF;
 IF EXISTS(SELECT 1 FROM storage.objects) THEN
  RAISE EXCEPTION 'Staff can read owner/manager-only private image';
 END IF;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name)
   SELECT 'apex-draft-product-images',
    p.store_id::text||'/'||p.id::text||'/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png'
   FROM public.products p WHERE p.sku='B-NEW-DRAFT';
  accepted:=true;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF accepted THEN RAISE EXCEPTION 'Staff can upload private draft image'; END IF;
END $assert$;

-- Alpha owner cannot read or write Beta private image rows.
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
DO $assert$
DECLARE accepted boolean:=false;
BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects) THEN
  RAISE EXCEPTION 'Cross supplier image leaked';
 END IF;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name) VALUES
   ('apex-draft-product-images',
    '20000000-0000-4000-8000-000000000003/40000000-0000-4000-8000-000000000006/ffffffff-ffff-4fff-8fff-ffffffffffff.png');
  accepted:=true;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF accepted THEN RAISE EXCEPTION 'Cross supplier image insertion succeeded'; END IF;
END $assert$;

-- Unaffiliated account cannot view images or upload arbitrary files.
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
DO $assert$
DECLARE accepted boolean:=false;
BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects) THEN
  RAISE EXCEPTION 'Unaffiliated image access'; END IF;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name) VALUES
   ('apex-draft-product-images',
    '20000000-0000-4000-8000-000000000003/40000000-0000-4000-8000-000000000006/99999999-9999-4999-8999-999999999999.jpg');
  accepted:=true;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF accepted THEN RAISE EXCEPTION 'Unaffiliated image upload'; END IF;
END $assert$;
RESET ROLE;

-- The anonymous role is not granted either Storage read or insert.
DO $assert$
BEGIN
 IF has_table_privilege('anon','storage.objects','SELECT')
   OR has_table_privilege('anon','storage.objects','INSERT') THEN
  RAISE EXCEPTION 'Anonymous image access unexpectedly granted';
 END IF;
END $assert$;
\echo PASS: owner and manager upload/read; staff, unrelated supplier and anon are denied.
) AS file_regex_matches,
 EXISTS (SELECT 1 FROM public.stores s JOIN public.supplier_memberships m ON m.supplier_id=s.supplier_id
   WHERE s.id=p.store_id AND s.is_public=false AND m.user_id=auth.uid() AND m.role IN('owner','manager')) AS permission_matches
 FROM public.products p WHERE p.sku='B-NEW-DRAFT';
INSERT INTO storage.objects(bucket_id,name)
 SELECT 'apex-draft-product-images',
  p.store_id::text||'/'||p.id::text||'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png'
 FROM public.products p WHERE p.sku='B-NEW-DRAFT';
DO $assert$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='apex-draft-product-images')<>1 THEN
  RAISE EXCEPTION 'Manager cannot see assigned private draft image';
 END IF;
END $assert$;

-- Beta OWNER has the same rights, including uploads.
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000005',false);
INSERT INTO storage.objects(bucket_id,name)
 SELECT 'apex-draft-product-images',
  p.store_id::text||'/'||p.id::text||'/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb.webp'
 FROM public.products p WHERE p.sku='B-NEW-DRAFT';
DO $assert$
BEGIN
 IF (SELECT count(*) FROM storage.objects WHERE bucket_id='apex-draft-product-images')<>2 THEN
  RAISE EXCEPTION 'Owner cannot see their supplier images';
 END IF;
END $assert$;

-- File path restrictions deny invalid extension and uploaded images for published rows.
DO $assert$
DECLARE accepted boolean;
BEGIN
 accepted:=false;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name)
   SELECT 'apex-draft-product-images',
    p.store_id::text||'/'||p.id::text||'/cccccccc-cccc-4ccc-8ccc-cccccccccccc.exe'
   FROM public.products p WHERE p.sku='B-NEW-DRAFT';
  accepted:=true;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF accepted THEN RAISE EXCEPTION 'Disallowed extension inserted'; END IF;

 accepted:=false;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name)
   SELECT 'apex-draft-product-images',
    p.store_id::text||'/'||p.id::text||'/dddddddd-dddd-4ddd-8ddd-dddddddddddd.png'
   FROM public.products p WHERE p.sku='B-PRIVATE';
  accepted:=true;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF accepted THEN RAISE EXCEPTION 'Published private-store product allowed image upload'; END IF;
END $assert$;

-- Beta STAFF: can read assigned private product rows but cannot list/upload private images.
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000004',false);
DO $assert$
DECLARE accepted boolean:=false;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE sku='B-NEW-DRAFT') THEN
  RAISE EXCEPTION 'Staff cannot read assigned product fixture';
 END IF;
 IF EXISTS(SELECT 1 FROM storage.objects) THEN
  RAISE EXCEPTION 'Staff can read owner/manager-only private image';
 END IF;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name)
   SELECT 'apex-draft-product-images',
    p.store_id::text||'/'||p.id::text||'/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee.png'
   FROM public.products p WHERE p.sku='B-NEW-DRAFT';
  accepted:=true;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF accepted THEN RAISE EXCEPTION 'Staff can upload private draft image'; END IF;
END $assert$;

-- Alpha owner cannot read or write Beta private image rows.
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
DO $assert$
DECLARE accepted boolean:=false;
BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects) THEN
  RAISE EXCEPTION 'Cross supplier image leaked';
 END IF;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name) VALUES
   ('apex-draft-product-images',
    '20000000-0000-4000-8000-000000000003/40000000-0000-4000-8000-000000000006/ffffffff-ffff-4fff-8fff-ffffffffffff.png');
  accepted:=true;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF accepted THEN RAISE EXCEPTION 'Cross supplier image insertion succeeded'; END IF;
END $assert$;

-- Unaffiliated account cannot view images or upload arbitrary files.
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
DO $assert$
DECLARE accepted boolean:=false;
BEGIN
 IF EXISTS(SELECT 1 FROM storage.objects) THEN
  RAISE EXCEPTION 'Unaffiliated image access'; END IF;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name) VALUES
   ('apex-draft-product-images',
    '20000000-0000-4000-8000-000000000003/40000000-0000-4000-8000-000000000006/99999999-9999-4999-8999-999999999999.jpg');
  accepted:=true;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF accepted THEN RAISE EXCEPTION 'Unaffiliated image upload'; END IF;
END $assert$;
RESET ROLE;

-- The anonymous role is not granted either Storage read or insert.
DO $assert$
BEGIN
 IF has_table_privilege('anon','storage.objects','SELECT')
   OR has_table_privilege('anon','storage.objects','INSERT') THEN
  RAISE EXCEPTION 'Anonymous image access unexpectedly granted';
 END IF;
END $assert$;
\echo PASS: owner and manager upload/read; staff, unrelated supplier and anon are denied.
