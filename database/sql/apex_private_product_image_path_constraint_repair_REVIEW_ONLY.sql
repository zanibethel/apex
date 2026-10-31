-- REVIEW ONLY: repair private image_path check to require a complete UUID.
-- Not applied to hosted Supabase. Only after migration-history reconciliation
-- and explicit DB approval, separately from source/preview deployments.
-- The original constraint accidentally omitted the UUID's final 12 hex chars.
BEGIN;

DO $preflight$
DECLARE old_definition text;
BEGIN
 SELECT pg_get_constraintdef(c.oid) INTO old_definition
 FROM pg_constraint c
 WHERE c.conrelid='public.products'::regclass
   AND c.conname='products_private_image_path';

 IF old_definition IS NULL
   OR position('[89ab][0-9a-f]{3}' in old_definition) = 0
   OR position('-[0-9a-f]{12}' in old_definition) > 0
 THEN
   RAISE EXCEPTION 'Apex product image-path constraint changed; re-audit before repair';
 END IF;
END $preflight$;

ALTER TABLE public.products DROP CONSTRAINT products_private_image_path;
ALTER TABLE public.products ADD CONSTRAINT products_private_image_path
 CHECK (
   image_path IS NULL OR (
     char_length(image_path) <= 180
     AND image_path ~ (
       '^' || store_id::text || '/' || id::text ||
       '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(png|jpg|webp)$'
     )
   )
 );
COMMIT;
