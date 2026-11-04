-- PR211: denied anonymous subscriber controls, confirmed owner opt-in,
-- idempotent daily report claims, JWT-independent server token and ack.
\set ON_ERROR_STOP on
do $setup$
declare v_day date:=(now() at time zone 'America/Chicago')::date-1;
begin
 insert into apex_internal.supplier_daily_order_reports(
  store_id,report_date,recorded_order_count,pending_order_count,
  confirmed_order_count,refunded_order_count,cancelled_order_count,
  pending_gross_cents,confirmed_gross_cents,refunded_gross_cents,
  confirmed_btc_sats
 ) values(
  '62000000-0000-0000-0000-000000000001',v_day,
  1,0,1,0,0,0,2500,0,15000)
 on conflict(store_id,report_date) do update set
  recorded_order_count=excluded.recorded_order_count,
  confirmed_order_count=excluded.confirmed_order_count,
  confirmed_gross_cents=excluded.confirmed_gross_cents,
  confirmed_btc_sats=excluded.confirmed_btc_sats;
 insert into apex_internal.supplier_report_mail_worker_tokens(name,token_sha256)
 values('daily_report_sender',encode(sha256(convert_to(repeat('a',64),'UTF8')),'hex'));
end $setup$;

do $guard$
begin
 if has_table_privilege('anon','apex_internal.supplier_daily_report_email_subscriptions','SELECT')
  or has_table_privilege('authenticated','apex_internal.supplier_daily_report_email_subscriptions','UPDATE')
  or has_table_privilege('authenticated','apex_internal.supplier_report_mail_worker_tokens','SELECT')
  or not has_function_privilege('anon',
   'public.claim_supplier_daily_report_emails(text,integer)','EXECUTE')
 then raise exception 'Mail dispatch role grants incorrect';end if;
end $guard$;

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002',true);
do $owner$
declare v jsonb;
begin
 v:=public.get_supplier_daily_report_email_preference(
  '62000000-0000-0000-0000-000000000001');
 if v->>'enabled'<>'false' or v->>'recipient_verified'<>'true'
 then raise exception 'Unexpected default email opt-in';end if;
 v:=public.set_supplier_daily_report_email_preference(
  '62000000-0000-0000-0000-000000000001',true);
 if v->>'enabled'<>'true' or v->>'recipient_source'<>'verified_account_email'
 then raise exception 'Verified self opt-in rejected';end if;
end $owner$;
rollback;

-- Persist a valid opt-in as privileged setup to prove one email in the batch.
insert into apex_internal.supplier_daily_report_email_subscriptions(
 store_id,user_id,enabled)
values('62000000-0000-0000-0000-000000000001',
 '00000000-0000-0000-0000-000000000002',true);

begin;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003',true);
do $cross$
declare blocked boolean:=false;
begin
 begin perform public.get_supplier_daily_report_email_preference(
  '62000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Cross-supplier email preference leaked';end if;
 blocked:=false;
 begin perform public.set_supplier_daily_report_email_preference(
  '62000000-0000-0000-0000-000000000001',true);
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Cross-supplier email subscription tampered';end if;
end $cross$;
rollback;

begin;
set local role anon;
do $badworker$
declare blocked boolean:=false; r jsonb;
begin
 begin perform public.claim_supplier_daily_report_emails(repeat('b',64),10);
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Wrong worker token accepted';end if;
 blocked:=false;
 begin perform public.claim_supplier_daily_report_emails('',10);
 exception when insufficient_privilege then blocked:=true;end;
 if not blocked then raise exception 'Empty worker token accepted';end if;
 blocked:=false;
 begin perform public.claim_supplier_daily_report_emails(repeat('a',64),21);
 exception when invalid_parameter_value then blocked:=true;end;
 if not blocked then raise exception 'Dispatch batch limit bypassed';end if;
 r:=public.claim_supplier_daily_report_emails(repeat('a',64),10);
 if jsonb_array_length(r->'items')<>1
  or r->'items'->0->>'email'<>'supplier.fixture@example.test'
  or r->'items'->0->>'confirmed_gross_cents'<>'2500'
 then raise exception 'Claim failed or included unrelated supplier';end if;
 if jsonb_array_length(
  (public.claim_supplier_daily_report_emails(repeat('a',64),10))->'items'
 )<>0 then raise exception 'Duplicate message claimed during valid lease';end if;
 if not public.accept_supplier_daily_report_email(repeat('a',64),
  (r->'items'->0->>'dispatch_id')::uuid,'sent_verylong_123456789')
 then raise exception 'Provider acceptance could not be recorded';end if;
 if jsonb_array_length(
  (public.claim_supplier_daily_report_emails(repeat('a',64),10))->'items'
 )<>0 then raise exception 'Duplicate message after provider acceptance';end if;
end $badworker$;
rollback;

do $noorders$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
 is distinct from false
 or exists(select 1 from apex_internal.checkout_order_intents)
 or exists(select 1 from apex_internal.btcpay_invoice_post_intents)
 then raise exception 'Report emails changed storefront purchasing';end if;
end $noorders$;
select 'PASS: subscriber opt-in, independent dispatcher token, leases and no checkout';
