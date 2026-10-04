-- ZeyGame Online Multiplayer Phase 3/5: persisted round scores, secure Broadcast
-- authorization and deterministic per-round challenge generation.
-- Additive only: no Phase 1/2 table or migration is rewritten.

alter table public.rooms add column round_seed integer;

create table public.room_round_scores (
  room_id uuid not null references public.rooms(id) on delete cascade,
  round_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_slot smallint not null check (player_slot in (1, 2)),
  score integer not null check (score between 0 and 1000000),
  sequence integer not null check (sequence between 0 and 1000000),
  is_final boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (room_id, round_id, player_slot)
);

create index room_round_scores_user_idx on public.room_round_scores(user_id);
alter table public.room_round_scores replica identity full;
alter table public.room_round_scores enable row level security;
revoke all on public.room_round_scores from anon, authenticated;
grant select on public.room_round_scores to authenticated;

create policy "members can read round scores"
on public.room_round_scores for select to authenticated
using ((select private.is_room_member(room_id)));

create or replace function private.submit_round_score_impl(
  target_room_id uuid,
  target_round_id uuid,
  new_score integer,
  new_sequence integer,
  score_is_final boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
  current_slot smallint;
begin
  if current_user_id is null then
    raise exception using errcode = 'ZX401', message = 'AUTH_REQUIRED';
  end if;
  if new_score not between 0 and 1000000 or new_sequence not between 0 and 1000000 then
    raise exception using errcode = 'ZX422', message = 'INVALID_SCORE';
  end if;

  select rp.player_slot into current_slot
  from public.room_players as rp
  where rp.room_id = target_room_id and rp.user_id = current_user_id;
  if not found then
    raise exception using errcode = 'ZX403', message = 'NOT_A_ROOM_MEMBER';
  end if;

  if not exists (
    select 1 from public.rooms as r
    where r.id = target_room_id
      and r.round_id = target_round_id
      and r.status = 'waiting'
      and r.session_state in ('countdown', 'playing', 'finished')
  ) then
    raise exception using errcode = 'ZX409', message = 'ROUND_NOT_ACTIVE';
  end if;

  insert into public.room_round_scores as existing
    (room_id, round_id, user_id, player_slot, score, sequence, is_final, updated_at)
  values
    (target_room_id, target_round_id, current_user_id, current_slot, new_score,
     new_sequence, score_is_final, statement_timestamp())
  on conflict (room_id, round_id, player_slot) do update
  set score = excluded.score,
      sequence = excluded.sequence,
      is_final = excluded.is_final,
      updated_at = statement_timestamp()
  where not existing.is_final
    and (excluded.sequence > existing.sequence
      or (excluded.sequence = existing.sequence and excluded.is_final));
end;
$$;

revoke all on function private.submit_round_score_impl(uuid, uuid, integer, integer, boolean) from public;
grant execute on function private.submit_round_score_impl(uuid, uuid, integer, integer, boolean) to authenticated;

create or replace function public.submit_round_score(
  room_id uuid,
  round_id uuid,
  submitted_score integer,
  submitted_sequence integer,
  final_score boolean
)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.submit_round_score_impl($1, $2, $3, $4, $5);
$$;

revoke all on function public.submit_round_score(uuid, uuid, integer, integer, boolean) from public;
grant execute on function public.submit_round_score(uuid, uuid, integer, integer, boolean) to authenticated;

-- Broadcast carries only ephemeral score/signaling messages. Camera and audio
-- remain peer-to-peer WebRTC media and are never written to Supabase.
create policy "room members can receive broadcasts"
on realtime.messages for select to authenticated
using (extension = 'broadcast' and private.can_access_room_topic(realtime.topic()));
create policy "room members can send broadcasts"
on realtime.messages for insert to authenticated
with check (extension = 'broadcast' and private.can_access_room_topic(realtime.topic()));

alter publication supabase_realtime add table public.room_round_scores;

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
  new_round_seed integer;
  player_count integer;
  ready_count integer;
begin
  select r.* into target_room from public.rooms as r where r.id = target_room_id for update;
  if not found then raise exception using errcode = 'ZX404', message = 'ROOM_NOT_FOUND'; end if;
  if target_room.host_user_id <> current_user_id then raise exception using errcode = 'ZX403', message = 'HOST_ONLY'; end if;
  if target_room.status <> 'waiting' then raise exception using errcode = 'ZX409', message = 'ROOM_CLOSED'; end if;
  if target_room.expires_at <= statement_timestamp() then raise exception using errcode = 'ZX410', message = 'ROOM_EXPIRED'; end if;
  if target_room.session_state <> 'waiting' then raise exception using errcode = 'ZX409', message = 'ROUND_ALREADY_STARTED'; end if;
  if target_room.selected_game_id is null then raise exception using errcode = 'ZX422', message = 'GAME_NOT_SELECTED'; end if;

  select count(*), count(*) filter (where rp.is_ready)
  into player_count, ready_count
  from public.room_players as rp where rp.room_id = target_room_id;
  if player_count <> 2 then raise exception using errcode = 'ZX409', message = 'TWO_PLAYERS_REQUIRED'; end if;
  if ready_count <> 2 then raise exception using errcode = 'ZX409', message = 'BOTH_PLAYERS_NOT_READY'; end if;

  new_round_id := gen_random_uuid();
  new_start_at := statement_timestamp() + interval '5 seconds';
  new_round_seed := 1 + floor(random() * 2147483646)::integer;
  update public.rooms as r
  set session_state = 'countdown', round_id = new_round_id, start_at = new_start_at,
      round_seed = new_round_seed, updated_at = statement_timestamp()
  where r.id = target_room_id;
  return query select new_round_id, target_room.selected_game_id, new_start_at, statement_timestamp();
end;
$$;

create or replace function private.select_room_game_impl(target_room_id uuid, requested_game_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := (select auth.uid()); target_room public.rooms%rowtype;
begin
  select r.* into target_room from public.rooms as r where r.id = target_room_id for update;
  if not found then raise exception using errcode = 'ZX404', message = 'ROOM_NOT_FOUND'; end if;
  if target_room.host_user_id <> current_user_id then raise exception using errcode = 'ZX403', message = 'HOST_ONLY'; end if;
  if target_room.status <> 'waiting' then raise exception using errcode = 'ZX409', message = 'ROOM_CLOSED'; end if;
  if target_room.session_state not in ('waiting', 'finished') then raise exception using errcode = 'ZX409', message = 'ROUND_ALREADY_STARTED'; end if;
  if requested_game_id not in ('ice-breaker','squat-race','mouth-open-race','fruit-slice','jump-race','dance-mimic','face-mimic','mouth-catch') then
    raise exception using errcode = 'ZX422', message = 'INVALID_GAME_ID';
  end if;
  update public.rooms as r
  set selected_game_id = requested_game_id, session_state = 'waiting', round_id = null,
      start_at = null, round_seed = null, updated_at = statement_timestamp()
  where r.id = target_room_id;
  update public.room_players as rp set is_ready = false where rp.room_id = target_room_id;
end;
$$;

create or replace function private.reset_room_session_impl(target_room_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.rooms as r
  set session_state = 'waiting', round_id = null, start_at = null, round_seed = null,
      updated_at = statement_timestamp()
  where r.id = target_room_id and r.host_user_id = (select auth.uid())
    and r.status = 'waiting' and r.session_state = 'finished';
  if not found then raise exception using errcode = 'ZX409', message = 'SESSION_TRANSITION_REJECTED'; end if;
  update public.room_players as rp set is_ready = false where rp.room_id = target_room_id;
end;
$$;

create or replace function private.leave_room_impl(target_room_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := (select auth.uid()); leaving_slot smallint;
begin
  select rp.player_slot into leaving_slot from public.room_players as rp
  where rp.room_id = target_room_id and rp.user_id = current_user_id;
  if not found then raise exception using errcode = 'ZX403', message = 'NOT_A_ROOM_MEMBER'; end if;
  if leaving_slot = 1 then
    update public.rooms as r set status = 'closed', updated_at = statement_timestamp()
    where r.id = target_room_id and r.host_user_id = current_user_id;
  else
    update public.rooms as r
    set session_state = 'waiting', round_id = null, start_at = null, round_seed = null,
        updated_at = statement_timestamp()
    where r.id = target_room_id and r.status = 'waiting';
  end if;
  delete from public.room_players as rp where rp.room_id = target_room_id and rp.user_id = current_user_id;
  update public.room_players as rp set is_ready = false where rp.room_id = target_room_id;
end;
$$;
