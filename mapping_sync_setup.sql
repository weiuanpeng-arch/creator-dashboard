create table if not exists public.product_lifecycle_map (
  workspace_id text not null references public.creator_sync_workspaces(workspace_id) on delete cascade,
  pid text not null,
  brand text,
  product_period text,
  product_name text,
  product_name_cn text,
  source_file text,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, pid)
);

create table if not exists public.creator_level_map (
  workspace_id text not null references public.creator_sync_workspaces(workspace_id) on delete cascade,
  brand text not null,
  creator_name text not null,
  creator_level text not null default 'L3',
  source_file text,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, brand, creator_name)
);

alter table public.product_lifecycle_map enable row level security;
alter table public.creator_level_map enable row level security;

drop policy if exists product_lifecycle_map_read_all on public.product_lifecycle_map;
create policy product_lifecycle_map_read_all
on public.product_lifecycle_map
for select
to anon, authenticated
using (true);

drop policy if exists creator_level_map_read_all on public.creator_level_map;
create policy creator_level_map_read_all
on public.creator_level_map
for select
to anon, authenticated
using (true);

create or replace function public.upsert_product_lifecycle_map_batch(
  p_workspace_id text,
  p_passcode text default null,
  p_editor_name text default null,
  p_source_file text default null,
  p_rows jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_input_count integer := coalesce(jsonb_array_length(coalesce(p_rows, '[]'::jsonb)), 0);
  v_total_count integer := 0;
  v_updated_count integer := 0;
  v_inserted_count integer := 0;
  v_skipped_count integer := 0;
begin
  with source_rows as (
    select
      row_number() over () as seq,
      trim(coalesce(pid, '')) as pid,
      nullif(trim(coalesce(brand, '')), '') as brand,
      nullif(trim(coalesce(product_period, '')), '') as product_period,
      nullif(trim(coalesce(product_name, '')), '') as product_name,
      nullif(trim(coalesce(product_name_cn, '')), '') as product_name_cn
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
      pid text,
      brand text,
      product_period text,
      product_name text,
      product_name_cn text
    )
  ),
  valid_rows as (
    select *
    from source_rows
    where pid ~ '^\d{10,}$'
  ),
  deduped_rows as (
    select distinct on (pid)
      p_workspace_id as workspace_id,
      pid,
      brand,
      product_period,
      product_name,
      product_name_cn
    from valid_rows
    order by pid, seq desc
  ),
  existing_rows as (
    select d.pid
    from deduped_rows d
    join public.product_lifecycle_map t
      on t.workspace_id = d.workspace_id
     and t.pid = d.pid
  ),
  upserted as (
    insert into public.product_lifecycle_map (
      workspace_id,
      pid,
      brand,
      product_period,
      product_name,
      product_name_cn,
      source_file,
      updated_by,
      updated_at
    )
    select
      workspace_id,
      pid,
      brand,
      product_period,
      product_name,
      product_name_cn,
      nullif(trim(coalesce(p_source_file, '')), ''),
      nullif(trim(coalesce(p_editor_name, '')), ''),
      now()
    from deduped_rows
    on conflict (workspace_id, pid)
    do update set
      brand = excluded.brand,
      product_period = excluded.product_period,
      product_name = excluded.product_name,
      product_name_cn = excluded.product_name_cn,
      source_file = excluded.source_file,
      updated_by = excluded.updated_by,
      updated_at = now()
    returning pid
  )
  select
    (select count(*) from deduped_rows),
    (select count(*) from existing_rows)
  into v_total_count, v_updated_count;

  v_inserted_count := greatest(v_total_count - v_updated_count, 0);
  v_skipped_count := greatest(v_input_count - v_total_count, 0);

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'total_count', v_total_count,
    'inserted_count', v_inserted_count,
    'updated_count', v_updated_count,
    'skipped_count', v_skipped_count
  );
end;
$$;

create or replace function public.upsert_creator_level_map_batch(
  p_workspace_id text,
  p_passcode text default null,
  p_editor_name text default null,
  p_source_file text default null,
  p_rows jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_input_count integer := coalesce(jsonb_array_length(coalesce(p_rows, '[]'::jsonb)), 0);
  v_total_count integer := 0;
  v_updated_count integer := 0;
  v_inserted_count integer := 0;
  v_skipped_count integer := 0;
begin
  with source_rows as (
    select
      row_number() over () as seq,
      upper(trim(coalesce(brand, ''))) as brand,
      trim(coalesce(creator_name, '')) as creator_name,
      trim(coalesce(creator_level, '')) as creator_level
    from jsonb_to_recordset(coalesce(p_rows, '[]'::jsonb)) as x(
      brand text,
      creator_name text,
      creator_level text
    )
  ),
  valid_rows as (
    select *
    from source_rows
    where brand in ('SPARCO', 'LETME', 'ICYEE', 'STYPRO')
      and creator_name <> ''
      and creator_level <> ''
  ),
  deduped_rows as (
    select distinct on (brand, creator_name)
      p_workspace_id as workspace_id,
      brand,
      creator_name,
      creator_level
    from valid_rows
    order by brand, creator_name, seq desc
  ),
  existing_rows as (
    select d.brand, d.creator_name
    from deduped_rows d
    join public.creator_level_map t
      on t.workspace_id = d.workspace_id
     and t.brand = d.brand
     and t.creator_name = d.creator_name
  ),
  upserted as (
    insert into public.creator_level_map (
      workspace_id,
      brand,
      creator_name,
      creator_level,
      source_file,
      updated_by,
      updated_at
    )
    select
      workspace_id,
      brand,
      creator_name,
      creator_level,
      nullif(trim(coalesce(p_source_file, '')), ''),
      nullif(trim(coalesce(p_editor_name, '')), ''),
      now()
    from deduped_rows
    on conflict (workspace_id, brand, creator_name)
    do update set
      creator_level = excluded.creator_level,
      source_file = excluded.source_file,
      updated_by = excluded.updated_by,
      updated_at = now()
    returning brand, creator_name
  )
  select
    (select count(*) from deduped_rows),
    (select count(*) from existing_rows)
  into v_total_count, v_updated_count;

  v_inserted_count := greatest(v_total_count - v_updated_count, 0);
  v_skipped_count := greatest(v_input_count - v_total_count, 0);

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'total_count', v_total_count,
    'inserted_count', v_inserted_count,
    'updated_count', v_updated_count,
    'skipped_count', v_skipped_count
  );
end;
$$;

grant select on public.product_lifecycle_map to anon, authenticated;
grant select on public.creator_level_map to anon, authenticated;
grant execute on function public.upsert_product_lifecycle_map_batch(text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.upsert_creator_level_map_batch(text, text, text, text, jsonb) to anon, authenticated;

comment on table public.product_lifecycle_map is 'Shared lifecycle mapping by workspace and PID';
comment on table public.creator_level_map is 'Shared creator level mapping by workspace, brand and creator name';
comment on function public.upsert_product_lifecycle_map_batch(text, text, text, text, jsonb) is 'Public batch upsert for lifecycle mapping. p_passcode kept for future compatibility and intentionally unused in the current public-write mode.';
comment on function public.upsert_creator_level_map_batch(text, text, text, text, jsonb) is 'Public batch upsert for creator level mapping. p_passcode kept for future compatibility and intentionally unused in the current public-write mode.';
