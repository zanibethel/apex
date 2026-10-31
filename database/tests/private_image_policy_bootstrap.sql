-- Isolated CI-only fixture. Run after catalog and supplier operations tests.
-- NEVER execute this against Supabase. Fake storage schema stands in for Storage service.
\set ON_ERROR_STOP on

CREATE SCHEMA storage;
CREATE TABLE storage.buckets (
 id text primary key,
 name text not null,
 public boolean not null default false,
 file_size_limit integer,
 allowed_mime_types text[]
);
CREATE TABLE storage.objects (
 bucket_id text not null references storage.buckets(id),
 name text not null,
 primary key(bucket_id,name)
);
CREATE FUNCTION storage.foldername(object_name text) RETURNS text[]
LANGUAGE sql IMMUTABLE AS $function$
 select case when position('/' in object_name)=0 then array[]::text[]
  else (string_to_array(object_name,'/'))[1:cardinality(string_to_array(object_name,'/'))-1]
 end;
$function$;
CREATE FUNCTION storage.filename(object_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $function$
 select (string_to_array(object_name,'/'))[cardinality(string_to_array(object_name,'/'))];
$function$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO authenticated;
GRANT EXECUTE ON FUNCTION storage.foldername(text), storage.filename(text) TO authenticated;
GRANT SELECT, INSERT ON storage.objects TO authenticated;
-- There is no public read access or supplier UPDATE/DELETE privilege.

INSERT INTO auth.users(id) VALUES
 ('50000000-0000-4000-8000-000000000004'),
 ('50000000-0000-4000-8000-000000000005');
INSERT INTO public.supplier_memberships(supplier_id,user_id,role) VALUES
 ('10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000004','staff'),
 ('10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000005','owner');

DO $assert$
BEGIN
 IF has_table_privilege('anon','storage.objects','SELECT')
  OR has_table_privilege('authenticated','storage.objects','UPDATE')
  OR has_table_privilege('authenticated','storage.objects','DELETE') THEN
  RAISE EXCEPTION 'Unexpected storage access grant in fixture';
 END IF;
 IF storage.foldername('a/b/c.png') <> ARRAY['a','b']
  OR storage.foldername('product-title') <> ARRAY[]::text[]
  OR storage.filename('a/b/c.png') <> 'c.png' THEN
  RAISE EXCEPTION 'Storage helper fixture differs from documented path behavior';
 END IF;
END $assert$;

\echo Fixture ready: disposable image bucket and staff / owner users.
