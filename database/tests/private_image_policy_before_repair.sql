-- Run after the original SQL is reconstructed in disposable PostgreSQL.
-- Asserts the exact hosted name-binding regression is reproducible, not just textual.
\set ON_ERROR_STOP on

DO $assert$
BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
    AND policyname='apex_member_upload_draft_image'
    AND position('storage.foldername(p.name)' in with_check)>0
 ) OR NOT EXISTS (
  SELECT 1 FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects'
    AND policyname='apex_member_read_draft_image'
    AND position('storage.foldername(p.name)' in qual)>0
 ) THEN
  RAISE EXCEPTION 'Original buggy policy was not faithfully reconstructed';
 END IF;
END $assert$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
DO $assert$
DECLARE accepted boolean:=false;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM public.products
     WHERE sku='B-NEW-DRAFT' AND is_published=false) THEN
  RAISE EXCEPTION 'Missing private draft product fixture';
 END IF;
 BEGIN
  INSERT INTO storage.objects(bucket_id,name)
   SELECT 'apex-draft-product-images',
    p.store_id::text||'/'||p.id::text||'/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png'
   FROM public.products p WHERE p.sku='B-NEW-DRAFT';
  accepted:=true;
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 IF accepted THEN RAISE EXCEPTION 'Buggy policy unexpectedly accepted real product path'; END IF;
 IF EXISTS (SELECT 1 FROM storage.objects) THEN
  RAISE EXCEPTION 'Private storage unexpectedly returned objects before repair';
 END IF;
END $assert$;
RESET ROLE;
\echo PASS: previous image policy fails a legitimate private draft upload.
