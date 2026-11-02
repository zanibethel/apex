-- CI-only media evidence test against disposable synthetic review fixture.
\set ON_ERROR_STOP on
\ir ../sql/apex_private_media_evidence_ledger_REVIEW_ONLY.sql

-- Isolate this test's synthetic review change: all fixture edits roll back.
begin;
update public.private_product_review_states r set status='approved_internal'
 where exists(select 1 from public.products p
  where p.id=r.product_id and p.store_id=r.store_id
   and p.sku='APX-BETA-DRAFT-002');
-- Capture immutable synthetic fixture identifiers as PostgreSQL test settings.
-- The negative inserts below use literal known inputs, not SELECT from RLS-
-- hidden rows, so a denial can never be mistaken for a no-op insert.
select set_config('apex.test.media_store',r.store_id::text,false),
 set_config('apex.test.media_product',r.product_id::text,false),
 set_config('apex.test.media_submission',r.submission_id::text,false),
 set_config('apex.test.media_path',r.snapshot->>'image_path',false)
from public.private_product_review_states r where r.status='approved_internal'
  and exists(select 1 from public.products p where p.id=r.product_id
   and p.store_id=r.store_id and p.sku='APX-BETA-DRAFT-002');


do $check$
begin
 if has_table_privilege('anon','public.private_media_evidence_events','SELECT')
 or has_table_privilege('anon','public.private_media_evidence_events','INSERT')
 or has_table_privilege('authenticated','public.private_media_evidence_events','UPDATE')
 or has_table_privilege('authenticated','public.private_media_evidence_events','DELETE')
 then raise exception 'Private evidence table privilege leak';end if;
end $check$;

set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
select set_config('request.jwt.claim.apex_role','',false);
do $check$
declare inserted boolean:=false;
begin
 if (select count(*) from public.private_media_evidence_events)<>0
 then raise exception 'Supplier can see private media evidence';end if;
 begin
  insert into public.private_media_evidence_events(
   store_id,product_id,submission_id,image_path,review_status,
   identity_reference,rights_reference,note,created_by)
  values(current_setting('apex.test.media_store')::uuid,
   current_setting('apex.test.media_product')::uuid,
   current_setting('apex.test.media_submission')::uuid,
   current_setting('apex.test.media_path'),
    'evidence_recorded','synthetic identity docs','synthetic licensed rights',
    'Supplier trying to forge an admin approval', '50000000-0000-4000-8000-000000000002');
  inserted:=true;
 exception when others then null;end;
 if inserted then raise exception 'Supplier forged media evidence';end if;
end $check$;

-- Nonadmin even with the platform user's UUID has no trusted app_metadata claim.
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
do $check$
declare inserted boolean:=false;
begin
 begin
  insert into public.private_media_evidence_events(
   store_id,product_id,submission_id,image_path,review_status,
   identity_reference,rights_reference,note,created_by)
  values(current_setting('apex.test.media_store')::uuid,
   current_setting('apex.test.media_product')::uuid,
   current_setting('apex.test.media_submission')::uuid,
   current_setting('apex.test.media_path'),
   'evidence_recorded','synthetic identity docs','synthetic licensed rights',
   'Unauthorized reviewer attempted evidence', '50000000-0000-4000-8000-000000000003');
  inserted:=true;
 exception when others then null;end;
 if inserted then raise exception 'Untrusted admin claim recorded evidence';end if;
end $check$;

select set_config('request.jwt.claim.apex_role','platform_admin',false);
insert into public.private_media_evidence_events(
 store_id,product_id,submission_id,image_path,review_status,
 identity_reference,rights_reference,note,created_by)
select r.store_id,r.product_id,r.submission_id,r.snapshot->>'image_path',
 'evidence_recorded','synthetic identity documentation','synthetic photo license documentation',
 'Image identity and photo rights independently reviewed against the exact private submission',
 '50000000-0000-4000-8000-000000000003'
from public.private_product_review_states r where r.status='approved_internal';

do $check$
declare forged boolean:=false;
begin
 if (select count(*) from public.private_media_evidence_events)<>1
 then raise exception 'Admin current-image evidence was not written';end if;
 begin
  insert into public.private_media_evidence_events(
   store_id,product_id,submission_id,image_path,review_status,
   identity_reference,rights_reference,note,created_by)
  select r.store_id,r.product_id,r.submission_id,
   replace(r.snapshot->>'image_path','000000000010.png','000000000012.png'),
   'evidence_recorded','wrong image identity evidence','wrong image licensing document',
   'Forged image path must not be accepted', '50000000-0000-4000-8000-000000000003'
  from public.private_product_review_states r where r.status='approved_internal';
  forged:=true;
 exception when others then null;end;
 if forged then raise exception 'Admin may record forged image path';end if;
 if (select count(*) from public.private_media_evidence_events)<>1
 then raise exception 'Failed attempt created an event';end if;
end $check$;

reset role;
do $check$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
 or exists(select 1 from public.private_media_evidence_events e
    join public.products p on p.store_id=e.store_id and p.id=e.product_id
    where p.is_published)
 then raise exception 'Evidence tracking enabled storefront publication';end if;
end $check$;
rollback;
\echo PASS: admin-only immutable per-submission media evidence, forged records rejected, no public release.
