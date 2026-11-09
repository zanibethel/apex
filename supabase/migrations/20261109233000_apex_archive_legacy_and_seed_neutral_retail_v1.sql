-- Apex neutral-retail transition, v1. Product data is preserved, not deleted.
-- This migration assumes the legacy 63-product draft store exists and prevents
-- accidental archiving of any newly created product added after the snapshot.
-- No public publication, payment, BTCPay or admin release switches are changed.
begin;

alter table public.products
 add column if not exists archived_at timestamptz;

comment on column public.products.archived_at is
 'Reversible historical catalog archive marker; null means available to private supplier editors. Never a public-release authorization.';

-- Archived products must not ever become published without first being restored.
alter table public.products
 add constraint apex_archived_products_not_published
 check (archived_at is null or is_published = false);

create index if not exists apex_products_active_supplier_catalog_idx
 on public.products(store_id,name) where archived_at is null;

do $legacy$
declare
 legacy_store uuid := 'bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3';
 legacy_ids uuid[] := array[
  '0004cf85-50cc-4ee7-8e52-3979b6ce5763'::uuid,
  '050b7cfa-ddf0-42a8-b8ea-1100c95fd2ba'::uuid,
  '06cbb056-673a-405c-a20a-8b2c57646450'::uuid,
  '072a3633-2b86-4961-8e7e-a92aefd6842f'::uuid,
  '09d60cea-e2be-4fe4-b9de-eb1a61d3fd8d'::uuid,
  '0bad8ec2-af74-4f97-846b-67f15d5e5c8e'::uuid,
  '0ced81d6-fd85-42ba-ac59-163d4197821e'::uuid,
  '0d2f72d0-775a-4529-87e2-32623b7c7ecb'::uuid,
  '10837a7a-723d-4435-bdbb-c7a7ea6c5185'::uuid,
  '18f203eb-d404-455d-b86a-2069174547c3'::uuid,
  '1a697975-4c9c-4794-8c0d-766ae4ab67c4'::uuid,
  '1b954bcc-4584-4ba0-a9fd-16ffcf807a28'::uuid,
  '2af49c0d-223a-4a87-83bb-f2c8a208db49'::uuid,
  '31cc623b-e05b-4eb5-bd65-deb68838dff8'::uuid,
  '3877702b-a0e7-41b3-a142-df65cfdbf0b0'::uuid,
  '3ee75e8e-0570-4cd8-b0e7-69e4098fa0ba'::uuid,
  '41e3958c-62c2-4fec-81d7-e1cf86e22ec3'::uuid,
  '41f49d21-d9f7-40fc-9746-9029c47b6283'::uuid,
  '41fd4125-99f0-4ef9-b8f4-a68fefd0f5c2'::uuid,
  '44a40ead-bd19-446e-b55b-6409b4742d80'::uuid,
  '5044bb4d-394e-43e0-baa1-304c0cfce8de'::uuid,
  '528b509f-6567-4ad9-bc2a-830b6f744b59'::uuid,
  '59804ccd-040a-4937-a63f-8c22d72ee045'::uuid,
  '625a339f-b2ff-4811-9bb5-0fdd32ef2449'::uuid,
  '67da4e11-73ee-4485-96e5-46fa00379d0c'::uuid,
  '6afb5548-465b-42aa-bb86-cc905429b7db'::uuid,
  '717eec70-e8ba-4e2b-aefe-8cdaf6c6f929'::uuid,
  '745af251-795d-4a4e-b08a-51143034ca76'::uuid,
  '7ad59b21-ac57-43b8-ad5a-044239c83456'::uuid,
  '7d3e05ab-5c83-4257-a172-ae2292beedb6'::uuid,
  '7fe0ddbf-9365-4530-8037-5fe1c322c61b'::uuid,
  '815d5cd5-8214-45c6-a9bb-7ebe5b572db6'::uuid,
  '84b0d7e6-e251-4ec6-90d3-a35c8d2fb821'::uuid,
  '85cbee5c-257a-43cd-ad17-86647fdfcbc5'::uuid,
  '8c2c95c3-c43b-4286-a9fc-62cdb4d3aea3'::uuid,
  '90e45d57-5cd4-475e-92ad-ce9cab42d087'::uuid,
  '969d03ce-49c0-402f-b5ea-d59f4d5f3218'::uuid,
  '974d3735-cb70-4f95-bfe9-584596350f31'::uuid,
  '9bb94b1f-d33c-4f0b-aeda-2876bf04f20e'::uuid,
  '9c3b3695-3b43-41a0-9777-f32910cc0d4b'::uuid,
  '9d008525-f684-43df-8d9e-d80d8a1509e6'::uuid,
  '9dd7fe65-3ad3-4ea0-9cd0-9b1dbb827add'::uuid,
  'ada625cb-72ea-4988-bc65-5517afbd2880'::uuid,
  'ada8e4e0-75a4-47fb-9172-2b3ff5c733e7'::uuid,
  'b209ef75-bb21-4f92-b3b3-a8cf1395522c'::uuid,
  'b4a9ce1e-8cee-4ed5-8318-f29f554912d3'::uuid,
  'b73ce368-6425-4691-b642-68da29adebf6'::uuid,
  'b7f07268-c1f7-4f66-be35-6998d3353df9'::uuid,
  'c1371ae6-0870-493f-9dd9-11ab48192939'::uuid,
  'c1a8bf19-5499-40aa-9c34-a581d9289399'::uuid,
  'c361fc7c-55aa-4f2b-9ecf-9ff78ced1f1f'::uuid,
  'cbf26875-3ada-4017-92c3-072ef7f6a2d4'::uuid,
  'd438063f-f920-45fc-9c03-b199ff73d1d0'::uuid,
  'd9b80725-d6ba-4649-b022-5ace49bd869c'::uuid,
  'db3ab20e-2f60-4441-b7e0-4f6d359ce474'::uuid,
  'dda1613d-2766-4366-bcaf-bdea25e7af53'::uuid,
  'e8f488e7-8af7-4551-83b5-48df23242b99'::uuid,
  'e8fa9046-aae0-40dd-938c-754768d89aaf'::uuid,
  'ebf42492-a472-4eb9-850d-43e7566ba799'::uuid,
  'ef76ff31-2bd5-4fc6-ac8c-7c2f5df56ee4'::uuid,
  'f2b22ecf-004a-4b55-9c43-1a175a7b21ea'::uuid,
  'f3a3b312-5159-41cb-a5b2-413d804eb0af'::uuid,
  'fc411aa1-de87-4bfc-9d4b-5fcf8e389f62'::uuid
 ];
 matched_count integer;
