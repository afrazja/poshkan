create table if not exists public.real_positions (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  shares numeric not null default 0,
  avg_cost numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

alter table public.real_positions enable row level security;

drop policy if exists "Users can read their real positions" on public.real_positions;
drop policy if exists "Users can insert their real positions" on public.real_positions;
drop policy if exists "Users can update their real positions" on public.real_positions;
drop policy if exists "Users can delete their real positions" on public.real_positions;

create policy "Users can read their real positions"
  on public.real_positions
  for select
  using (auth.uid() = user_id);

create table if not exists public.real_watchlist (
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

alter table public.real_watchlist enable row level security;

drop policy if exists "Users can read their real watchlist" on public.real_watchlist;
drop policy if exists "Users can insert their real watchlist" on public.real_watchlist;
drop policy if exists "Users can update their real watchlist" on public.real_watchlist;
drop policy if exists "Users can delete their real watchlist" on public.real_watchlist;

create policy "Users can read their real watchlist"
  on public.real_watchlist
  for select
  using (auth.uid() = user_id);

create policy "Users can insert their real watchlist"
  on public.real_watchlist
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their real watchlist"
  on public.real_watchlist
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their real watchlist"
  on public.real_watchlist
  for delete
  using (auth.uid() = user_id);

create policy "Users can insert their real positions"
  on public.real_positions
  for insert
  with check (auth.uid() = user_id);

create policy "Users can update their real positions"
  on public.real_positions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their real positions"
  on public.real_positions
  for delete
  using (auth.uid() = user_id);
