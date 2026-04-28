alter table if exists public.comprobantes
  add column if not exists payment_id text,
  add column if not exists order_id text,
  add column if not exists source text,
  add column if not exists pdf_path text,
  add column if not exists pdf_generated_at timestamptz,
  add column if not exists whatsapp_sent_at timestamptz,
  add column if not exists pdf_processing_started_at timestamptz,
  add column if not exists whatsapp_processing_started_at timestamptz,
  add column if not exists pdf_processing_owner text,
  add column if not exists whatsapp_processing_owner text,
  add column if not exists processing_last_event text,
  add column if not exists processing_last_error text,
  add column if not exists processing_last_actor text,
  add column if not exists processing_updated_at timestamptz;

create unique index if not exists comprobantes_payment_id_uidx
  on public.comprobantes (payment_id)
  where payment_id is not null;

create index if not exists comprobantes_order_id_idx
  on public.comprobantes (order_id)
  where order_id is not null;
