-- Test-only PostgreSQL harness. Executed against ephemeral CI PostgreSQL.
-- NEVER run this fixture against Supabase: it creates mock auth roles and seed rows.
\set ON_ERROR_STOP on

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $auth$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$auth$;
GRANT USAGE ON SCHEMA auth, public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

-- Execute the actual review SQL, not a hand-reimplemented copy of its policies.
\ir ../sql/apex_catalog_foundation_review.sql

INSERT INTO auth.users (id) VALUES
  ('50000000-0000-4000-8000-000000000001'),
  ('50000000-0000-4000-8000-000000000002'),
  ('50000000-0000-4000-8000-000000000003');

INSERT INTO public.suppliers (id, slug, display_name) VALUES
  ('10000000-0000-4000-8000-000000000001', 'test-alpha', 'Synthetic Alpha'),
  ('10000000-0000-4000-8000-000000000002', 'test-beta', 'Synthetic Beta');
INSERT INTO public.stores (id, supplier_id, slug, display_name, is_public) VALUES
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'alpha-public', 'Alpha Public', true),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'beta-public', 'Beta Public', true),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', 'beta-private', 'Beta Private', false);
INSERT INTO public.supplier_memberships (supplier_id, user_id, role) VALUES
  ('10000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'owner'),
  ('10000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000002', 'manager');
INSERT INTO public.categories (id, store_id, slug, name, is_published) VALUES
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'alpha-published', 'Alpha published', true),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'alpha-hidden', 'Alpha hidden', false),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', 'beta-published', 'Beta published', true),
  ('30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', 'beta-hidden', 'Beta hidden', false),
  ('30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000003', 'beta-private-category', 'Beta private', true);
INSERT INTO public.products (id, store_id, category_id, sku, name, price_cents, is_published) VALUES
  ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'A-PUB', 'Alpha visible', 1200, true),
  ('40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', 'A-UNPUB', 'Alpha unpublished', 1200, false),
  ('40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002', 'A-HIDDEN-CAT', 'Alpha hidden category', 1200, true),
  ('40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000003', 'B-PUB', 'Beta visible', 1500, true),
  ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000004', 'B-UNPUB', 'Beta unpublished', 1500, false),
  ('40000000-0000-4000-8000-000000000006', '20000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000005', 'B-PRIVATE', 'Beta private store', 1500, true);
INSERT INTO public.inventory_items (store_id, product_id, quantity_on_hand, quantity_reserved) VALUES
  ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', 10, 2),
  ('20000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002', 3, 0),
  ('20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000004', 8, 0),
  ('20000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000006', 6, 0);

DO $assert$
BEGIN
  -- Prevent linking a product to another store's category (tenant boundary).
  BEGIN
    INSERT INTO public.products (store_id, category_id, sku, name, price_cents)
      VALUES ('20000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000001', 'CROSS-TENANT', 'Should fail', 1);
    RAISE EXCEPTION 'Cross-store category foreign key did not reject';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  -- Prevent impossible inventory values.
  BEGIN
    INSERT INTO public.inventory_items (store_id, product_id, quantity_on_hand, quantity_reserved)
      VALUES ('20000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000005', 1, 2);
    RAISE EXCEPTION 'Reserved > on-hand check did not reject';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  IF has_table_privilege('anon', 'public.suppliers', 'SELECT')
     OR has_table_privilege('anon', 'public.inventory_items', 'SELECT')
     OR has_table_privilege('authenticated', 'public.products', 'INSERT')
     OR has_table_privilege('authenticated', 'public.supplier_memberships', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.inventory_items', 'DELETE')
  THEN
    RAISE EXCEPTION 'Least privilege failed; protected data or application writes were granted';
  END IF;
  IF (SELECT count(*) FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
       WHERE n.nspname = 'public'
         AND t.relname IN ('suppliers','stores','supplier_memberships','categories','products','inventory_items')
         AND t.relrowsecurity) <> 6
  THEN
    RAISE EXCEPTION 'RLS is not enabled on all six exposed tables';
  END IF;
END $assert$;

-- Postgres uses the same role-based policy evaluation as Supabase's Data API.
SET ROLE anon;
DO $assert$
BEGIN
  IF (SELECT count(*) FROM public.stores) <> 2
     OR (SELECT count(*) FROM public.categories) <> 2
     OR (SELECT count(*) FROM public.products) <> 2
  THEN RAISE EXCEPTION 'Anonymous read leaked unpublished product/category/private store';
  END IF;
END $assert$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000003', false);
DO $assert$
BEGIN
  IF (SELECT count(*) FROM public.suppliers) <> 0
     OR (SELECT count(*) FROM public.supplier_memberships) <> 0
     OR (SELECT count(*) FROM public.inventory_items) <> 0
     OR (SELECT count(*) FROM public.products) <> 2
  THEN RAISE EXCEPTION 'Unaffiliated user gained private supplier access';
  END IF;
END $assert$;

SELECT set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000001', false);
DO $assert$
BEGIN
  IF (SELECT count(*) FROM public.suppliers) <> 1
     OR (SELECT count(*) FROM public.supplier_memberships) <> 1
     OR (SELECT count(*) FROM public.inventory_items) <> 2
     OR (SELECT count(*) FROM public.products) <> 4
     OR (SELECT count(*) FROM public.stores) <> 2
  THEN RAISE EXCEPTION 'Supplier Alpha cannot see own records or sees Beta private records';
  END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE sku IN ('B-UNPUB', 'B-PRIVATE'))
     OR EXISTS (SELECT 1 FROM public.categories WHERE slug IN ('beta-hidden', 'beta-private-category'))
  THEN RAISE EXCEPTION 'Supplier Alpha sees unpublished Beta catalog';
  END IF;
END $assert$;

SELECT set_config('request.jwt.claim.sub', '50000000-0000-4000-8000-000000000002', false);
DO $assert$
BEGIN
  IF (SELECT count(*) FROM public.suppliers) <> 1
     OR (SELECT count(*) FROM public.supplier_memberships) <> 1
     OR (SELECT count(*) FROM public.inventory_items) <> 2
     OR (SELECT count(*) FROM public.products) <> 4
     OR (SELECT count(*) FROM public.stores) <> 3
  THEN RAISE EXCEPTION 'Supplier Beta cannot see own records or sees Alpha private records';
  END IF;
  IF EXISTS (SELECT 1 FROM public.products WHERE sku IN ('A-UNPUB', 'A-HIDDEN-CAT'))
     OR EXISTS (SELECT 1 FROM public.categories WHERE slug = 'alpha-hidden')
  THEN RAISE EXCEPTION 'Supplier Beta sees unpublished Alpha catalog';
  END IF;
END $assert$;
RESET ROLE;

\echo PASS: catalog SQL executed; anonymous, unaffiliated, Alpha and Beta tenant isolation verified.
