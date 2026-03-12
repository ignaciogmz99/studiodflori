alter table if exists public.comprobantes
  add column if not exists payment_id text,
  add column if not exists order_id text,
  add column if not exists source text,
  add column if not exists pdf_path text,
  add column if not exists pdf_generated_at timestamptz,
  add column if not exists whatsapp_sent_at timestamptz;

create unique index if not exists comprobantes_payment_id_uidx
  on public.comprobantes (payment_id)
  where payment_id is not null;

create index if not exists comprobantes_order_id_idx
  on public.comprobantes (order_id)
  where order_id is not null;
