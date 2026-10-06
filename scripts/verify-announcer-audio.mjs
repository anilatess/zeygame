import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const audio = read('src/audio.ts');
const manager = read('src/game-manager.ts');
const arena = read('src/components/OnlineArena.tsx');
const screen = read('src/components/OnlineScreen.tsx');

assert.match(audio, /SpeechSynthesisUtterance/);
assert.match(audio, /utterance\.lang = 'tr-TR'/);
assert.match(audio, /speechSynthesis\.cancel\(\)/, 'old announcements should not overlap');
assert.match(manager, /audio\.say\('Başla!'\)/);
assert.match(manager, /audio\.say\('Son on saniye!'\)/);
assert.match(read('src/game-controller.ts'), /audio\.say\('Oyun bitti!'\)/);
assert.match(arena, /Rakibin sesini aç/);
assert.match(screen, /getAudioTracks\(\)/);
assert.match(screen, /track\.enabled = !nextMuted/);

console.log('Announcer and independent microphone controls passed.');
