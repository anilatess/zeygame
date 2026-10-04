-- ZeyGame Online Multiplayer Phase 2: host-selected game and synchronized round control.
-- Additive migration: preserves all rooms, players, Phase 1 RLS and existing RPC contracts.

alter table public.rooms
  add column selected_game_id text,
  add column session_state text not null default 'waiting',
  add column round_id uuid,
  add column start_at timestamptz;

alter table public.rooms
  add constraint rooms_selected_game_id_check check (
    selected_game_id is null or selected_game_id in (
      'ice-breaker',
      'squat-race',
      'mouth-open-race',
      'fruit-slice',
      'jump-race',
      'dance-mimic',
      'face-mimic',
      'mouth-catch'
    )
  ),
  add constraint rooms_session_state_check check (
    session_state in ('waiting', 'countdown', 'playing', 'finished')
  ),
  add constraint rooms_active_session_fields_check check (
    session_state = 'waiting'
    or (selected_game_id is not null and round_id is not null and start_at is not null)
  );

create or replace function private.select_room_game_impl(target_room_id uuid, requested_game_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_room public.rooms%rowtype;
begin
  select r.* into target_room
  from public.rooms as r
  where r.id = target_room_id
  for update;

  if not found then raise exception using errcode = 'ZX404', message = 'ROOM_NOT_FOUND'; end if;
  if target_room.host_user_id <> current_user_id then
    raise exception using errcode = 'ZX403', message = 'HOST_ONLY';
  end if;
  if target_room.status <> 'waiting' then
    raise exception using errcode = 'ZX409', message = 'ROOM_CLOSED';
  end if;
  if target_room.session_state not in ('waiting', 'finished') then
    raise exception using errcode = 'ZX409', message = 'ROUND_ALREADY_STARTED';
  end if;
  if requested_game_id not in (
    'ice-breaker', 'squat-race', 'mouth-open-race', 'fruit-slice',
    'jump-race', 'dance-mimic', 'face-mimic', 'mouth-catch'
  ) then
    raise exception using errcode = 'ZX422', message = 'INVALID_GAME_ID';
  end if;

  update public.rooms as r
  set selected_game_id = requested_game_id,
      session_state = 'waiting',
      round_id = null,
      start_at = null,
      updated_at = statement_timestamp()
  where r.id = target_room_id;

  update public.room_players as rp
  set is_ready = false
  where rp.room_id = target_room_id;
end;
$$;

create or replace function private.start_room_game_impl(target_room_id uuid)
returns table (
  started_round_id uuid,
  selected_game_id text,
  start_at timestamptz,
  server_now timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  target_room public.rooms%rowtype;
  new_round_id uuid;
  new_start_at timestamptz;
  player_count integer;
  ready_count integer;
begin
  select r.* into target_room
  from public.rooms as r
  where r.id = target_room_id
  for update;

  if not found then raise exception using errcode = 'ZX404', message = 'ROOM_NOT_FOUND'; end if;
  if target_room.host_user_id <> current_user_id then
    raise exception using errcode = 'ZX403', message = 'HOST_ONLY';
  end if;
  if target_room.status <> 'waiting' then
    raise exception using errcode = 'ZX409', message = 'ROOM_CLOSED';
  end if;
  if target_room.expires_at <= statement_timestamp() then
    raise exception using errcode = 'ZX410', message = 'ROOM_EXPIRED';
  end if;
  if target_room.session_state <> 'waiting' then
    raise exception using errcode = 'ZX409', message = 'ROUND_ALREADY_STARTED';
  end if;
  if target_room.selected_game_id is null then
    raise exception using errcode = 'ZX422', message = 'GAME_NOT_SELECTED';
  end if;

  select count(*), count(*) filter (where rp.is_ready)
  into player_count, ready_count
  from public.room_players as rp
  where rp.room_id = target_room_id;

  if player_count <> 2 then
    raise exception using errcode = 'ZX409', message = 'TWO_PLAYERS_REQUIRED';
  end if;
  if ready_count <> 2 then
    raise exception using errcode = 'ZX409', message = 'BOTH_PLAYERS_NOT_READY';
  end if;

  new_round_id := gen_random_uuid();
  new_start_at := statement_timestamp() + interval '5 seconds';
  update public.rooms as r
  set session_state = 'countdown',
      round_id = new_round_id,
      start_at = new_start_at,
      updated_at = statement_timestamp()
  where r.id = target_room_id;

  return query
  select new_round_id, target_room.selected_game_id, new_start_at, statement_timestamp();
end;
$$;

create or replace function private.confirm_room_playing_impl(target_room_id uuid, target_round_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.rooms as r
  set session_state = 'playing', updated_at = statement_timestamp()
  where r.id = target_room_id
    and r.host_user_id = (select auth.uid())
    and r.status = 'waiting'
    and r.session_state = 'countdown'
    and r.round_id = target_round_id
    and r.start_at <= statement_timestamp();
  if not found then raise exception using errcode = 'ZX409', message = 'SESSION_TRANSITION_REJECTED'; end if;
end;
$$;

create or replace function private.finish_room_game_impl(target_room_id uuid, target_round_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.rooms as r
  set session_state = 'finished', updated_at = statement_timestamp()
  where r.id = target_room_id
    and r.host_user_id = (select auth.uid())
    and r.status = 'waiting'
    and r.session_state = 'playing'
    and r.round_id = target_round_id;
  if not found then raise exception using errcode = 'ZX409', message = 'SESSION_TRANSITION_REJECTED'; end if;
end;
$$;

create or replace function private.reset_room_session_impl(target_room_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.rooms as r
  set session_state = 'waiting', round_id = null, start_at = null, updated_at = statement_timestamp()
  where r.id = target_room_id
    and r.host_user_id = (select auth.uid())
    and r.status = 'waiting'
    and r.session_state = 'finished';
  if not found then raise exception using errcode = 'ZX409', message = 'SESSION_TRANSITION_REJECTED'; end if;
  update public.room_players as rp set is_ready = false where rp.room_id = target_room_id;
end;
$$;

-- Ready is allowed only while the room is in its pre-round waiting state.
create or replace function private.set_room_ready_impl(target_room_id uuid, ready boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.room_players as rp
  set is_ready = ready
  where rp.room_id = target_room_id
    and rp.user_id = (select auth.uid())
    and exists (
      select 1 from public.rooms as r
      where r.id = target_room_id and r.status = 'waiting' and r.session_state = 'waiting'
    );
  if not found then raise exception using errcode = 'ZX403', message = 'READY_NOT_ALLOWED'; end if;
end;
$$;

-- Explicit Player 2 leave cancels an active round; transient disconnects never call this RPC.
create or replace function private.leave_room_impl(target_room_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
  leaving_slot smallint;
begin
  select rp.player_slot into leaving_slot
  from public.room_players as rp
  where rp.room_id = target_room_id and rp.user_id = current_user_id;
  if not found then raise exception using errcode = 'ZX403', message = 'NOT_A_ROOM_MEMBER'; end if;

  if leaving_slot = 1 then
    update public.rooms as r set status = 'closed', updated_at = statement_timestamp()
    where r.id = target_room_id and r.host_user_id = current_user_id;
  else
    update public.rooms as r
    set session_state = 'waiting', round_id = null, start_at = null, updated_at = statement_timestamp()
    where r.id = target_room_id and r.status = 'waiting';
  end if;

  delete from public.room_players as rp
  where rp.room_id = target_room_id and rp.user_id = current_user_id;
  update public.room_players as rp set is_ready = false where rp.room_id = target_room_id;
end;
$$;

revoke all on function private.select_room_game_impl(uuid, text) from public;
revoke all on function private.start_room_game_impl(uuid) from public;
revoke all on function private.confirm_room_playing_impl(uuid, uuid) from public;
revoke all on function private.finish_room_game_impl(uuid, uuid) from public;
revoke all on function private.reset_room_session_impl(uuid) from public;
grant execute on function private.select_room_game_impl(uuid, text) to authenticated;
grant execute on function private.start_room_game_impl(uuid) to authenticated;
grant execute on function private.confirm_room_playing_impl(uuid, uuid) to authenticated;
grant execute on function private.finish_room_game_impl(uuid, uuid) to authenticated;
grant execute on function private.reset_room_session_impl(uuid) to authenticated;

create or replace function public.select_room_game(room_id uuid, game_id text)
returns void language sql security invoker set search_path = ''
as $$ select private.select_room_game_impl($1, $2); $$;
create or replace function public.start_room_game(room_id uuid)
returns table (started_round_id uuid, selected_game_id text, start_at timestamptz, server_now timestamptz)
language sql security invoker set search_path = ''
as $$ select * from private.start_room_game_impl($1); $$;
create or replace function public.confirm_room_playing(room_id uuid, round_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.confirm_room_playing_impl($1, $2); $$;
create or replace function public.finish_room_game(room_id uuid, round_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.finish_room_game_impl($1, $2); $$;
create or replace function public.reset_room_session(room_id uuid)
returns void language sql security invoker set search_path = ''
as $$ select private.reset_room_session_impl($1); $$;
create or replace function public.get_server_time()
returns timestamptz language sql stable security invoker set search_path = ''
as $$ select statement_timestamp(); $$;

revoke all on function public.select_room_game(uuid, text) from public;
revoke all on function public.start_room_game(uuid) from public;
revoke all on function public.confirm_room_playing(uuid, uuid) from public;
revoke all on function public.finish_room_game(uuid, uuid) from public;
revoke all on function public.reset_room_session(uuid) from public;
revoke all on function public.get_server_time() from public;
grant execute on function public.select_room_game(uuid, text) to authenticated;
grant execute on function public.start_room_game(uuid) to authenticated;
grant execute on function public.confirm_room_playing(uuid, uuid) to authenticated;
grant execute on function public.finish_room_game(uuid, uuid) to authenticated;
grant execute on function public.reset_room_session(uuid) to authenticated;
grant execute on function public.get_server_time() to authenticated;

