// Run: node scripts/verify-online-phase3.mjs. Score/event sync and security checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const migration = read('supabase/migrations/202610040004_online_scores_events_and_round_seed.sql');
const service = read('src/online/room-service.ts');
const realtime = read('src/online/room-realtime.ts');
const hook = read('src/online/useOnlineRoom.ts');
const manager = read('src/game-manager.ts');

assert.match(migration, /create table public\.room_round_scores/);
assert.match(migration, /alter table public\.room_round_scores enable row level security/);
assert.match(migration, /private\.is_room_member\(room_id\)/);
assert.match(migration, /select rp\.player_slot into current_slot/);
assert.match(migration, /rp\.user_id = current_user_id/);
assert.match(migration, /r\.round_id = target_round_id/);
assert.match(migration, /not existing\.is_final/);
assert.match(migration, /extension = 'broadcast'/);
assert.doesNotMatch(
  migration,
  /grant\s+(insert|update|delete|all)\s+on\s+public\.room_round_scores/i,
);
assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)|drop\s+table|truncate\s+/i);

assert.match(service, /rpc\('submit_round_score'/);
assert.match(realtime, /event: 'online-event'/);
assert.match(realtime, /table: 'room_round_scores'/);
assert.match(hook, /queue\.enqueue\(/);
assert.match(hook, /await flushScores\(\)/);
assert.match(manager, /setOnlineRemoteScore/);
assert.match(manager, /this\.lastScores\[index\]/);

for (const path of ['src/game-controller.ts', 'src/game-manager.ts'])
  assert.doesNotMatch(read(path), /getSupabaseClient|room-service|room-realtime/);
for (const name of fs.readdirSync(new URL('src/games/', root)))
  if (name.endsWith('.ts')) assert.doesNotMatch(read(`src/games/${name}`), /supabase/i);

console.log(
  'PASS online phase 3: live events, reconnectable final scores, RLS and engine isolation',
);
