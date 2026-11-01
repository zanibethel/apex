-- Synthetic regtest invoice/store snapshot; no real wallets and no hosted DB.
begin;
insert into public.suppliers(id,slug,display_name) values (
 '71000000-0000-0000-0000-000000000001',
 'apex-btcpay-disposable','Disposable BTCPay test'
);
insert into public.stores(id,supplier_id,slug,display_name) values (
 '72000000-0000-0000-0000-000000000001',
 '71000000-0000-0000-0000-000000000001',
 'apex-btcpay-disposable','Disposable BTCPay test'
);
insert into public.btcpay_test_invoices(
 apex_store_id,btcpay_store_id,invoice_id,order_reference,
 expected_amount_cents,bitcoin_network
) values (
 '72000000-0000-0000-0000-000000000001',
 :'store_id',:'invoice_id',:'order_id',1,'regtest'
);
insert into public.btcpay_test_order_status(
 btcpay_store_id,invoice_id,order_reference,expected_amount_sats
) values (:'store_id',:'invoice_id',:'order_id',:'amount_sats'::bigint);
commit;
select 'seeded';
