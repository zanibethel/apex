-- Synthetic disposable PostgreSQL schema for retail-display migration verification.
-- Never execute against a connected/production Supabase project.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create schema apex_internal;
create or replace function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('test.actor',true),'')::uuid
$$;
create or replace function auth.jwt() returns jsonb language sql stable as $$
 select coalesce(nullif(current_setting('test.jwt',true),''),'{}')::jsonb
$$;
grant usage on schema auth to authenticated,anon;
grant execute on function auth.uid() to authenticated,anon;
grant execute on function auth.jwt() to authenticated,anon;

create table public.stores (
 id uuid primary key,supplier_id uuid not null,is_public boolean not null default false,
 display_name text not null
);
create table public.categories (
 id uuid primary key,store_id uuid not null references public.stores(id),
 name text not null,slug text not null
);
create table public.products (
 id uuid primary key,store_id uuid not null references public.stores(id),
 category_id uuid references public.categories(id),
 name text not null,description text not null,sku text not null,
 price_cents bigint not null,currency text not null default 'USD',
 is_active boolean not null default true,is_published boolean not null default false,
 archived_at timestamptz,
 unique(store_id,id),unique(store_id,sku)
);
create table public.supplier_memberships (
 supplier_id uuid not null,user_id uuid not null,role text not null,
 primary key(supplier_id,user_id)
);
create table public.supplier_listing_controls (
 store_id uuid not null,product_id uuid not null,product_name text not null,product_sku text not null,
 supplier_wants_listing boolean not null default false,
 admin_gate text not null default 'clear',
 republish_approval_required boolean not null default false,
 republish_approved boolean not null default true,
 reason text,changed_by uuid,changed_at timestamptz not null default now(),
 primary key(store_id,product_id)
);
create table public.supplier_listing_events (
 id bigint generated always as identity primary key,
 store_id uuid not null,product_id uuid not null,action text not null,
 actor_id uuid,created_at timestamptz not null default now()
);
create table public.inventory_items(
 store_id uuid not null,product_id uuid not null,
 quantity_on_hand integer not null default 0,
 quantity_reserved integer not null default 0,
 primary key(store_id,product_id)
);
create table public.private_product_review_states(
 store_id uuid,product_id uuid,status text
);
create table public.supplier_candidate_drafts(
 store_id uuid,product_id uuid
);
create table apex_internal.retail_showcase_gate(
 singleton boolean primary key,enabled boolean not null
);
insert into apex_internal.retail_showcase_gate(singleton,enabled) values(true,true);
create table apex_internal.listing_identity_holds(
 supplier_id uuid,active boolean,signature text
);
create or replace function apex_internal.listing_signature(p_name text)
 returns text language sql immutable as $$select lower(btrim(p_name))$$;
-- The baseline function deliberately imitates a category-name blacklist.
-- The final migration must replace it.
create or replace function apex_internal.retail_showcase_category_allowed(
 p_store_id uuid,p_category_id uuid
) returns boolean language sql stable as $$
 select exists(select 1 from public.categories c where c.id=p_category_id
  and c.store_id=p_store_id and c.name !~* '(anabolic|steroid)')
$$;
create or replace function apex_internal.private_product_review_snapshot(
 p_store_id uuid,p_product_id uuid
) returns jsonb language sql stable as $$select null::jsonb$$;

insert into public.stores(id,supplier_id,is_public,display_name) values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',false,'Fixture Store A'),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',false,'Fixture Store B');
insert into public.categories(id,store_id,name,slug) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Steroid-Named Category','steroid-named'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Apparel','apparel');
insert into public.supplier_memberships(supplier_id,user_id,role) values
 ('20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','owner'),
 ('20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','owner');
insert into public.products(id,store_id,category_id,name,description,sku,price_cents) values
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','Cotton Workout Shirt','Ordinary comfortable cotton gym t-shirt','SHIRT-001',2499),
 ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',null,'Everyday Cap','Ordinary cotton cap for commuters','CAP-001',1299),
 ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',null,'Anabolic Research Product','Testosterone therapy material','REG-001',999),
 ('50000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','Other Supplier Shirt','Ordinary athletic T-shirt','SHIRT-002',1500),
 ('50000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001',null,'Copper Peptide Hair Serum','Topical copper peptide serum for hair care.','SERUM-001',3999);
-- Simulate protected RLS by not exposing application tables directly to
-- authenticated/anonymous users in the synthetic fixture.
revoke all on all tables in schema public from public,anon,authenticated;
