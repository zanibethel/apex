-- Disposable PostgreSQL fixture ONLY for the proposed public sold-out
-- projection. Never run this fixture against a hosted Supabase project.
create schema if not exists apex_internal;

create table apex_internal.private_release_gate(
 singleton boolean primary key default true check(singleton),
 enabled boolean not null default false check(enabled=false)
);
insert into apex_internal.private_release_gate(singleton,enabled) values(true,false);

create table apex_internal.supplier_release_authorizations(
 supplier_id uuid primary key references public.suppliers(id),
 status text not null,valid_until date
);
create table apex_internal.product_release_authorizations(
 store_id uuid not null,product_id uuid not null,
 status text not null,valid_until date,
 primary key(store_id,product_id)
);
create table apex_internal.listing_identity_holds(
 supplier_id uuid not null,signature text not null,active boolean not null
);
create function apex_internal.listing_signature(name text)
returns text language sql immutable set search_path=pg_catalog as $fn$
 select regexp_replace(lower(btrim(coalesce(name,''))),'[^a-z0-9]+','','g')
$fn$;
create table public.supplier_listing_controls(
 store_id uuid not null,product_id uuid not null,
 supplier_wants_listing boolean not null default false,
 admin_gate text not null default 'clear',
 republish_approval_required boolean not null default false,
 republish_approved boolean not null default false,
 primary key(store_id,product_id)
);
create table public.private_product_review_states(
 store_id uuid not null,product_id uuid not null,status text not null,
 primary key(store_id,product_id)
);
alter table public.products
 add column is_active boolean not null default false,
 add column image_path text;

insert into public.suppliers(id,slug,display_name)
values('61000000-0000-0000-0000-000000000001','approved-soldout-test','Sold-out fixture');
insert into public.stores(id,supplier_id,slug,display_name,is_public)
values('62000000-0000-0000-0000-000000000001',
 '61000000-0000-0000-0000-000000000001','approved-soldout','Sold-out store',true);
insert into public.categories(id,store_id,slug,name,is_published)
values('63000000-0000-0000-0000-000000000001',
 '62000000-0000-0000-0000-000000000001','test','Synthetic category',true);
insert into public.products(id,store_id,category_id,sku,name,description,
 price_cents,currency,is_published,is_active,image_path)
values('64000000-0000-0000-0000-000000000001',
 '62000000-0000-0000-0000-000000000001',
 '63000000-0000-0000-0000-000000000001',
 'SYNTH-RELEASE-1','Synthetic approved sample','A fictional nonmedical example.',
 5000,'USD',true,true,'private/object/not-exposed.png');
insert into public.inventory_items(store_id,product_id,quantity_on_hand,quantity_reserved)
values('62000000-0000-0000-0000-000000000001',
 '64000000-0000-0000-0000-000000000001',0,0);
insert into public.supplier_listing_controls
(store_id,product_id,supplier_wants_listing,admin_gate)
values('62000000-0000-0000-0000-000000000001',
 '64000000-0000-0000-0000-000000000001',true,'clear');
insert into apex_internal.supplier_release_authorizations(supplier_id,status,valid_until)
values('61000000-0000-0000-0000-000000000001','verified',current_date+1);
insert into apex_internal.product_release_authorizations(store_id,product_id,status,valid_until)
values('62000000-0000-0000-0000-000000000001',
 '64000000-0000-0000-0000-000000000001','verified',current_date+1);
