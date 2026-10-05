import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../src/online/invite-link.ts', import.meta.url), 'utf8');
const screen = await readFile(
  new URL('../src/components/OnlineScreen.tsx', import.meta.url),
  'utf8',
);

assert.match(source, /new URLSearchParams\(search\)/, 'invite parser should use URL query params');
assert.match(source, /validateRoomCode/, 'invite room codes should use the normal validation');
assert.match(screen, /invitedRoomCode \? 'join' : 'create'/, 'invite should open the join tab');
assert.match(screen, /navigator\.share/, 'mobile share sheet should be preferred');
assert.match(screen, /DAVET LİNKİNİ PAYLAŞ/, 'lobby should expose the invite action');

console.log('Online invite link checks passed.');
