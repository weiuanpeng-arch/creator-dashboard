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

create table if not exists public.tiktok_cooperation_raw (
  id bigserial primary key,
  workspace_id text not null,
  cooperation_id text not null,
  kol_id text,
  platform text,
  cooperation_type text,
  start_at text,
  end_at text,
  is_joint_post text,
  sample_type text,
  shipping_channel text,
  cooperation_attribute text,
  cooperation_fee text,
  prepaid_fee text,
  commission_rate text,
  shipping_address text,
  live_minutes text,
  product_spu_list text,
  created_at_source text,
  updated_at_source text,
  created_by_source text,
  status text,
  source_file text,
  uploaded_by text,
  uploaded_at timestamptz default now(),
  unique (workspace_id, cooperation_id)
);

create table if not exists public.tiktok_product_sku_cost_raw (
  id bigserial primary key,
  workspace_id text not null,
  spu text not null,
  sku text not null,
  cost text,
  country_code text,
  source_file text,
  uploaded_by text,
  uploaded_at timestamptz default now(),
  unique (workspace_id, spu, sku, country_code)
);

alter table public.tiktok_creator_performance_raw enable row level security;
alter table public.tiktok_video_performance_raw enable row level security;
alter table public.tiktok_creator_db_backfill_staging enable row level security;
alter table public.tiktok_cooperation_raw enable row level security;
alter table public.tiktok_product_sku_cost_raw enable row level security;

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

drop policy if exists tiktok_cooperation_raw_read_all on public.tiktok_cooperation_raw;
create policy tiktok_cooperation_raw_read_all
on public.tiktok_cooperation_raw
for select
to anon, authenticated
using (true);

drop policy if exists tiktok_product_sku_cost_raw_read_all on public.tiktok_product_sku_cost_raw;
create policy tiktok_product_sku_cost_raw_read_all
on public.tiktok_product_sku_cost_raw
for select
to anon, authenticated
using (true);

grant select, insert on public.tiktok_creator_performance_raw to anon, authenticated;
grant select, insert on public.tiktok_video_performance_raw to anon, authenticated;
grant select, insert on public.tiktok_creator_db_backfill_staging to anon, authenticated;
grant select on public.tiktok_cooperation_raw to anon, authenticated;
grant select on public.tiktok_product_sku_cost_raw to anon, authenticated;
grant usage, select on sequence public.tiktok_creator_performance_raw_id_seq to anon, authenticated;
grant usage, select on sequence public.tiktok_video_performance_raw_id_seq to anon, authenticated;
grant usage, select on sequence public.tiktok_creator_db_backfill_staging_id_seq to anon, authenticated;
grant usage, select on sequence public.tiktok_cooperation_raw_id_seq to anon, authenticated;
grant usage, select on sequence public.tiktok_product_sku_cost_raw_id_seq to anon, authenticated;

create or replace function public.replace_tiktok_cooperation_upload(
  p_workspace_id text,
  p_passcode text,
  p_editor_name text,
  p_source_file text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  inserted_count integer := 0;
begin
  perform public.verify_creator_workspace_passcode(p_workspace_id, p_passcode);

  delete from public.tiktok_cooperation_raw
  where workspace_id = p_workspace_id;

  if coalesce(jsonb_typeof(p_rows), '') = 'array' and jsonb_array_length(p_rows) > 0 then
    insert into public.tiktok_cooperation_raw (
      workspace_id,
      cooperation_id,
      kol_id,
      platform,
      cooperation_type,
      start_at,
      end_at,
      is_joint_post,
      sample_type,
      shipping_channel,
      cooperation_attribute,
      cooperation_fee,
      prepaid_fee,
      commission_rate,
      shipping_address,
      live_minutes,
      product_spu_list,
      created_at_source,
      updated_at_source,
      created_by_source,
      status,
      source_file,
      uploaded_by
    )
    select
      p_workspace_id,
      coalesce(nullif(row_item.cooperation_id, ''), md5(random()::text || clock_timestamp()::text)),
      row_item.kol_id,
      row_item.platform,
      row_item.cooperation_type,
      row_item.start_at,
      row_item.end_at,
      row_item.is_joint_post,
      row_item.sample_type,
      row_item.shipping_channel,
      row_item.cooperation_attribute,
      row_item.cooperation_fee,
      row_item.prepaid_fee,
      row_item.commission_rate,
      row_item.shipping_address,
      row_item.live_minutes,
      row_item.product_spu_list,
      row_item.created_at_source,
      row_item.updated_at_source,
      row_item.created_by_source,
      row_item.status,
      p_source_file,
      p_editor_name
    from jsonb_to_recordset(p_rows) as row_item(
      cooperation_id text,
      kol_id text,
      platform text,
      cooperation_type text,
      start_at text,
      end_at text,
      is_joint_post text,
      sample_type text,
      shipping_channel text,
      cooperation_attribute text,
      cooperation_fee text,
      prepaid_fee text,
      commission_rate text,
      shipping_address text,
      live_minutes text,
      product_spu_list text,
      created_at_source text,
      updated_at_source text,
      created_by_source text,
      status text
    );
    get diagnostics inserted_count = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'table', 'tiktok_cooperation_raw',
    'workspace_id', p_workspace_id,
    'inserted', inserted_count
  );
end;
$$;

create or replace function public.replace_tiktok_product_sku_cost_upload(
  p_workspace_id text,
  p_passcode text,
  p_editor_name text,
  p_source_file text,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  inserted_count integer := 0;
begin
  perform public.verify_creator_workspace_passcode(p_workspace_id, p_passcode);

  delete from public.tiktok_product_sku_cost_raw
  where workspace_id = p_workspace_id;

  if coalesce(jsonb_typeof(p_rows), '') = 'array' and jsonb_array_length(p_rows) > 0 then
    insert into public.tiktok_product_sku_cost_raw (
      workspace_id,
      spu,
      sku,
      cost,
      country_code,
      source_file,
      uploaded_by
    )
    select
      p_workspace_id,
      row_item.spu,
      row_item.sku,
      row_item.cost,
      row_item.country_code,
      p_source_file,
      p_editor_name
    from jsonb_to_recordset(p_rows) as row_item(
      spu text,
      sku text,
      cost text,
      country_code text
    );
    get diagnostics inserted_count = row_count;
  end if;

  return jsonb_build_object(
    'ok', true,
    'table', 'tiktok_product_sku_cost_raw',
    'workspace_id', p_workspace_id,
    'inserted', inserted_count
  );
end;
$$;

grant execute on function public.replace_tiktok_cooperation_upload(text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.replace_tiktok_product_sku_cost_upload(text, text, text, text, jsonb) to anon, authenticated;

comment on table public.tiktok_creator_performance_raw is 'TikTok creator analytics raw exports';
comment on table public.tiktok_video_performance_raw is 'TikTok video analytics raw exports';
comment on table public.tiktok_creator_db_backfill_staging is 'Staging table for DB-only cooperation backfill fields';
comment on table public.tiktok_cooperation_raw is 'Uploaded cooperation exports used for later enrichment';
comment on table public.tiktok_product_sku_cost_raw is 'Uploaded SPU SKU mapping exports used for later enrichment';
