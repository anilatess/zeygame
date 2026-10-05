import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(new URL('../src/profile-store.ts', import.meta.url), 'utf8');
const menu = fs.readFileSync(new URL('../src/components/MenuScreens.tsx', import.meta.url), 'utf8');
const online = fs.readFileSync(
  new URL('../src/components/OnlineScreen.tsx', import.meta.url),
  'utf8',
);
const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const exports = {};
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
vm.runInNewContext(outputText, { exports });

let profile = exports.defaultPlayerProfile();
profile = exports.recordOnlineMatch(profile, {
  matchId: 'room-1',
  gameId: 'ice-breaker',
  localWins: 2,
  remoteWins: 1,
  bestScore: 42,
});
assert.equal(profile.stats.matchesPlayed, 1);
assert.equal(profile.stats.wins, 1);
assert.equal(profile.stats.currentStreak, 1);
assert.equal(profile.stats.bestScores['ice-breaker'], 42);
const duplicate = exports.recordOnlineMatch(profile, {
  matchId: 'room-1',
  gameId: 'ice-breaker',
  localWins: 2,
  remoteWins: 0,
  bestScore: 99,
});
assert.equal(duplicate, profile, 'the same room must never be counted twice');
profile = exports.recordOnlineMatch(profile, {
  matchId: 'room-2',
  gameId: 'ice-breaker',
  localWins: 0,
  remoteWins: 2,
  bestScore: 30,
});
assert.equal(profile.stats.losses, 1);
assert.equal(profile.stats.currentStreak, 0);
assert.equal(profile.stats.bestScores['ice-breaker'], 42);
assert.match(menu, /AVATARINI SEÇ/);
assert.match(online, /onMatchComplete/);
assert.match(app, /window\.scrollTo/, 'screen changes should start at the top');

console.log('Player profile and statistics checks passed.');
