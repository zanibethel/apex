-- PR #177. Disposable-only positive/negative release tests.
-- Every explicit ON step below happens only in the GitHub Actions database.
\set ON_ERROR_STOP on
do $$
begin
 if (select enabled from apex_internal.private_release_gate where singleton)
 then raise exception 'Release migration silently turned on public gallery';end if;
 if jsonb_array_length(public.get_public_sold_out_catalog(0,24))<>0
 then raise exception 'Disabled catalog leaked product';end if;
 if has_function_privilege('anon',
  'public.get_private_release_readiness(uuid,uuid)','EXECUTE')
 or has_function_privilege('anon',
  'apex_internal.is_soldout_release_eligible(uuid,uuid)','EXECUTE')
 or has_table_privilege('anon',
  'apex_internal.product_release_authorizations','SELECT')
 or has_column_privilege('authenticated','public.products','is_published','UPDATE')
 or has_column_privilege('authenticated','public.stores','is_public','UPDATE')
 then raise exception 'Public or supplier role privilege expanded';end if;
end $$;

-- Release gate may be opened in an isolated test only, with independently
-- populated evidence and private-base product flags unchanged.
update apex_internal.private_release_gate set enabled=true where singleton=true;

begin;
set local role anon;
do $$
declare
 v jsonb; item jsonb;
begin
 v:=public.get_public_sold_out_catalog(0,24);
 if jsonb_array_length(v)<>1 then
  raise exception 'Approved zero-stock product not publicly visible';end if;
 item:=v->0;
 if item->>'name'<>'Synthetic approved sample'
  or item->>'availability'<>'sold_out'
  or item->>'price_cents'<>'5000'
  or item->>'can_checkout'<>'false'
  or (select count(*) from jsonb_object_keys(item))<>7
  or item ? 'image_path' or item ? 'supplier_id'
  or item ? 'quantity_on_hand' or item ? 'internal_source_cost_cents'
  or item ? 'wallet' or item ? 'compare_at_price_cents'
 then raise exception 'Public catalog returned unsafe product fields';end if;
 if jsonb_array_length(public.get_public_sold_out_catalog(1,24))<>0
 then raise exception 'Public gallery pagination duplicated product';end if;
end $$;
rollback;

-- Server-side admin/member decision must match actual public projection.
begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
do $$
declare v jsonb;
begin
 v:=public.get_private_release_readiness(
  '62000000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000001');
 if v->>'status_code'<>'public_visible'
 or v->>'effective_public'<>'true'
 or v#>>'{checks,sold_out_inventory_valid}'<>'true'
 or v#>>'{checks,product_authorized}'<>'true'
 then raise exception 'Supplier verified-public decision disagreed with catalog';end if;
end $$;
rollback;

-- Unauthenticated user cannot read the private authorization verdict.
begin;
set local role anon;
do $$
declare denied boolean:=false;
begin
 begin
 perform public.get_private_release_readiness(
  '62000000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000001');
 exception when insufficient_privilege then denied:=true;end;
 if not denied then raise exception 'Anonymous read private release state';end if;
end $$;
rollback;

-- Strict seller intent: turn off Publish and the product immediately disappears.
update public.supplier_listing_controls set supplier_wants_listing=false;
do $$
begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0 then
  raise exception 'Unpublish did not remove public listing';end if;
end $$;
update public.supplier_listing_controls set supplier_wants_listing=true;

-- Admin hold is strictly stronger than any supplier switch.
update public.supplier_listing_controls set admin_gate='hold';
do $$
begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0 then
  raise exception 'Admin hold did not remove public listing';end if;
end $$;
update public.supplier_listing_controls set admin_gate='clear';

-- Re-review holds and required reapproval are also enforced.
update public.supplier_listing_controls
 set republish_approval_required=true,republish_approved=false;
do $$
begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0 then
  raise exception 'Republish review requirement was bypassed';end if;
end $$;
update public.supplier_listing_controls
 set republish_approval_required=false,republish_approved=false;

-- Category must be published, not merely a valid category ID.
update public.categories set is_published=false;
do $$
begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0
 then raise exception 'Unpublished category leaked product';end if;
end $$;
begin;
set local role authenticated;
set local "request.jwt.claim.sub"='00000000-0000-0000-0000-000000000001';
do $$
declare v jsonb;
begin
 v:=public.get_private_release_readiness(
  '62000000-0000-0000-0000-000000000001',
  '64000000-0000-0000-0000-000000000001');
 if v->>'status_code'<>'category_not_published'
 or v->>'effective_public'<>'false'
 then raise exception 'Supplier category status misreported';end if;
end $$;
rollback;
update public.categories set is_published=true;

-- Zero real stock must remain the only case the public labels Sold Out.
update public.inventory_items set quantity_on_hand=1;
do $$
begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0
 then raise exception 'Positive stock inaccurately displayed as Sold Out';end if;
end $$;
update public.inventory_items set quantity_on_hand=0;

-- Missing signed approval evidence, or expired seller review, hides the item.
update apex_internal.supplier_release_authorizations set evidence_reference=null;
do $$
begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0
 then raise exception 'Seller approval missing evidence';end if;
end $$;
update apex_internal.supplier_release_authorizations
 set evidence_reference='disposable/regtest/seller-evidence',valid_until=current_date-1;
do $$
begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0
 then raise exception 'Expired seller authorization leaked product';end if;
end $$;
update apex_internal.supplier_release_authorizations
 set valid_until=current_date+2;

update apex_internal.product_release_authorizations set reviewed_by=null;
do $$
begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0
 then raise exception 'Product lacked independent reviewer';end if;
end $$;
update apex_internal.product_release_authorizations
 set reviewed_by='00000000-0000-0000-0000-000000000002';

-- Moderation and held identity both prevent public visibility.
insert into public.private_product_review_states(store_id,product_id,status)
values('62000000-0000-0000-0000-000000000001',
 '64000000-0000-0000-0000-000000000001','pending_review');
do $$
begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0
 then raise exception 'Pending content review leaked product';end if;
end $$;
delete from public.private_product_review_states;
insert into apex_internal.listing_identity_holds(supplier_id,signature,active)
values('61000000-0000-0000-0000-000000000001',
 'syntheticapprovedsample',true);
do $$
begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0
 then raise exception 'Active same-supplier identity hold bypassed';end if;
end $$;
delete from apex_internal.listing_identity_holds;

-- Unapproved source mapping must not be a back door to published content.
insert into public.supplier_import_candidates(id,store_id,review_status)
values('65000000-0000-0000-0000-000000000001',
 '62000000-0000-0000-0000-000000000001','pending');
insert into public.supplier_candidate_drafts(store_id,product_id,candidate_id)
values('62000000-0000-0000-0000-000000000001',
 '64000000-0000-0000-0000-000000000001',
 '65000000-0000-0000-0000-000000000001');
do $$
begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0
 then raise exception 'Unreviewed source mapping leaked listing';end if;
end $$;
update public.supplier_import_candidates set review_status='approved_for_draft';
do $$
begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>1
 then raise exception 'Fully approved source was not eligible';end if;
end $$;

-- Any gate shutdown empties the projection without changing private products.
update apex_internal.private_release_gate set enabled=false;
do $$
begin
 if jsonb_array_length(public.get_public_sold_out_catalog())<>0
 then raise exception 'Global release shutdown failed';end if;
 if (select count(*) from public.products where is_published=false)<>1
 or (select count(*) from public.stores where is_public=false)<>1
 then raise exception 'Private supplier editor flags were mutated';end if;
end $$;
select 'PASS: verified Sold Out catalog lifecycle and protected supplier verdict';
