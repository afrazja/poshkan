create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  last_active_portfolio_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  account_type text not null default 'us_stock' check (account_type in ('us_stock', 'crypto')),
  starting_cash numeric not null default 100000,
  cash numeric not null default 100000,
  base_currency text not null default 'USD',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_holdings (
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  asset_type text not null default 'us_stock' check (asset_type in ('us_stock', 'crypto')),
  name text,
  quantity numeric not null default 0,
  avg_cost numeric not null default 0,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (portfolio_id, symbol)
);

create table if not exists public.portfolio_watchlist (
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  asset_type text not null default 'us_stock' check (asset_type in ('us_stock', 'crypto')),
  name text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (portfolio_id, symbol)
);

create table if not exists public.portfolio_trades (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  asset_type text not null default 'us_stock' check (asset_type in ('us_stock', 'crypto')),
  trade_type text not null check (trade_type in ('buy', 'sell', 'starting_position', 'adjustment')),
  quantity numeric not null default 0,
  price numeric not null default 0,
  total numeric not null default 0,
  realized_pnl numeric not null default 0,
  source text not null default 'manual' check (source in ('manual', 'ai', 'import')),
  created_at timestamptz not null default now()
);

create table if not exists public.portfolio_ai_settings (
  portfolio_id uuid primary key references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  allow_buy boolean not null default true,
  allow_sell boolean not null default true,
  max_trade_percent numeric not null default 10,
  max_daily_trades integer not null default 5,
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  portfolio_id uuid not null references public.portfolios(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null default current_date,
  cash numeric not null default 0,
  holdings_value numeric not null default 0,
  total_value numeric not null default 0,
  daily_pnl numeric not null default 0,
  created_at timestamptz not null default now(),
  unique (portfolio_id, snapshot_date)
);

alter table public.profiles enable row level security;
alter table public.portfolios enable row level security;
alter table public.portfolio_holdings enable row level security;
alter table public.portfolio_watchlist enable row level security;
alter table public.portfolio_trades enable row level security;
alter table public.portfolio_ai_settings enable row level security;
alter table public.portfolio_snapshots enable row level security;

drop policy if exists "Users can manage their profile" on public.profiles;
drop policy if exists "Users can manage their portfolios" on public.portfolios;
drop policy if exists "Users can manage their portfolio holdings" on public.portfolio_holdings;
drop policy if exists "Users can manage their portfolio watchlist" on public.portfolio_watchlist;
drop policy if exists "Users can manage their portfolio trades" on public.portfolio_trades;
drop policy if exists "Users can manage their portfolio AI settings" on public.portfolio_ai_settings;
drop policy if exists "Users can manage their portfolio snapshots" on public.portfolio_snapshots;
drop policy if exists "Users can read their profile" on public.profiles;
drop policy if exists "Users can insert their profile" on public.profiles;
drop policy if exists "Users can update their profile" on public.profiles;
drop policy if exists "Users can delete their profile" on public.profiles;
drop policy if exists "Users can read their portfolios" on public.portfolios;
drop policy if exists "Users can insert their portfolios" on public.portfolios;
drop policy if exists "Users can update their portfolios" on public.portfolios;
drop policy if exists "Users can delete their portfolios" on public.portfolios;
drop policy if exists "Users can read their portfolio holdings" on public.portfolio_holdings;
drop policy if exists "Users can insert their portfolio holdings" on public.portfolio_holdings;
drop policy if exists "Users can update their portfolio holdings" on public.portfolio_holdings;
drop policy if exists "Users can delete their portfolio holdings" on public.portfolio_holdings;
drop policy if exists "Users can read their portfolio watchlist" on public.portfolio_watchlist;
drop policy if exists "Users can insert their portfolio watchlist" on public.portfolio_watchlist;
drop policy if exists "Users can update their portfolio watchlist" on public.portfolio_watchlist;
drop policy if exists "Users can delete their portfolio watchlist" on public.portfolio_watchlist;
drop policy if exists "Users can read their portfolio trades" on public.portfolio_trades;
drop policy if exists "Users can insert their portfolio trades" on public.portfolio_trades;
drop policy if exists "Users can update their portfolio trades" on public.portfolio_trades;
drop policy if exists "Users can delete their portfolio trades" on public.portfolio_trades;
drop policy if exists "Users can read their portfolio AI settings" on public.portfolio_ai_settings;
drop policy if exists "Users can insert their portfolio AI settings" on public.portfolio_ai_settings;
drop policy if exists "Users can update their portfolio AI settings" on public.portfolio_ai_settings;
drop policy if exists "Users can delete their portfolio AI settings" on public.portfolio_ai_settings;
drop policy if exists "Users can read their portfolio snapshots" on public.portfolio_snapshots;
drop policy if exists "Users can insert their portfolio snapshots" on public.portfolio_snapshots;
drop policy if exists "Users can update their portfolio snapshots" on public.portfolio_snapshots;
drop policy if exists "Users can delete their portfolio snapshots" on public.portfolio_snapshots;

create policy "Users can read their profile" on public.profiles for select using (auth.uid() = id);
create policy "Users can insert their profile" on public.profiles for insert with check (auth.uid() = id);
create policy "Users can update their profile" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "Users can delete their profile" on public.profiles for delete using (auth.uid() = id);

create policy "Users can read their portfolios" on public.portfolios for select using (auth.uid() = user_id);
create policy "Users can insert their portfolios" on public.portfolios for insert with check (auth.uid() = user_id);
create policy "Users can update their portfolios" on public.portfolios for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their portfolios" on public.portfolios for delete using (auth.uid() = user_id);

create policy "Users can read their portfolio holdings" on public.portfolio_holdings for select using (auth.uid() = user_id);
create policy "Users can insert their portfolio holdings" on public.portfolio_holdings for insert with check (auth.uid() = user_id);
create policy "Users can update their portfolio holdings" on public.portfolio_holdings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their portfolio holdings" on public.portfolio_holdings for delete using (auth.uid() = user_id);

create policy "Users can read their portfolio watchlist" on public.portfolio_watchlist for select using (auth.uid() = user_id);
create policy "Users can insert their portfolio watchlist" on public.portfolio_watchlist for insert with check (auth.uid() = user_id);
create policy "Users can update their portfolio watchlist" on public.portfolio_watchlist for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their portfolio watchlist" on public.portfolio_watchlist for delete using (auth.uid() = user_id);

create policy "Users can read their portfolio trades" on public.portfolio_trades for select using (auth.uid() = user_id);
create policy "Users can insert their portfolio trades" on public.portfolio_trades for insert with check (auth.uid() = user_id);
create policy "Users can update their portfolio trades" on public.portfolio_trades for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their portfolio trades" on public.portfolio_trades for delete using (auth.uid() = user_id);

create policy "Users can read their portfolio AI settings" on public.portfolio_ai_settings for select using (auth.uid() = user_id);
create policy "Users can insert their portfolio AI settings" on public.portfolio_ai_settings for insert with check (auth.uid() = user_id);
create policy "Users can update their portfolio AI settings" on public.portfolio_ai_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their portfolio AI settings" on public.portfolio_ai_settings for delete using (auth.uid() = user_id);

create policy "Users can read their portfolio snapshots" on public.portfolio_snapshots for select using (auth.uid() = user_id);
create policy "Users can insert their portfolio snapshots" on public.portfolio_snapshots for insert with check (auth.uid() = user_id);
create policy "Users can update their portfolio snapshots" on public.portfolio_snapshots for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete their portfolio snapshots" on public.portfolio_snapshots for delete using (auth.uid() = user_id);

create index if not exists portfolios_user_id_idx on public.portfolios (user_id, archived, created_at desc);
create index if not exists portfolio_holdings_user_id_idx on public.portfolio_holdings (user_id, portfolio_id);
create index if not exists portfolio_watchlist_user_id_idx on public.portfolio_watchlist (user_id, portfolio_id, sort_order);
create index if not exists portfolio_trades_user_id_idx on public.portfolio_trades (user_id, portfolio_id, created_at desc);
