// Run: node scripts/verify-pose-reliability.mjs
// Executes production TypeScript through its public APIs; no camera/model downloads.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = fileURLToPath(new URL('../', import.meta.url));
const modules = new Map();
function load(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename);
  const exports = {};
  modules.set(filename, exports);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(
    outputText,
    {
      exports,
      require: (specifier) =>
        load(path.relative(root, path.resolve(path.dirname(filename), specifier + '.ts'))),
      performance,
    },
    { filename },
  );
  return exports;
}

const { PoseTracker } = load('src/pose-tracker.ts');
const { SquatRace } = load('src/games/squat-race.ts');
const { GameManager } = load('src/game-manager.ts');
const joints = [23, 24, 25, 26, 27, 28];
const confidence = { visibility: 0.9, presence: 0.8 };
function pose(down = false, fields = confidence) {
  const result = Array.from({ length: 33 }, () => ({ x: 0.7, y: 0.3, z: 0, ...fields }));
  for (const [hip, knee, ankle] of [
    [23, 25, 27],
    [24, 26, 28],
  ]) {
    result[hip].y = 0.4;
    result[knee].y = 0.6;
    result[ankle].x = down ? 0.9 : 0.7;
    result[ankle].y = down ? 0.6 : 0.8;
  }
  return result;
}
function player(points, detected = true) {
  return {
    hands: [],
    pose: { pose: points, detected },
    face: { face: null, blend: {}, detected: false },
    detected: false,
  };
}
function step(game, points, detected = true, second = null) {
  game.update(0.1, [player(points, detected), player(second, Boolean(second))]);
}
function scores(game) {
  return Array.from(game.getScores());
}
function createGame() {
  const game = new SquatRace();
  game.start();
  return game;
}

// Use detect() with a model-loader double, so smoothing is reached through the real pipeline.
let raw = pose();
const tracker = new PoseTracker(async () => ({
  detectForVideo: () => ({ landmarks: [raw] }),
  close() {},
}));
await tracker.load();
const video = { videoWidth: 1280, currentTime: 0 };
const first = tracker.detect(video)[0].pose;
assert.equal(first[23].visibility, 0.9);
assert.equal(first[23].presence, 0.8);
for (const fields of [
  { visibility: 0, presence: 0 },
  { visibility: 0.7 },
  { presence: 0.8 },
  {},
  { visibility: undefined, presence: 0 },
]) {
  const previous = tracker.detect(video)[0].pose;
  raw = pose(false, fields);
  raw[23].x = 0.8;
  raw[23].y = 0.5;
  raw[23].z = 0.2;
  video.currentTime++;
  const next = tracker.detect(video)[0].pose;
  for (const field of ['visibility', 'presence']) {
    assert.equal(next[23][field], fields[field], 'confidence must come from the current frame');
    assert.equal(
      Object.hasOwn(next[23], field),
      Object.hasOwn(fields, field),
      'optional field shape must be preserved',
    );
  }
  for (const axis of ['x', 'y', 'z']) {
    assert.ok(
      Math.abs(next[23][axis] - (previous[23][axis] * 0.65 + raw[23][axis] * 0.35)) < 1e-12,
    );
  }
}
raw = pose();
video.currentTime++;
tracker.detect(video);
raw = pose(false, { visibility: 0, presence: 0 });
video.currentTime++;
const low = tracker.detect(video)[0].pose;
assert.equal(low[23].visibility, 0);
assert.equal(low[23].presence, 0);
const integrated = createGame();
step(integrated, first);
step(integrated, pose(true));
step(integrated, low);
step(integrated, pose());
assert.deepEqual(scores(integrated), [0, 0], 'new zero confidence cancels the pending squat');
tracker.close();
console.log(
  'PASS production pose detect/smoothing: current confidence, optional fields, zero after high, position weights',
);

