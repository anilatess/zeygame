// Run: node scripts/verify-online-phase1.mjs. Static security checks plus pure helper validation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const source = read('src/online/room-types.ts');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const exports = {};
vm.runInNewContext(outputText, { exports }, { filename: 'room-types.ts' });

assert.equal(exports.validateRoomCode('583921'), '583921');
assert.throws(() => exports.validateRoomCode('12345'));
assert.throws(() => exports.validateRoomCode('1234567'));
assert.throws(() => exports.validateRoomCode('12A456'));
assert.equal(exports.validateDisplayName('  Zey   Oyuncu  '), 'Zey Oyuncu');
assert.throws(() => exports.validateDisplayName('   '));
assert.throws(() => exports.validateDisplayName('123456789012345678901'));

const client = read('src/lib/supabase.ts');
assert.match(client, /VITE_SUPABASE_PUBLISHABLE_KEY/);
assert.doesNotMatch(client, /service.role|service_role|sb_secret_/i);
assert.match(client, /if \(!url \|\| !key\)/, 'Supabase config must be lazy and optional');

const migration = read('supabase/migrations/202610040001_online_rooms_phase1.sql');
const ambiguityFix = read('supabase/migrations/202610040002_fix_join_room_ambiguity.sql');
for (const table of ['public.rooms', 'public.room_players'])
  assert.match(
    migration,
    new RegExp(`alter table ${table.replace('.', '\\.')} enable row level security`),
  );
assert.match(migration, /unique \(room_id, player_slot\)/);
assert.match(migration, /player_slot in \(1, 2\)/);
assert.match(migration, /where code = requested_code for update/);
assert.match(migration, /alter table public\.room_players replica identity full/);
assert.match(migration, /set search_path = ''/g);
assert.match(migration, /revoke all on public\.rooms from anon, authenticated/);
assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i);
assert.doesNotMatch(migration, /service_role|sb_secret_/i);

assert.match(ambiguityFix, /create or replace function private\.join_room_impl/);
assert.match(
  ambiguityFix,
  /from public\.rooms as r[\s\S]*where r\.code = requested_code[\s\S]*for update/,
);
assert.match(
  ambiguityFix,
  /from public\.room_players as rp[\s\S]*rp\.room_id = target_room\.id[\s\S]*rp\.player_slot = 2/,
);
assert.match(ambiguityFix, /rp\.user_id = current_user_id/);
assert.match(ambiguityFix, /returning rp\.id into new_player_id/);
assert.match(ambiguityFix, /set search_path = ''/g);
assert.match(ambiguityFix, /private\.join_room_impl\(\$1, \$2\)/);
assert.doesNotMatch(ambiguityFix, /where\s+room_id\s*=|and\s+user_id\s*=|and\s+player_slot\s*=/i);
assert.doesNotMatch(
  ambiguityFix,
  /drop\s+(table|schema)|truncate\s+|delete\s+from\s+public\.rooms/i,
);
assert.doesNotMatch(ambiguityFix, /using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i);

const realtime = read('src/online/room-realtime.ts');
assert.match(realtime, /private: true/);
assert.match(realtime, /presenceState/);
assert.match(realtime, /removeChannel/);
assert.doesNotMatch(realtime, /setInterval|setTimeout/);

const service = read('src/online/room-service.ts');
assert.match(service, /signInAnonymously/);
assert.match(service, /ROOM_RECOVERY_KEY/);
assert.match(service, /rpc\('create_room'/);
assert.match(service, /rpc\('join_room'/);
assert.match(service, /rpc\('set_room_ready'/);
assert.match(service, /rpc\('leave_room'/);
for (const safeError of [
  'Bu oda bulunamadı.',
  'Bu oda dolu!',
  'Bu oda artık aktif değil.',
  'Bu odanın süresi dolmuş.',
  'Bağlantı kurulamadı. İnternetini kontrol et.',
])
  assert.ok(service.includes(safeError), `Missing safe error mapping: ${safeError}`);
assert.doesNotMatch(service, /service_role|sb_secret_/i);

console.log(
  'PASS online phase 1: validation, lazy config, atomic RPC schema, RLS, Realtime Presence and recovery',
);
