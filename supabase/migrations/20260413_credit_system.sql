create table if not exists public.credit_wallets (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance integer not null default 0,
  total_purchased_credits integer not null default 0,
  total_consumed_credits integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  amount integer not null,
  direction text not null check (direction in ('debit', 'credit')),
  feature text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.credit_orders (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  plan_id text not null,
  provider text not null,
  provider_order_id text not null unique,
  provider_payment_id text,
  amount_inr integer not null,
  credits integer not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_credit_transactions_user_created_at
  on public.credit_transactions (user_id, created_at desc);

create index if not exists idx_credit_orders_user_created_at
  on public.credit_orders (user_id, created_at desc);

alter table public.credit_wallets enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.credit_orders enable row level security;

-- Wallet owner can read their own data. Writes are service-role/rpc controlled.
drop policy if exists "wallet_select_own" on public.credit_wallets;
create policy "wallet_select_own"
  on public.credit_wallets
  for select
  using (auth.uid() = user_id);

-- Transactions and orders are visible to owner for dashboard transparency.
drop policy if exists "transactions_select_own" on public.credit_transactions;
create policy "transactions_select_own"
  on public.credit_transactions
  for select
  using (auth.uid() = user_id);

drop policy if exists "orders_select_own" on public.credit_orders;
create policy "orders_select_own"
  on public.credit_orders
  for select
  using (auth.uid() = user_id);

create or replace function public.ensure_credit_wallet(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.credit_wallets (user_id, balance, total_purchased_credits, total_consumed_credits)
  values (p_user_id, 5, 5, 0)
  on conflict (user_id) do nothing;
end;
$$;

create or replace function public.consume_credits(
  p_user_id uuid,
  p_amount integer,
  p_feature text,
  p_metadata jsonb default '{}'::jsonb
)
returns table(success boolean, balance integer, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  perform public.ensure_credit_wallet(p_user_id);

  if p_amount <= 0 then
    select cw.balance into v_balance from public.credit_wallets cw where cw.user_id = p_user_id;
    return query select true, coalesce(v_balance, 0), 'No credits consumed';
    return;
  end if;

  update public.credit_wallets cw
  set
    balance = cw.balance - p_amount,
    total_consumed_credits = cw.total_consumed_credits + p_amount,
    updated_at = now()
  where cw.user_id = p_user_id
    and cw.balance >= p_amount
  returning cw.balance into v_balance;

  if v_balance is null then
    select cw.balance into v_balance from public.credit_wallets cw where cw.user_id = p_user_id;
    return query select false, coalesce(v_balance, 0), 'Insufficient credits';
    return;
  end if;

  insert into public.credit_transactions (user_id, amount, direction, feature, metadata)
  values (p_user_id, p_amount, 'debit', p_feature, coalesce(p_metadata, '{}'::jsonb));

  return query select true, v_balance, 'Credits consumed successfully';
end;
$$;

create or replace function public.add_credits(
  p_user_id uuid,
  p_amount integer,
  p_reason text,
  p_metadata jsonb default '{}'::jsonb
)
returns table(success boolean, balance integer, message text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance integer;
begin
  perform public.ensure_credit_wallet(p_user_id);

  if p_amount <= 0 then
    select cw.balance into v_balance from public.credit_wallets cw where cw.user_id = p_user_id;
    return query select true, coalesce(v_balance, 0), 'No credits added';
    return;
  end if;

  update public.credit_wallets cw
  set
    balance = cw.balance + p_amount,
    total_purchased_credits = cw.total_purchased_credits + p_amount,
    updated_at = now()
  where cw.user_id = p_user_id
  returning cw.balance into v_balance;

  insert into public.credit_transactions (user_id, amount, direction, feature, metadata)
  values (p_user_id, p_amount, 'credit', p_reason, coalesce(p_metadata, '{}'::jsonb));

  return query select true, coalesce(v_balance, 0), 'Credits added successfully';
end;
$$;
