create table if not exists public.real_transactions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  type text not null check (type in ('set', 'buy', 'sell')),
  shares numeric not null default 0,
  price numeric not null default 0,
  avg_cost numeric not null default 0,
  total numeric not null default 0,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists real_transactions_user_created_idx
  on public.real_transactions (user_id, created_at desc);

alter table public.real_transactions enable row level security;

drop policy if exists "Users can read their real transactions" on public.real_transactions;
create policy "Users can read their real transactions"
  on public.real_transactions
  for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert their real transactions" on public.real_transactions;
create policy "Users can insert their real transactions"
  on public.real_transactions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update their real transactions" on public.real_transactions;
create policy "Users can update their real transactions"
  on public.real_transactions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their real transactions" on public.real_transactions;
create policy "Users can delete their real transactions"
  on public.real_transactions
  for delete
  using (auth.uid() = user_id);
