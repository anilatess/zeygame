import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const events = read('src/online/online-events.ts');
const arena = read('src/components/OnlineArena.tsx');
const screen = read('src/components/OnlineScreen.tsx');

assert.match(events, /ONLINE_REACTIONS = \['👏', '😂', '🔥', '💪'\]/);
assert.match(events, /event\.kind === 'reaction'/, 'reaction events should be validated');
assert.match(events, /ONLINE_REACTIONS\.includes/, 'unknown reactions should be rejected');
assert.match(arena, /onReaction\(item\)/, 'arena controls should send reactions');
assert.match(
  screen,
  /event\.senderUserId !== snapshot\.currentUserId/,
  'own reactions should be ignored',
);
assert.match(screen, /BAŞLAMADAN ÖNCE/, 'lobby should explain readiness progress');

console.log('Online reactions and readiness checks passed.');
