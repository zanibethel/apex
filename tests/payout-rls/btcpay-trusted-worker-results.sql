-- Final, trustworthy disposable DB assertions. No real provider or payment.
\set ON_ERROR_STOP on
do $$
declare v_count integer;
begin
 if (select count(*) from public.btcpay_test_provider_post_intents
    where scope_id in ('39000000-0000-0000-0000-000000000001',
                      '39000000-0000-0000-0000-000000000002'))<>2 then
   raise exception 'Exactly two separate persisted worker intents expected';
 end if;
 if (select count(*) from public.btcpay_test_provider_post_observations o
     join public.btcpay_test_provider_post_intents i on i.id=o.intent_id
     where i.scope_id in ('39000000-0000-0000-0000-000000000001',
                          '39000000-0000-0000-0000-000000000002'))<>2 then
   raise exception 'Each intent must have one durable observation';
 end if;
 if not exists(select 1 from public.btcpay_test_provider_post_observations o
    join public.btcpay_test_provider_post_intents i on i.id=o.intent_id
    where i.scope_id='39000000-0000-0000-0000-000000000001'
     and o.kind='invoice_seen_by_readback'
     and o.provider_invoice_id='synthetic_worker_invoice_1') then
   raise exception 'Verified provider invoice was not durably recorded';
 end if;
 if not exists(select 1 from public.btcpay_test_provider_post_observations o
    join public.btcpay_test_provider_post_intents i on i.id=o.intent_id
    where i.scope_id='39000000-0000-0000-0000-000000000002'
      and o.kind='post_outcome_unknown' and o.provider_invoice_id is null) then
   raise exception 'Unknown outcome must be durably recorded without invoice ID';
 end if;
 if (select count(*) from public.btcpay_test_checkout_resume_permits p
   where p.scope_id in ('39000000-0000-0000-0000-000000000001',
                        '39000000-0000-0000-0000-000000000002')
     and p.status='consumed')<>2 then
   raise exception 'Both pre-POST authorizations must be permanently consumed';
 end if;
 if (select count(*) from public.btcpay_test_split_sync_holds h
   where h.scope_id in ('39000000-0000-0000-0000-000000000001',
                        '39000000-0000-0000-0000-000000000002')
    and h.status='held')<>2 then
   raise exception 'Dual test storefront sync holds must remain active';
 end if;
 if exists(select 1 from public.btcpay_test_invoices
   where apex_store_id in ('39000000-0000-0000-0000-000000000001',
                            '39000000-0000-0000-0000-000000000002')) then
   raise exception 'The external worker must not register public checkout invoices';
 end if;
 if exists(select 1 from public.payout_rules
   where id in ('29000000-0000-0000-0000-000000000001',
                '29000000-0000-0000-0000-000000000002')
     and status<>'draft') then
   raise exception 'Trusted worker cannot activate payout rules';
 end if;
 if has_table_privilege('authenticated',
    'public.btcpay_test_trusted_post_store_bindings','INSERT') or
    has_table_privilege('anon',
    'public.btcpay_test_trusted_post_store_bindings','SELECT') then
   raise exception 'Untrusted principal can change/read store bindings';
 end if;
end $$;
