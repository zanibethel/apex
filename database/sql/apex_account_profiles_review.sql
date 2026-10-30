-- Review-only migration. Apply to the dedicated Apex development project after tests and approval.
-- Private contact details. No email duplication, wallet secrets, or role columns.
begin;
create table public.account_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  first_name text check (length(first_name) <= 80),
  last_name text check (length(last_name) <= 80),
  phone text check (length(phone) <= 30),
  address_line1 text check (length(address_line1) <= 180),
  address_line2 text check (length(address_line2) <= 180),
  city text check (length(city) <= 100),
  region text check (length(region) <= 100),
  postal_code text check (length(postal_code) <= 24),
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  created_at timestamptz not null default now()
);
alter table public.account_profiles enable row level security;
revoke all on public.account_profiles from public, anon, authenticated;
grant select, insert, update on public.account_profiles to authenticated;
create policy "read_own_account_profile" on public.account_profiles
  for select to authenticated using (user_id = (select auth.uid()));
create policy "insert_own_account_profile" on public.account_profiles
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "update_own_account_profile" on public.account_profiles
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
-- No DELETE grant and no policy for other users or anonymous sessions.
commit;
