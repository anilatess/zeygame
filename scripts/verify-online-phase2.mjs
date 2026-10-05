// Run: node scripts/verify-online-phase2.mjs. Phase 2 contract and isolation checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const migration = read('supabase/migrations/202610040003_online_game_session.sql');

for (const gameId of [
  'ice-breaker',
  'squat-race',
  'mouth-open-race',
  'fruit-slice',
  'jump-race',
  'dance-mimic',
  'face-mimic',
  'mouth-catch',
])
  assert.ok(migration.includes(`'${gameId}'`), `Migration game whitelist misses ${gameId}`);

assert.match(migration, /create or replace function private\.select_room_game_impl/);
assert.match(migration, /target_room\.host_user_id <> current_user_id/);
assert.match(migration, /create or replace function private\.start_room_game_impl/);
assert.match(migration, /from public\.rooms as r[\s\S]*for update/);
assert.match(migration, /player_count <> 2/);
assert.match(migration, /ready_count <> 2/);
assert.match(migration, /statement_timestamp\(\) \+ interval '5 seconds'/);
assert.match(migration, /new_round_id := gen_random_uuid\(\)/);
assert.match(migration, /target_room\.session_state <> 'waiting'/);
assert.match(migration, /set search_path = ''/g);
assert.doesNotMatch(migration, /drop\s+table|truncate\s+|using\s*\(\s*true\s*\)/i);
assert.doesNotMatch(migration, /start_room_game\([^)]*(start_at|round_id)/i);

const clockSource = read('src/online/session-clock.ts');
const { outputText } = ts.transpileModule(clockSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const exports = {};
vm.runInNewContext(outputText, { exports }, { filename: 'session-clock.ts' });
assert.equal(
  exports.remainingUntilStart(
    '2026-10-04T12:00:05.000Z',
    1000,
    Date.parse('2026-10-04T12:00:01.000Z'),
  ),
  3000,
);
assert.equal(exports.countdownLabel(3000), '3');
assert.equal(exports.countdownLabel(1999), '2');
assert.equal(exports.countdownLabel(1), '1');
assert.equal(exports.countdownLabel(0), 'BAŞLA!');

const onlineSources = [
  read('src/online/room-service.ts'),
  read('src/online/room-realtime.ts'),
  read('src/online/useOnlineRoom.ts'),
].join('\n');
assert.match(onlineSources, /rpc\('select_room_game'/);
assert.match(onlineSources, /rpc\('start_room_game'/);
// Room state stays event-driven. Only unacknowledged writes may retry on a timer.
assert.doesNotMatch(onlineSources, /setInterval\([^;]*(refresh|fetchRoom)/);

const onlineScreen = read('src/components/OnlineScreen.tsx');
assert.match(
  onlineScreen,
  /const selected = snapshot\.room\.selectedGameId === game\.id/,
  'exactly one card derives its selected state from selected_game_id',
);
assert.match(onlineScreen, /aria-pressed=\{selected\}/);
assert.match(onlineScreen, /selected && \([\s\S]*selected-game-check[\s\S]*selected-game-label/);
assert.match(onlineScreen, /className="selected-online-game selected"/);
assert.match(onlineScreen, /aria-label=\{`Seçilen oyun:/);
assert.match(onlineScreen, /disabled=\{online\.busy !== null\}/);
assert.doesNotMatch(
  onlineScreen,
  /disabled=\{online\.busy !== null \|\| cameraMode !== 'none'\}/,
  'camera preparation must not lock pre-session game reselection',
);
assert.match(onlineScreen, /Oyun değişti\. Hazır olmadan önce kameranı yeniden hazırla\./);
const styles = read('src/styles.css');
assert.match(styles, /\.selected-game-check/);
assert.match(styles, /@media \(max-width: 760px\)[\s\S]*\.selected-game-check/);
assert.match(styles, /button\[aria-pressed='true'\]/);

for (const path of ['src/game-controller.ts', 'src/game-manager.ts'])
  assert.doesNotMatch(
    read(path),
    /supabase|room-service|room-realtime/i,
    `${path} must stay network-independent`,
  );
for (const name of fs.readdirSync(new URL('src/games/', root)))
  if (name.endsWith('.ts')) assert.doesNotMatch(read(`src/games/${name}`), /supabase/i);

const phaseOneFix = read('supabase/migrations/202610040002_fix_join_room_ambiguity.sql');
assert.doesNotMatch(phaseOneFix, /where\s+room_id\s*=|and\s+user_id\s*=|and\s+player_slot\s*=/i);
assert.doesNotMatch(read('.env.example'), /sb_secret_|service_role/i);

console.log(
  'PASS online phase 2: host authority, atomic start, shared clock, round identity and engine isolation',
);