begin
 select count(*) into matched_count from public.products p
 where p.store_id=legacy_store and p.id=any(legacy_ids) and p.is_published=false;
 if matched_count<>63 then
  raise exception 'Expected 63 original unpublished Apex products; found %',matched_count;
 end if;
 update public.products p set archived_at=coalesce(archived_at,now())
 where p.store_id=legacy_store and p.id=any(legacy_ids) and p.is_published=false;
end
$legacy$;

-- Nonregulated, fictional examples for supplier-managed retail workflow tests.
-- These are real private DB records, not saleable inventory. No images yet.
insert into public.categories(store_id,slug,name,is_published) values
 ('bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3','sample-apparel','Sample Apparel',false),
 ('bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3','sample-accessories','Sample Accessories',false)
on conflict(store_id,slug) do nothing;

with sample(sku,name,category_name,price_cents,description) as (values
  ('DEMO-TEE-001','Demo Cotton T-Shirt','Sample Apparel',2499,'Fictional cotton T-shirt listing for evaluating product presentation, quantities and shipping. Demo only; no physical sale.'),
  ('DEMO-CAP-001','Demo Baseball Cap','Sample Apparel',1799,'Fictional cap listing for storefront, pricing and stock testing. Demo only; no physical sale.'),
  ('DEMO-TOTE-001','Demo Canvas Tote','Sample Accessories',2199,'Fictional canvas tote listing for cart quantities and supplier fulfillment testing. Demo only; no physical sale.'),
  ('DEMO-BOTTLE-001','Demo Water Bottle','Sample Accessories',1499,'Fictional reusable bottle listing for shipping and stock testing. Demo only; no physical sale.'),
  ('DEMO-STICKERS-001','Demo Sticker Pack','Sample Accessories',699,'Fictional sticker pack listing for discounts and low-value cart testing. Demo only; no physical sale.')
)
insert into public.products(store_id,category_id,sku,name,description,price_cents,currency,is_active,is_published)
select 'bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3'::uuid,c.id,
 sample.sku,sample.name,sample.description,sample.price_cents,'USD',true,false
from sample join public.categories c on c.name=sample.category_name
 and c.store_id='bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3'::uuid
on conflict(store_id,sku) do nothing;

insert into public.inventory_items(store_id,product_id,quantity_on_hand,quantity_reserved)
select p.store_id,p.id,0,0 from public.products p
where p.store_id='bb3a8fe2-48d0-4b0a-938e-e435fe87d7d3'::uuid
 and p.sku=any(array['DEMO-TEE-001','DEMO-CAP-001','DEMO-TOTE-001','DEMO-BOTTLE-001','DEMO-STICKERS-001'])
on conflict(store_id,product_id) do nothing;

commit;
