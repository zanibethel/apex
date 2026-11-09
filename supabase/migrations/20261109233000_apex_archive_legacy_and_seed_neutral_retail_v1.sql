-- Apex neutral-retail transition, v1. Product data is preserved, not deleted.
-- Archive only unpublished products in the named draft store created before
-- November 3, 2026. A count-of-63 precondition fails closed if the historical
-- product set has changed. No generated primary keys are hardcoded.
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

-- The same tenant/owner-manager checks remain authoritative. Archived rows
-- cannot be edited or restored through supplier Data API grants.
alter policy supplier_draft_products_insert on public.products
 with check (archived_at is null and is_published=false and
  exists (
   select 1 from public.stores s
   join public.supplier_memberships sm on sm.supplier_id=s.supplier_id
   where s.id=products.store_id and s.is_public=false
    and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')
  ));

alter policy supplier_draft_products_update on public.products
 using (archived_at is null and is_published=false and
  exists (
   select 1 from public.stores s
   join public.supplier_memberships sm on sm.supplier_id=s.supplier_id
   where s.id=products.store_id and s.is_public=false
    and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')
  ))
 with check (archived_at is null and is_published=false and
  exists (
   select 1 from public.stores s
   join public.supplier_memberships sm on sm.supplier_id=s.supplier_id
   where s.id=products.store_id and s.is_public=false
    and sm.user_id=(select auth.uid()) and sm.role in ('owner','manager')
  ));

do $legacy$
declare
 legacy_store uuid;
 matched_count integer;
begin
 select id into strict legacy_store from public.stores
 where slug='apex-shared-store-draft' and is_public=false;
 select count(*) into matched_count from public.products p
 where p.store_id=legacy_store and p.is_published=false
  and p.archived_at is null and p.created_at<'2026-11-03T00:00:00Z'::timestamptz;
 if matched_count<>63 then
  raise exception 'Expected 63 original unpublished Apex products from before Nov 3; found %',matched_count;
 end if;
 update public.products p set archived_at=now()
 where p.store_id=legacy_store and p.is_published=false and p.archived_at is null
  and p.created_at<'2026-11-03T00:00:00Z'::timestamptz;
end
$legacy$;

-- Nonregulated, fictional examples for supplier-managed retail workflow tests.
-- These are real private DB records, not saleable inventory. No images yet.
insert into public.categories(store_id,slug,name,is_published) values
 ((select id from public.stores where slug='apex-shared-store-draft' and is_public=false),'sample-apparel','Sample Apparel',false),
 ((select id from public.stores where slug='apex-shared-store-draft' and is_public=false),'sample-accessories','Sample Accessories',false)
on conflict(store_id,slug) do nothing;

with sample(sku,name,category_name,price_cents,description) as (values
  ('DEMO-TEE-001','Demo Cotton T-Shirt','Sample Apparel',2499,'Fictional cotton T-shirt listing for evaluating product presentation, quantities and shipping. Demo only; no physical sale.'),
  ('DEMO-CAP-001','Demo Baseball Cap','Sample Apparel',1799,'Fictional cap listing for storefront, pricing and stock testing. Demo only; no physical sale.'),
  ('DEMO-TOTE-001','Demo Canvas Tote','Sample Accessories',2199,'Fictional canvas tote listing for cart quantities and supplier fulfillment testing. Demo only; no physical sale.'),
  ('DEMO-BOTTLE-001','Demo Water Bottle','Sample Accessories',1499,'Fictional reusable bottle listing for shipping and stock testing. Demo only; no physical sale.'),
  ('DEMO-STICKERS-001','Demo Sticker Pack','Sample Accessories',699,'Fictional sticker pack listing for discounts and low-value cart testing. Demo only; no physical sale.')
)
insert into public.products(store_id,category_id,sku,name,description,price_cents,currency,is_active,is_published)
select (select id from public.stores where slug='apex-shared-store-draft' and is_public=false),c.id,
 sample.sku,sample.name,sample.description,sample.price_cents,'USD',true,false
from sample join public.categories c on c.slug=case sample.category_name
  when 'Sample Apparel' then 'sample-apparel'
  when 'Sample Accessories' then 'sample-accessories'
  else '__not_found__' end
 and c.store_id=(select id from public.stores where slug='apex-shared-store-draft' and is_public=false)
on conflict(store_id,sku) do nothing;

insert into public.inventory_items(store_id,product_id,quantity_on_hand,quantity_reserved)
select p.store_id,p.id,0,0 from public.products p
where p.store_id=(select id from public.stores where slug='apex-shared-store-draft' and is_public=false)
 and p.sku=any(array['DEMO-TEE-001','DEMO-CAP-001','DEMO-TOTE-001','DEMO-BOTTLE-001','DEMO-STICKERS-001'])
on conflict(store_id,product_id) do nothing;

commit;
