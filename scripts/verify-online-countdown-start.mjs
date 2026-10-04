// Run: node scripts/verify-online-countdown-start.mjs. Countdown/start regression for production.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const helperSource = read('src/online/session-start.ts');
const { outputText } = ts.transpileModule(helperSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
const exports = {};
vm.runInNewContext(outputText, { exports }, { filename: 'session-start.ts' });

const roundId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const gameId = 'fruit-slice';
const confirmState = {
  host: true,
  sessionState: 'countdown',
  roundId,
  confirmedRoundId: null,
  confirmingRoundId: null,
};
assert.equal(
  exports.canConfirmPlaying({ ...confirmState, measurement: null }),
  false,
  'initial render must not confirm before countdown is measured',
);
assert.equal(
  exports.canConfirmPlaying({
    ...confirmState,
    measurement: { roundId, remainingMs: 1 },
  }),
  false,
);
assert.equal(
  exports.canConfirmPlaying({
    ...confirmState,
    measurement: { roundId, remainingMs: 0 },
  }),
  true,
);
assert.equal(
  exports.canConfirmPlaying({
    ...confirmState,
    measurement: { roundId: 'stale-round', remainingMs: 0 },
  }),
  false,
);
assert.equal(
  exports.canConfirmPlaying({
    ...confirmState,
    measurement: { roundId, remainingMs: 0 },
    confirmedRoundId: roundId,
  }),
  false,
);

const startState = {
  activeSession: true,
  cameraPrepared: true,
  startAt: '2026-10-04T12:00:05.000Z',
  roundId,
  gameId,
  preparedGameId: gameId,
  startedSessionKey: null,
};
assert.equal(exports.shouldStartOnlineEngine(startState), true);
const sessionKey = exports.onlineEngineSessionKey(roundId, gameId);
assert.equal(sessionKey, `${roundId}:${gameId}`);
assert.equal(
  exports.shouldStartOnlineEngine({ ...startState, startedSessionKey: sessionKey }),
  false,
  'the same round/game must start GameController exactly once',
);
assert.equal(
  exports.shouldStartOnlineEngine({ ...startState, preparedGameId: 'mouth-catch' }),
  false,
  'the prepared engine game must match selected_game_id',
);
assert.doesNotMatch(helperSource, /peer|webrtc|remoteStream|remoteMedia/i);

const screen = read('src/components/OnlineScreen.tsx');
assert.match(screen, /useState<CountdownMeasurement \| null>\(\s*null/);
assert.match(screen, /canConfirmPlaying\(/);
assert.match(screen, /confirmPlayingRef\.current\(roundId\)\.then\(\(confirmed\)/);
assert.match(screen, /if \(confirmed\) \{[\s\S]*confirmedRoundRef\.current = roundId/);
assert.match(screen, /setConfirmRetry\(\(attempt\) => attempt \+ 1\)/);
assert.match(screen, /shouldStartOnlineEngine\(/);
assert.match(screen, /const started = controllerRef\.current\?\.runOnline\(/);
assert.match(screen, /if \(started\) startedEngineSessionRef\.current = sessionKey/);
assert.doesNotMatch(
  screen,
  /peer\.(state|remoteStream)[\s\S]{0,160}runOnline|runOnline[\s\S]{0,160}peer\.(state|remoteStream)/,
  'remote media must not gate GameController start',
);

const controller = read('src/game-controller.ts');
assert.match(controller, /runOnline\([^)]*\): boolean/);
assert.match(
  controller,
  /if \(!this\.prepared \|\| this\.running \|\| !this\.manager\.isOnline\(\)\) return false/,
);
assert.match(controller, /this\.elements\.root\.focus\(\);\s*return true/);

console.log(
  'PASS online countdown start: measured transition, retry safety and exactly-once round/game engine launch',
);