for (const fields of [
  confidence,
  { visibility: 0.55 },
  { presence: 0.55 },
  { visibility: 1, presence: 1 },
  { visibility: undefined, presence: 0.8 },
]) {
  const game = createGame();
  step(game, pose(false, fields));
  step(game, pose(true, fields));
  for (let i = 0; i < 10; i++) step(game, pose(true, fields));
  assert.deepEqual(scores(game), [0, 0]);
  step(game, pose(false, fields));
  for (let i = 0; i < 10; i++) step(game, pose(false, fields));
  assert.deepEqual(scores(game), [1, 0], 'exactly one point per valid cycle');
}

let invalidCases = 0;
function rejectsInvalid(points, label, detected = true) {
  const game = createGame();
  step(game, pose());
  step(game, pose(true));
  step(game, points, detected);
  step(game, pose());
  assert.deepEqual(scores(game), [0, 0], label + ': invalid frame cancels the pending repetition');
  step(game, pose(true));
  step(game, pose());
  assert.deepEqual(
    scores(game),
    [1, 0],
    label + ': counting resumes after a new standing-down-standing sequence',
  );
  invalidCases++;
}
for (const joint of joints) {
  const missing = pose();
  delete missing[joint];
  rejectsInvalid(missing, 'missing joint ' + joint);
  for (const axis of ['x', 'y', 'z']) {
    for (const value of [NaN, Infinity, -Infinity]) {
      const bad = pose();
      bad[joint][axis] = value;
      rejectsInvalid(bad, joint + '.' + axis + '=' + value);
    }
  }
  for (const fields of [
    {},
    { visibility: 0 },
    { presence: 0 },
    { visibility: 0.54 },
    { presence: 0.54 },
    { visibility: 0.9, presence: 0 },
    { visibility: 0, presence: 0.9 },
    { visibility: NaN, presence: 0.9 },
    { visibility: 0.9, presence: Infinity },
    { visibility: -0.1 },
    { presence: 1.1 },
    { visibility: null, presence: 0.9 },
    { visibility: '0.9' },
    { presence: undefined },
  ]) {
    const bad = pose();
    bad[joint] = { x: bad[joint].x, y: bad[joint].y, z: bad[joint].z, ...fields };
    rejectsInvalid(bad, 'confidence ' + joint + ': ' + JSON.stringify(fields));
    // An unreliable crouched frame must never arm the counter either.
    const crouched = pose(true);
    crouched[joint] = { ...bad[joint], x: crouched[joint].x, y: crouched[joint].y };
    const game = createGame();
    step(game, pose());
    step(game, crouched);
    step(game, pose());
    assert.deepEqual(scores(game), [0, 0]);
  }
}
rejectsInvalid(null, 'null pose');
rejectsInvalid(pose(), 'detected=false', false);
const noConfidence = createGame();
for (const down of [false, true, false]) step(noConfidence, pose(down, {}));
assert.deepEqual(scores(noConfidence), [0, 0]);
const startingDown = createGame();
for (let i = 0; i < 10; i++) step(startingDown, pose(true));
step(startingDown, pose());
assert.deepEqual(scores(startingDown), [0, 0]);
step(startingDown, pose(true));
step(startingDown, pose());
assert.deepEqual(scores(startingDown), [1, 0]);
const lost = createGame();
step(lost, pose());
step(lost, pose(true));
step(lost, null);
step(lost, pose(true));
step(lost, pose());
assert.deepEqual(
  scores(lost),
  [0, 0],
  'returning crouched still requires standing before a new cycle',
);
step(lost, pose(true));
step(lost, pose());
assert.deepEqual(scores(lost), [1, 0]);
const independent = createGame();
step(independent, pose(), true, pose());
step(independent, pose(true), true, pose(true));
step(independent, null, true, pose());
assert.deepEqual(
  scores(independent),
  [0, 1],
  'one player losing tracking does not cancel the other',
);
independent.start();
step(independent, pose());
assert.deepEqual(scores(independent), [0, 0], 'restart clears scores and pending cycles');
assert.equal(new GameManager([new SquatRace()]).getRemainingTime(), 20);
console.log(
  'PASS squat reliability: ' +
    invalidCases +
    ' invalid cases, optional confidence combinations, exact cycles, stationary poses, initial crouch, tracking loss, independent players, 20 seconds',
);
