create table if not exists public.subscription_orders (
  id bigserial primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  tier text not null check (tier in ('pro', 'premium')),
  provider text not null,
  provider_order_id text not null unique,
  provider_payment_id text,
  amount_inr integer not null,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);

create index if not exists idx_subscription_orders_user_created_at
  on public.subscription_orders (user_id, created_at desc);

alter table public.subscription_orders enable row level security;

drop policy if exists "subscription_orders_select_own" on public.subscription_orders;
create policy "subscription_orders_select_own"
  on public.subscription_orders
  for select
  using (auth.uid() = user_id);
