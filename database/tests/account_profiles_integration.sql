-- Disposable PostgreSQL only; catalog_rls_integration.sql creates synthetic auth users/roles first.
-- Apply the exact review SQL and verify that private profile data stays per-account.
\set ON_ERROR_STOP on
\ir ../sql/apex_account_profiles_review.sql

DO $checks$
BEGIN
  IF has_table_privilege('anon','public.account_profiles','SELECT')
    OR has_table_privilege('authenticated','public.account_profiles','DELETE')
    OR NOT has_table_privilege('authenticated','public.account_profiles','INSERT')
    OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='public.account_profiles'::regclass)
  THEN RAISE EXCEPTION 'Account profile grants / RLS are incorrect'; END IF;
END $checks$;

SET ROLE anon;
DO $checks$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.account_profiles;
    RAISE EXCEPTION 'Anonymous user accessed private account profiles';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $checks$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
INSERT INTO public.account_profiles(user_id,first_name,city)
 VALUES ('50000000-0000-4000-8000-000000000001','Alpha','Lubbock');
DO $checks$
BEGIN
  IF (SELECT count(*) FROM public.account_profiles) <> 1
     OR (SELECT city FROM public.account_profiles LIMIT 1) <> 'Lubbock'
  THEN RAISE EXCEPTION 'Owner did not read own contact record'; END IF;

  BEGIN
    INSERT INTO public.account_profiles(user_id,first_name)
      VALUES ('50000000-0000-4000-8000-000000000002','Spoof');
    RAISE EXCEPTION 'Account A inserted Account B profile';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.account_profiles SET user_id='50000000-0000-4000-8000-000000000002'
      WHERE user_id='50000000-0000-4000-8000-000000000001';
    RAISE EXCEPTION 'Account A reassigned own profile to another owner';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $checks$;

SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
DO $checks$
BEGIN
  IF (SELECT count(*) FROM public.account_profiles) <> 0
  THEN RAISE EXCEPTION 'Account B can read Account A profile'; END IF;
END $checks$;
INSERT INTO public.account_profiles(user_id,first_name,city)
 VALUES ('50000000-0000-4000-8000-000000000002','Beta','Dallas');
UPDATE public.account_profiles SET city='Austin'
 WHERE user_id='50000000-0000-4000-8000-000000000001';
DO $checks$
BEGIN
  IF (SELECT count(*) FROM public.account_profiles) <> 1
     OR (SELECT first_name FROM public.account_profiles LIMIT 1) <> 'Beta'
  THEN RAISE EXCEPTION 'Account B private profile access failed'; END IF;
END $checks$;

SELECT set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
DO $checks$
BEGIN
  IF (SELECT count(*) FROM public.account_profiles) <> 1
     OR (SELECT city FROM public.account_profiles LIMIT 1) <> 'Lubbock'
  THEN RAISE EXCEPTION 'Account B changed Account A contact data'; END IF;
END $checks$;
RESET ROLE;

\echo PASS: personal profile RLS, anonymous denial, cross-user write denial verified.
