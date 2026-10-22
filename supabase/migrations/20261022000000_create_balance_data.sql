-- Balance: one private JSONB document per authenticated user.
-- The document preserves the complete balance.v1 shape (transactions,
-- accounts, monthly budgets, category rules, import batches, business trips,
-- personal balance items, settings and every future additive field).

create table if not exists public.balance_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint balance_data_is_object check (jsonb_typeof(data) = 'object')
);

alter table public.balance_data enable row level security;

revoke all on table public.balance_data from anon;
grant select, insert, update, delete on table public.balance_data to authenticated;

drop policy if exists "balance_data_select_own" on public.balance_data;
create policy "balance_data_select_own"
  on public.balance_data
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "balance_data_insert_own" on public.balance_data;
create policy "balance_data_insert_own"
  on public.balance_data
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "balance_data_update_own" on public.balance_data;
create policy "balance_data_update_own"
  on public.balance_data
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "balance_data_delete_own" on public.balance_data;
create policy "balance_data_delete_own"
  on public.balance_data
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.touch_balance_data_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists balance_data_touch_updated_at on public.balance_data;
create trigger balance_data_touch_updated_at
  before update on public.balance_data
  for each row
  execute function public.touch_balance_data_updated_at();
