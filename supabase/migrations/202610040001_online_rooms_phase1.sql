-- ZeyGame Online Multiplayer Phase 1: room membership, ready state and Realtime authorization.
create extension if not exists pgcrypto;
create schema if not exists private;
grant usage on schema private to authenticated;

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{6}$'),
  host_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'waiting' check (status in ('waiting', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '2 hours')
);

create table public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 20 and display_name = btrim(display_name)),
  player_slot smallint not null check (player_slot in (1, 2)),
  is_ready boolean not null default false,
  joined_at timestamptz not null default now(),
  unique (room_id, user_id),
  unique (room_id, player_slot)
);

create index room_players_user_id_idx on public.room_players(user_id);
create index rooms_code_open_idx on public.rooms(code) where status = 'waiting';
alter table public.room_players replica identity full;

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;

revoke all on public.rooms from anon, authenticated;
revoke all on public.room_players from anon, authenticated;
grant select on public.rooms, public.room_players to authenticated;

create or replace function private.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.room_players
    where room_id = target_room_id and user_id = (select auth.uid())
  );
$$;

revoke all on function private.is_room_member(uuid) from public;
grant execute on function private.is_room_member(uuid) to authenticated;

create policy "members can read their rooms"
on public.rooms for select to authenticated
using ((select private.is_room_member(id)));

create policy "members can read players in their rooms"
on public.room_players for select to authenticated
using ((select private.is_room_member(room_id)));

