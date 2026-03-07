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
  nombre text,
  numero text,
  flores_pidio text,
  precio_pago numeric(12, 2),
  ubicacion text,
  fecha text,
  hora text,
  fecha_hora_pago timestamptz,
  delivery jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  payment_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table if exists public.pedidos add column if not exists nombre text;
alter table if exists public.pedidos add column if not exists numero text;
alter table if exists public.pedidos add column if not exists flores_pidio text;
alter table if exists public.pedidos add column if not exists precio_pago numeric(12, 2);
alter table if exists public.pedidos add column if not exists ubicacion text;
alter table if exists public.pedidos add column if not exists fecha text;
alter table if exists public.pedidos add column if not exists hora text;
alter table if exists public.pedidos add column if not exists fecha_hora_pago timestamptz;

create index if not exists pedidos_created_at_idx on public.pedidos (created_at desc);
create index if not exists pedidos_payment_provider_idx on public.pedidos (payment_provider);
create index if not exists pedidos_fecha_hora_pago_idx on public.pedidos (fecha_hora_pago desc);
