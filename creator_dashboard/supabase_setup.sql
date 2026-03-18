create extension if not exists pgcrypto;

create table if not exists public.creator_sync_workspaces (
  workspace_id text primary key,
  workspace_name text not null,
  write_passcode_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.creator_sync_overrides (
  workspace_id text not null references public.creator_sync_workspaces(workspace_id) on delete cascade,
  kol_id text not null,
  fields jsonb not null default '{}'::jsonb,
  updated_by text,
  updated_at timestamptz not null default now(),
  primary key (workspace_id, kol_id)
);

create table if not exists public.creator_sync_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.creator_sync_workspaces(workspace_id) on delete cascade,
  tag_category text not null,
  tag_dimension text not null,
  tag_name text not null,
  brand_scope text,
  definition text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creator_sync_tags_unique unique (workspace_id, tag_dimension, tag_name)
);

alter table public.creator_sync_overrides enable row level security;
alter table public.creator_sync_tags enable row level security;

drop policy if exists creator_sync_overrides_read_all on public.creator_sync_overrides;
create policy creator_sync_overrides_read_all
on public.creator_sync_overrides
for select
to anon, authenticated
using (true);

drop policy if exists creator_sync_tags_read_all on public.creator_sync_tags;
create policy creator_sync_tags_read_all
on public.creator_sync_tags
for select
to anon, authenticated
using (true);

create or replace function public.verify_creator_workspace_passcode(
  p_workspace_id text,
  p_passcode text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  stored_hash text;
begin
  select write_passcode_hash
  into stored_hash
  from public.creator_sync_workspaces
  where workspace_id = p_workspace_id;

  if stored_hash is null then
    raise exception 'Workspace not found: %', p_workspace_id;
  end if;

  if crypt(coalesce(p_passcode, ''), stored_hash) <> stored_hash then
    raise exception 'Invalid write passcode';
  end if;
end;
$$;

create or replace function public.upsert_creator_override(
  p_workspace_id text,
  p_passcode text,
  p_editor_name text,
  p_kol_id text,
  p_fields jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.verify_creator_workspace_passcode(p_workspace_id, p_passcode);

  if p_fields is null or p_fields = '{}'::jsonb then
    delete from public.creator_sync_overrides
    where workspace_id = p_workspace_id
      and kol_id = p_kol_id;

    return jsonb_build_object(
      'workspace_id', p_workspace_id,
      'kol_id', p_kol_id,
      'deleted', true
    );
  end if;

  insert into public.creator_sync_overrides (
    workspace_id,
    kol_id,
    fields,
    updated_by,
    updated_at
  )
  values (
    p_workspace_id,
    p_kol_id,
    p_fields,
    nullif(trim(p_editor_name), ''),
    now()
  )
  on conflict (workspace_id, kol_id)
  do update set
    fields = excluded.fields,
    updated_by = excluded.updated_by,
    updated_at = now();

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'kol_id', p_kol_id,
    'saved', true
  );
end;
$$;

create or replace function public.upsert_custom_tag(
  p_workspace_id text,
  p_passcode text,
  p_editor_name text,
  p_tag_category text,
  p_tag_dimension text,
  p_tag_name text,
  p_brand_scope text,
  p_definition text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.verify_creator_workspace_passcode(p_workspace_id, p_passcode);

  insert into public.creator_sync_tags (
    workspace_id,
    tag_category,
    tag_dimension,
    tag_name,
    brand_scope,
    definition,
    created_by,
    updated_at
  )
  values (
    p_workspace_id,
    p_tag_category,
    p_tag_dimension,
    p_tag_name,
    nullif(trim(p_brand_scope), ''),
    nullif(trim(p_definition), ''),
    nullif(trim(p_editor_name), ''),
    now()
  )
  on conflict (workspace_id, tag_dimension, tag_name)
  do update set
    tag_category = excluded.tag_category,
    brand_scope = excluded.brand_scope,
    definition = excluded.definition,
    created_by = excluded.created_by,
    updated_at = now();

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'tag_dimension', p_tag_dimension,
    'tag_name', p_tag_name,
    'saved', true
  );
end;
$$;

create or replace function public.delete_custom_tag(
  p_workspace_id text,
  p_passcode text,
  p_tag_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.verify_creator_workspace_passcode(p_workspace_id, p_passcode);

  delete from public.creator_sync_tags
  where workspace_id = p_workspace_id
    and id = p_tag_id;

  return jsonb_build_object(
    'workspace_id', p_workspace_id,
    'tag_id', p_tag_id,
    'deleted', true
  );
end;
$$;

grant select on public.creator_sync_overrides to anon, authenticated;
grant select on public.creator_sync_tags to anon, authenticated;
grant execute on function public.upsert_creator_override(text, text, text, text, jsonb) to anon, authenticated;
grant execute on function public.upsert_custom_tag(text, text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function public.delete_custom_tag(text, text, uuid) to anon, authenticated;

comment on table public.creator_sync_workspaces is 'Creator dashboard shared workspaces';
comment on table public.creator_sync_overrides is 'Shared creator field overrides by workspace';
comment on table public.creator_sync_tags is 'Shared custom tags by workspace';

-- 首次初始化时，请把下面这行里的 workspace_id、workspace_name 和写入口令替换成你自己的值后再执行一次。
-- insert into public.creator_sync_workspaces (workspace_id, workspace_name, write_passcode_hash)
-- values ('creator-dashboard-prod', 'Creator Dashboard Prod', crypt('replace-with-your-passcode', gen_salt('bf')));
