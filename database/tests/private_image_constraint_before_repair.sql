-- Disposable CI only. Recreate the already-observed hosted truncated image
-- path constraint so we can test the exact REVIEW_ONLY correction and preflight.
\set ON_ERROR_STOP on
ALTER TABLE public.products DROP CONSTRAINT products_private_image_path;
ALTER TABLE public.products ADD CONSTRAINT products_private_image_path
 CHECK (
   image_path IS NULL OR (
    char_length(image_path)<=180
    AND image_path ~ (
      '^' || store_id::text || '/' || id::text ||
      '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}\.(png|jpg|webp)$'
    )
   )
 );

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
DO $assert$
DECLARE accepted boolean:=false;
BEGIN
 BEGIN
  UPDATE public.products SET image_path=store_id::text||'/'||id::text||
    '/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.png'
   WHERE sku='B-NEW-DRAFT' AND is_published=false;
  IF FOUND THEN accepted:=true; END IF;
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 IF accepted THEN
  RAISE EXCEPTION 'Buggy hosted product constraint unexpectedly attached a valid UUID filename';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.products WHERE sku='B-NEW-DRAFT' AND image_path IS NULL) THEN
  RAISE EXCEPTION 'Fixture private product changed unexpectedly';
 END IF;
END $assert$;
RESET ROLE;
\echo PASS: previously-hosted image_path constraint blocks a correct UUID filename.
