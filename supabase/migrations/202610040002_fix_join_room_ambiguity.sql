-- Correct Phase 1 RPC column qualification without changing tables, data, RLS or grants.
-- RETURNS TABLE names are PL/pgSQL variables, so every table column is explicitly qualified.

create or replace function private.is_room_member(target_room_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.room_players as rp
    where rp.room_id = target_room_id
      and rp.user_id = (select auth.uid())
  );
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
  if current_user_id is null then
    raise exception using errcode = 'ZX401', message = 'AUTH_REQUIRED';
  end if;
  if requested_code !~ '^[0-9]{6}$' then
    raise exception using errcode = 'ZX422', message = 'INVALID_ROOM_CODE';
  end if;
  if clean_name is null or char_length(clean_name) not between 1 and 20 then
    raise exception using errcode = 'ZX422', message = 'INVALID_DISPLAY_NAME';
  end if;

  select r.*
  into target_room
  from public.rooms as r
  where r.code = requested_code
  for update;

  if not found then
    raise exception using errcode = 'ZX404', message = 'ROOM_NOT_FOUND';
  end if;
  if target_room.status <> 'waiting' then
    raise exception using errcode = 'ZX409', message = 'ROOM_CLOSED';
  end if;
  if target_room.expires_at <= now() then
    raise exception using errcode = 'ZX410', message = 'ROOM_EXPIRED';
  end if;

  select rp.*
  into existing_player
  from public.room_players as rp
  where rp.room_id = target_room.id
    and rp.user_id = current_user_id;

  if found then
    return query
    select target_room.id, target_room.code, existing_player.id, existing_player.player_slot;
    return;
  end if;

  if exists (
    select 1
    from public.room_players as rp
    where rp.room_id = target_room.id
      and rp.player_slot = 2
  ) then
    raise exception using errcode = 'ZX409', message = 'ROOM_FULL';
  end if;

  insert into public.room_players as rp (room_id, user_id, display_name, player_slot)
  values (target_room.id, current_user_id, clean_name, 2)
  returning rp.id into new_player_id;

  return query select target_room.id, target_room.code, new_player_id, 2::smallint;
end;
$$;

create or replace function private.set_room_ready_impl(target_room_id uuid, ready boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.room_players as rp
  set is_ready = ready
  where rp.room_id = target_room_id
    and rp.user_id = (select auth.uid())
    and exists (
      select 1
      from public.rooms as r
      where r.id = target_room_id
        and r.status = 'waiting'
    );
  if not found then
    raise exception using errcode = 'ZX403', message = 'NOT_A_ROOM_MEMBER';
  end if;
end;
$$;

create or replace function private.leave_room_impl(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if exists (
    select 1
    from public.rooms as r
    where r.id = target_room_id
      and r.host_user_id = current_user_id
  ) then
    update public.rooms as r
    set status = 'closed', updated_at = now()
    where r.id = target_room_id;
  end if;

  delete from public.room_players as rp
  where rp.room_id = target_room_id
    and rp.user_id = current_user_id;
  if not found then
    raise exception using errcode = 'ZX403', message = 'NOT_A_ROOM_MEMBER';
  end if;
end;
$$;

-- Keep the public RPC signatures unchanged while removing parameter/output-name lookup ambiguity.
create or replace function public.create_room(display_name text)
returns table (room_id uuid, room_code text, player_id uuid, player_slot smallint)
language sql security invoker set search_path = ''
as $$ select * from private.create_room_impl($1); $$;

create or replace function public.join_room(room_code text, display_name text)
returns table (room_id uuid, room_code text, player_id uuid, player_slot smallint)
language sql security invoker set search_path = ''
as $$ select * from private.join_room_impl($1, $2); $$;

create or replace function public.set_room_ready(room_id uuid, ready boolean)
returns void language sql security invoker set search_path = ''
as $$ select private.set_room_ready_impl($1, $2); $$;

create or replace function public.leave_room(room_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.leave_room_impl($1); $$;