create or replace function private.create_room_impl(requested_name text)
returns table (room_id uuid, room_code text, player_id uuid, player_slot smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  clean_name text := btrim(requested_name);
  new_room_id uuid;
  new_code text;
  new_player_id uuid;
  attempt integer;
begin
  if current_user_id is null then raise exception using errcode = 'ZX401', message = 'AUTH_REQUIRED'; end if;
  if clean_name is null or char_length(clean_name) not between 1 and 20 then
    raise exception using errcode = 'ZX422', message = 'INVALID_DISPLAY_NAME';
  end if;

  for attempt in 1..12 loop
    new_code := lpad(floor(random() * 1000000)::integer::text, 6, '0');
    begin
      insert into public.rooms (code, host_user_id)
      values (new_code, current_user_id)
      returning id into new_room_id;
      exit;
    exception when unique_violation then
      new_room_id := null;
    end;
  end loop;
  if new_room_id is null then raise exception using errcode = 'ZX503', message = 'ROOM_CODE_EXHAUSTED'; end if;

  insert into public.room_players (room_id, user_id, display_name, player_slot)
  values (new_room_id, current_user_id, clean_name, 1)
  returning id into new_player_id;

  return query select new_room_id, new_code, new_player_id, 1::smallint;
end;
$$;

create or replace function private.join_room_impl(requested_code text, requested_name text)
returns table (room_id uuid, room_code text, player_id uuid, player_slot smallint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  clean_name text := btrim(requested_name);
  target_room public.rooms%rowtype;
  existing_player public.room_players%rowtype;
  new_player_id uuid;
begin
  if current_user_id is null then raise exception using errcode = 'ZX401', message = 'AUTH_REQUIRED'; end if;
  if requested_code !~ '^[0-9]{6}$' then raise exception using errcode = 'ZX422', message = 'INVALID_ROOM_CODE'; end if;
  if clean_name is null or char_length(clean_name) not between 1 and 20 then
    raise exception using errcode = 'ZX422', message = 'INVALID_DISPLAY_NAME';
  end if;

  select * into target_room from public.rooms where code = requested_code for update;
  if not found then raise exception using errcode = 'ZX404', message = 'ROOM_NOT_FOUND'; end if;
  if target_room.status <> 'waiting' then raise exception using errcode = 'ZX409', message = 'ROOM_CLOSED'; end if;
  if target_room.expires_at <= now() then raise exception using errcode = 'ZX410', message = 'ROOM_EXPIRED'; end if;

  select * into existing_player from public.room_players
  where public.room_players.room_id = target_room.id and user_id = current_user_id;
  if found then
    return query select target_room.id, target_room.code, existing_player.id, existing_player.player_slot;
    return;
  end if;
  if exists (select 1 from public.room_players where room_id = target_room.id and player_slot = 2) then
    raise exception using errcode = 'ZX409', message = 'ROOM_FULL';
  end if;

  insert into public.room_players (room_id, user_id, display_name, player_slot)
  values (target_room.id, current_user_id, clean_name, 2)
  returning id into new_player_id;
  return query select target_room.id, target_room.code, new_player_id, 2::smallint;
end;
$$;

create or replace function private.set_room_ready_impl(target_room_id uuid, ready boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.room_players set is_ready = ready
  where room_id = target_room_id
    and user_id = (select auth.uid())
    and exists (select 1 from public.rooms where id = target_room_id and status = 'waiting');
  if not found then raise exception using errcode = 'ZX403', message = 'NOT_A_ROOM_MEMBER'; end if;
end;
$$;

create or replace function private.leave_room_impl(target_room_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := (select auth.uid());
begin
  if exists (select 1 from public.rooms where id = target_room_id and host_user_id = current_user_id) then
    update public.rooms set status = 'closed', updated_at = now() where id = target_room_id;
  end if;
  delete from public.room_players where room_id = target_room_id and user_id = current_user_id;
  if not found then raise exception using errcode = 'ZX403', message = 'NOT_A_ROOM_MEMBER'; end if;
end;
$$;

revoke all on function private.create_room_impl(text) from public;
revoke all on function private.join_room_impl(text, text) from public;
revoke all on function private.set_room_ready_impl(uuid, boolean) from public;
revoke all on function private.leave_room_impl(uuid) from public;
grant execute on function private.create_room_impl(text) to authenticated;
grant execute on function private.join_room_impl(text, text) to authenticated;
grant execute on function private.set_room_ready_impl(uuid, boolean) to authenticated;
grant execute on function private.leave_room_impl(uuid) to authenticated;

create or replace function public.create_room(display_name text)
returns table (room_id uuid, room_code text, player_id uuid, player_slot smallint)
language sql security invoker set search_path = ''
as $$ select * from private.create_room_impl(display_name); $$;
create or replace function public.join_room(room_code text, display_name text)
returns table (room_id uuid, room_code text, player_id uuid, player_slot smallint)
language sql security invoker set search_path = ''
as $$ select * from private.join_room_impl(room_code, display_name); $$;
create or replace function public.set_room_ready(room_id uuid, ready boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.set_room_ready_impl(room_id, ready); $$;
create or replace function public.leave_room(room_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.leave_room_impl(room_id); $$;

revoke all on function public.create_room(text) from public;
revoke all on function public.join_room(text, text) from public;
revoke all on function public.set_room_ready(uuid, boolean) from public;
revoke all on function public.leave_room(uuid) from public;
grant execute on function public.create_room(text) to authenticated;
grant execute on function public.join_room(text, text) to authenticated;
grant execute on function public.set_room_ready(uuid, boolean) to authenticated;
grant execute on function public.leave_room(uuid) to authenticated;

-- Private Realtime channels use topics in the form room:<uuid>.
create or replace function private.can_access_room_topic(topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare parsed_room_id uuid;
begin
  if topic !~ '^room:[0-9a-fA-F-]{36}$' then return false; end if;
  parsed_room_id := substring(topic from 6)::uuid;
  return private.is_room_member(parsed_room_id);
exception when invalid_text_representation then return false;
end;
$$;
revoke all on function private.can_access_room_topic(text) from public;
grant execute on function private.can_access_room_topic(text) to authenticated;

create policy "room members can receive presence"
on realtime.messages for select to authenticated
using (extension = 'presence' and private.can_access_room_topic(realtime.topic()));
create policy "room members can track presence"
on realtime.messages for insert to authenticated
with check (extension = 'presence' and private.can_access_room_topic(realtime.topic()));

alter publication supabase_realtime add table public.rooms;
alter publication supabase_realtime add table public.room_players;
