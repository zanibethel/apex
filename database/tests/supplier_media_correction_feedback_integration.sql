-- CI ONLY. Run after private_media_evidence_integration.sql.
-- All synthetic notes are rolled back and never touch hosted supplier data.
\set ON_ERROR_STOP on
\ir ../sql/apex_supplier_media_correction_feedback_REVIEW_ONLY.sql
begin;

select set_config('apex.test.media_store',r.store_id::text,false),
 set_config('apex.test.media_product',r.product_id::text,false),
 set_config('apex.test.media_submission',r.submission_id::text,false),
 set_config('apex.test.media_path',r.snapshot->>'image_path',false)
from public.private_product_review_states r
where exists(select 1 from public.products p
 where p.id=r.product_id and p.store_id=r.store_id
  and p.sku='APX-BETA-DRAFT-002');
do $check$
begin
 if nullif(current_setting('apex.test.media_path',true),'') is null
 then raise exception 'No synthetic review image available';end if;
 if has_table_privilege('anon','public.supplier_media_feedback_events','SELECT')
 or has_table_privilege('authenticated','public.supplier_media_feedback_events','UPDATE')
 or has_table_privilege('authenticated','public.supplier_media_feedback_events','DELETE')
 then raise exception 'Supplier feedback permission regression';end if;
end $check$;

set role authenticated;
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000003',false);
select set_config('request.jwt.claim.apex_role','platform_admin',false);
insert into public.private_media_evidence_events(
 store_id,product_id,submission_id,image_path,review_status,
 identity_reference,rights_reference,note,created_by)
values(current_setting('apex.test.media_store')::uuid,
 current_setting('apex.test.media_product')::uuid,
 current_setting('apex.test.media_submission')::uuid,
 current_setting('apex.test.media_path'),'needs_correction',
 'SECRET_INTERNAL_IDENTITY_REF','SECRET_PRIVATE_RIGHTS_REF',
 'Replace the wrong product image and attach a corrected label photo.',
 '50000000-0000-4000-8000-000000000003');

do $check$
begin
 if (select count(*) from public.supplier_media_feedback_events)<>0
 then raise exception 'Admin unexpectedly accessed supplier-only feedback';end if;
end $check$;
-- Supplier table SELECT policy is intentionally owner/manager only.
select set_config('request.jwt.claim.apex_role','',false);
select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000002',false);
do $check$
declare feedback record;forged boolean:=false;
begin
 if (select count(*) from public.private_media_evidence_events)<>0
 then raise exception 'Private admin evidence exposed to supplier';end if;
 select * into feedback from public.supplier_media_feedback_events limit 1;
 if not found or feedback.outcome<>'needs_correction'
   or feedback.supplier_note<>'Replace the wrong product image and attach a corrected label photo.'
 then raise exception 'Supplier cannot read its own correction note';end if;
 if row_to_json(feedback)::text like '%SECRET_INTERNAL_IDENTITY_REF%'
  or row_to_json(feedback)::text like '%SECRET_PRIVATE_RIGHTS_REF%'
 then raise exception 'Private admin evidence leaked through supplier row';end if;
 begin
  insert into public.supplier_media_feedback_events(
   evidence_event_id,store_id,product_id,submission_id,image_path,
   outcome,supplier_note,created_at)
  values(gen_random_uuid(),feedback.store_id,feedback.product_id,
   feedback.submission_id,feedback.image_path,feedback.outcome,
   'Supplier forged correction',now());
  forged:=true;
 exception when others then null;end;
 if forged then raise exception 'Supplier forged feedback record';end if;
end $check$;

select set_config('request.jwt.claim.sub','50000000-0000-4000-8000-000000000001',false);
do $check$
begin
 if exists(select 1 from public.supplier_media_feedback_events)
 then raise exception 'Cross-store supplier read another supplier correction note';end if;
end $check$;
reset role;
do $check$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
 or exists(select 1 from public.products where is_published
  and id=current_setting('apex.test.media_product')::uuid)
 then raise exception 'Correction feedback accidentally changed public release';end if;
end $check$;
rollback;
\echo PASS: supplier sees only its own correction note; admin evidence stays private, writes denied, release OFF.
