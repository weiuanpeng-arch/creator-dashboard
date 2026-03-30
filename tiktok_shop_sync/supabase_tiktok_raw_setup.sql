create table if not exists public.tiktok_creator_performance_raw (
  id bigserial primary key,
  crawl_date text,
  stat_date text,
  store_tag text,
  platform text,
  source_view text,
  range_label text,
  creator_name text,
  creator_handle text,
  creator_key text,
  affiliate_gmv text,
  attributed_orders text,
  items_sold text,
  refunds text,
  items_refunded text,
  aov text,
  est_commission text,
  videos text,
  live_streams text,
  avg_daily_products_sold text,
  affiliate_followers text,
  samples_shipped text,
  batch_id text,
  source_file text,
  note text,
  unique (store_tag, stat_date, creator_key, batch_id, source_file)
);

alter table public.tiktok_creator_performance_raw
  add column if not exists affiliate_followers text;

create table if not exists public.tiktok_video_performance_raw (
  id bigserial primary key,
  crawl_date text,
  stat_date text,
  store_tag text,
  platform text,
  source_view text,
  range_label text,
  creator_name text,
  creator_handle text,
  creator_key text,
  video_title text,
  video_id text,
  post_date text,
  video_link text,
  product_name text,
  product_id text,
  affiliate_video_gmv text,
  video_orders text,
  aov text,
  avg_gmv_per_customer text,
  items_sold text,
  refunds text,
  items_refunded text,
  est_commission text,
  batch_id text,
  source_file text,
  note text,
  unique (store_tag, stat_date, creator_key, video_id, product_id, source_file)
);

create table if not exists public.tiktok_creator_db_backfill_staging (
  id bigserial primary key,
  imported_at timestamptz default now(),
  source_system text,
  store_tag text,
  creator_key text,
  creator_id text,
  object_id text,
  object_type text,
  cooperation_start_at text,
  latest_cooperation_at text,
  cooperation_status text,
  cooperation_type text,
  service_fee text,
  slotting_fee text,
  sample_cost text,
  commission_rate text,
  cooperation_count text,
  latest_record_id text,
  source_table text,
  source_pk text,
  raw_payload jsonb,
  note text
);

alter table public.tiktok_creator_performance_raw enable row level security;
alter table public.tiktok_video_performance_raw enable row level security;
alter table public.tiktok_creator_db_backfill_staging enable row level security;

drop policy if exists tiktok_creator_performance_raw_read_all on public.tiktok_creator_performance_raw;
create policy tiktok_creator_performance_raw_read_all
on public.tiktok_creator_performance_raw
for select
to anon, authenticated
using (true);

drop policy if exists tiktok_creator_performance_raw_insert_all on public.tiktok_creator_performance_raw;
create policy tiktok_creator_performance_raw_insert_all
on public.tiktok_creator_performance_raw
for insert
to anon, authenticated
with check (true);

drop policy if exists tiktok_video_performance_raw_read_all on public.tiktok_video_performance_raw;
create policy tiktok_video_performance_raw_read_all
on public.tiktok_video_performance_raw
for select
to anon, authenticated
using (true);

drop policy if exists tiktok_video_performance_raw_insert_all on public.tiktok_video_performance_raw;
create policy tiktok_video_performance_raw_insert_all
on public.tiktok_video_performance_raw
for insert
to anon, authenticated
with check (true);

drop policy if exists tiktok_creator_db_backfill_staging_read_all on public.tiktok_creator_db_backfill_staging;
create policy tiktok_creator_db_backfill_staging_read_all
on public.tiktok_creator_db_backfill_staging
for select
to anon, authenticated
using (true);

drop policy if exists tiktok_creator_db_backfill_staging_insert_all on public.tiktok_creator_db_backfill_staging;
create policy tiktok_creator_db_backfill_staging_insert_all
on public.tiktok_creator_db_backfill_staging
for insert
to anon, authenticated
with check (true);

grant select, insert on public.tiktok_creator_performance_raw to anon, authenticated;
grant select, insert on public.tiktok_video_performance_raw to anon, authenticated;
grant select, insert on public.tiktok_creator_db_backfill_staging to anon, authenticated;
grant usage, select on sequence public.tiktok_creator_performance_raw_id_seq to anon, authenticated;
grant usage, select on sequence public.tiktok_video_performance_raw_id_seq to anon, authenticated;
grant usage, select on sequence public.tiktok_creator_db_backfill_staging_id_seq to anon, authenticated;

comment on table public.tiktok_creator_performance_raw is 'TikTok creator analytics raw exports';
comment on table public.tiktok_video_performance_raw is 'TikTok video analytics raw exports';
comment on table public.tiktok_creator_db_backfill_staging is 'Staging table for DB-only cooperation backfill fields';
