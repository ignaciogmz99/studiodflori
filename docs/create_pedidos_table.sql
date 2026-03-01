create extension if not exists "pgcrypto";

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  payment_provider text not null check (payment_provider in ('mercadopago', 'stripe')),
  payment_id text not null unique,
  payment_status text not null,
  amount_mxn numeric(12, 2) not null,
  currency text not null default 'mxn',
  customer_email text,
  customer_name text,
  customer_phone text,
  delivery jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  payment_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists pedidos_created_at_idx on public.pedidos (created_at desc);
create index if not exists pedidos_payment_provider_idx on public.pedidos (payment_provider);
