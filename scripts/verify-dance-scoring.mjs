// Run: node scripts/verify-dance-scoring.mjs
// Real production scoring, independent landmark fixtures; no camera/model downloads.
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
      require: (s) => load(path.relative(root, path.resolve(path.dirname(filename), s + '.ts'))),
    },
    { filename },
  );
  return exports;
}
const { scoreDancePose, scoreDanceAngle, danceTargetLandmarks, DANCE_TARGETS, DanceMimic } = load(
  'src/games/dance-mimic.ts',
);
const { getCoverRect } = load('src/coordinate-mapper.ts');
const { GameManager } = load('src/game-manager.ts');
const joints = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-10, `${a} != ${b}`);
// These independent Cartesian fixtures do not import target angle definitions or reference skeletons.
function fixture(left = 'side', right = 'side', squat = false) {
  const points = [];
  for (const [side, s, e, w, h, k, a, arm] of [
    [1, 11, 13, 15, 23, 25, 27, left],
    [-1, 12, 14, 16, 24, 26, 28, right],
  ]) {
    points[s] = { x: side * 30, y: 100 };
    points[e] =
      arm === 'side' ? { x: side * 80, y: 100 } : { x: side * 30, y: arm === 'up' ? 50 : 140 };
    points[w] =
      arm === 'side' ? { x: side * 130, y: 100 } : { x: side * 30, y: arm === 'up' ? 0 : 180 };
    points[h] = { x: side * 30, y: 160 };
    points[k] = { x: side * (squat ? 90 : 30), y: squat ? 160 : 220 };
    points[a] = { x: side * (squat ? 90 : 30), y: squat ? 220 : 280 };
  }
  return points;
}
function normalized(points, aspect = 1, scale = 0.001, shift = [0.5, 0.2], rotation = 0) {
  const cos = Math.cos(rotation),
    sin = Math.sin(rotation);
  return points.map((p) => ({
    x: shift[0] + ((p.x * cos - p.y * sin) * scale) / aspect,
    y: shift[1] + (p.x * sin + p.y * cos) * scale,
    z: 0,
    visibility: 0.9,
    presence: 0.9,
  }));
}
const rect = { drawWidth: 1000, drawHeight: 1000, offsetX: 0, offsetY: 0 };
const physical = [
  fixture(),
  fixture('up', 'up'),
  fixture('side', 'side', true),
  fixture('up', 'side'),
];
const fixtures = physical.map((p) => normalized(p));
for (let target = 0; target < 4; target++) {
  const result = scoreDancePose(fixtures[target], target, rect);
  assert.equal(result.reliable, true);
  near(result.score, 1);
  console.log(`Correct target ${target + 1}: ${result.score}`);
  // The drawn skeleton is checked separately; it is not the primary fixture source.
  const reference = danceTargetLandmarks(target);
  near(scoreDancePose(reference, target, rect).score, 1);
  for (const scale of [0.0005, 0.001, 0.002]) {
    near(scoreDancePose(normalized(physical[target], 1, scale, [0.4, 0.1]), target, rect).score, 1);
  }
  for (const [width, height] of [
    [1280, 720],
    [720, 1280],
    [1000, 1000],
  ]) {
    for (const [canvasWidth, canvasHeight] of [
      [390, 844],
      [1920, 1080],
      [800, 800],
    ]) {
      const crop = getCoverRect(width, height, canvasWidth, canvasHeight);
      // Rotation makes both x/y non-axis-aligned; a missing aspect correction fails this check.
      const pose = normalized(physical[target], width / height, 0.001, [0.5, 0.2], 0.43);
      near(scoreDancePose(pose, target, crop).score, 1);
    }
  }
}
const standing = normalized(fixture('down', 'down'));
for (const target of [0, 1, 2]) {
  const score = scoreDancePose(standing, target, rect).score;
  assert.ok(score <= 0.2);
  console.log(`Arms down / standing vs target ${target + 1}: ${score}`);
}
const oneArm = scoreDancePose(fixtures[3], 1, rect).score;
assert.ok(oneArm <= 0.2);
console.log('Only left arm up vs both arms up: ' + oneArm);
const wrongArm = scoreDancePose(normalized(fixture('side', 'up')), 3, rect).score;
assert.ok(wrongArm <= 0.2);
assert.equal(DANCE_TARGETS[3].arms[0], 180);
assert.equal(DANCE_TARGETS[3].arms[1], 90);

let invalid = 0;
for (const joint of joints) {
  const missing = structuredClone(fixtures[0]);
  delete missing[joint];
  const cases = [missing];
  for (const axis of ['x', 'y', 'z'])
    for (const value of [NaN, Infinity, -Infinity, undefined]) {
      const p = structuredClone(fixtures[0]);
      p[joint][axis] = value;
      cases.push(p);
    }
  for (const fields of [
    {},
    { visibility: 0 },
    { presence: 0 },
    { visibility: 0.54 },
    { visibility: 0.9, presence: 0 },
    { visibility: 0, presence: 0.9 },
    { visibility: NaN },
    { presence: Infinity },
    { visibility: -0.1 },
    { presence: 1.1 },
    { visibility: null },
  ]) {
    const p = structuredClone(fixtures[0]);
    p[joint] = { x: p[joint].x, y: p[joint].y, z: 0, ...fields };
    cases.push(p);
  }
  for (const p of cases) {
    const result = scoreDancePose(p, 0, rect);
    assert.equal(result.score, 0);
    assert.equal(result.reliable, false);
    invalid++;
  }
}
for (const fields of [
  { visibility: 0.55 },
  { presence: 0.55 },
  { visibility: 0.55, presence: 0.55 },
]) {
  const p = fixtures[0].map((x) => x && { x: x.x, y: x.y, z: x.z, ...fields });
  near(scoreDancePose(p, 0, rect).score, 1);
}
const collapsed = structuredClone(fixtures[0]);
collapsed[13] = { ...collapsed[11] };
assert.equal(scoreDancePose(collapsed, 0, rect).reliable, false);
for (const badRect of [
  { ...rect, drawWidth: 0 },
  { ...rect, drawHeight: NaN },
])
  assert.equal(scoreDancePose(fixtures[0], 0, badRect).score, 0);

near(scoreDanceAngle(75, [75, 105], 30), 1);
near(scoreDanceAngle(105, [75, 105], 30), 1);
near(scoreDanceAngle(60, [75, 105], 30), 0.5);
near(scoreDanceAngle(120, [75, 105], 30), 0.5);
near(scoreDanceAngle(45, [75, 105], 30), 0);
near(scoreDanceAngle(135, [75, 105], 30), 0);
for (let degrees = 0; degrees <= 180; degrees += 0.25) {
  const score = scoreDanceAngle(degrees, [75, 105], 30);
  assert.ok(Number.isFinite(score) && score >= 0 && score <= 1);
}
for (const value of [NaN, Infinity, -Infinity, -1, 181])
  assert.equal(scoreDanceAngle(value, [75, 105], 30), 0);
// Off-axis independent landmark poses exercise the actual scorer near arm tolerance boundaries.
function armsAt(degrees) {
  const p = fixture();
  const radians = (degrees * Math.PI) / 180;
  for (const [side, s, e, w] of [
    [1, 11, 13, 15],
    [-1, 12, 14, 16],
  ]) {
    p[e] = { x: p[s].x + side * 50 * Math.sin(radians), y: p[s].y + 50 * Math.cos(radians) };
    p[w] = { x: p[s].x + side * 100 * Math.sin(radians), y: p[s].y + 100 * Math.cos(radians) };
  }
  return normalized(p);
}
for (const [degrees, expected] of [
  [90, 1],
  [75, 1],
  [105, 1],
  [60, 0.5],
  [120, 0.5],
  [45, 0],
  [135, 0],
])
  near(scoreDancePose(armsAt(degrees), 0, rect).score, expected);
near(scoreDancePose(armsAt(74.99), 0, rect).score, 1 - 0.01 / 30);
near(scoreDancePose(armsAt(105.01), 0, rect).score, 1 - 0.01 / 30);
console.log(
  `PASS ${invalid} invalid landmark cases; tolerance boundaries, source aspect/crop, scale/translation, skeleton consistency`,
);

function player(pose, detected = true) {
  return {
    hands: [],
    pose: { pose, detected },
    face: { face: null, blend: {}, detected: false },
    detected: true,
  };
}
const players = (pose, detected = true) => [player(pose, detected), player(null, false)];
const scores = (game) => Array.from(game.getScores());
const game = new DanceMimic();
game.start(1000, 1000);
for (let round = 0; round < 4; round++) {
  game.update(0, players(fixtures[round]), rect);
  const low = structuredClone(fixtures[round]);
  low[11].visibility = 0;
  game.update(1, players(low), rect);
  for (let second = 0; second < 5; second++) game.update(1, players(null, false), rect);
  assert.deepEqual(scores(game), [(round + 1) * 10, 0]);
  assert.deepEqual(scores(game), [(round + 1) * 10, 0]);
}
for (let i = 0; i < 5; i++) {
  game.update(1, players(fixtures[3]), rect);
  assert.deepEqual(scores(game), [40, 0]);
}
game.start(1000, 1000);
assert.deepEqual(scores(game), [0, 0]);
game.update(6, players(fixtures[0], false), rect);
assert.deepEqual(scores(game), [0, 0]);
const partial = new DanceMimic();
partial.start(1000, 1000);
partial.update(0, players(armsAt(60)), rect);
const invalidPerfect = structuredClone(fixtures[0]);
invalidPerfect[11].presence = 0;
partial.update(6, players(invalidPerfect), rect);
assert.deepEqual(scores(partial), [5, 0], 'invalid perfect pose must not raise the best score');
const overshoot = new DanceMimic();
overshoot.start(1000, 1000);
overshoot.update(24, players(fixtures[0]), rect);
assert.deepEqual(scores(overshoot), [10, 0], 'a frame cannot be reused to fill skipped rounds');
const manager = new GameManager([new DanceMimic()]);
manager.enterCalibration();
manager.update(0, players(fixtures[0]), 1000, 1000, rect);
assert.equal(manager.getState(), 'CALIBRATION', 'One reliable pose cannot prepare two players');
manager.update(0, [player(fixtures[0]), player(fixtures[0])], 1000, 1000, rect);
assert.equal(manager.getState(), 'COUNTDOWN');
manager.update(3, players(fixtures[0]), 1000, 1000, rect);
assert.equal(manager.getRemainingTime(), 24);
for (let round = 0; round < 4; round++)
  manager.update(6, players(fixtures[round]), 1000, 1000, rect);
assert.deepEqual(Array.from(manager.getTotals()), [40, 0]);
manager.update(5, players(null, false), 1000, 1000, rect);
assert.deepEqual(Array.from(manager.getTotals()), [40, 0]);
// Verify reference drawing uses the same skeleton and mirrored anatomical left.
const drawn = new DanceMimic();
drawn.start(1000, 1000);
for (let round = 0; round < 3; round++) drawn.update(6, players(null, false), rect);
const text = [],
  moves = [],
  lines = [];
const context = new Proxy(
  {
    fillText: (s) => text.push(s),
    moveTo: (x, y) => moves.push([x, y]),
    lineTo: (x, y) => lines.push([x, y]),
  },
  { get: (o, k) => (k in o ? o[k] : () => {}) },
);
drawn.draw(context);
assert.ok(text.some((s) => s.includes('Sol kolunu')));
const reference = danceTargetLandmarks(3);
assert.ok(reference[15].y < reference[11].y);
near(reference[16].y, reference[12].y);
assert.ok(moves.length === 12 && lines.length === 12);
near(moves[4][0], 500 - reference[11].x * 160);
near(moves[4][1], 430 + reference[11].y * 160);
near(lines[4][0], 500 - reference[13].x * 160);
near(lines[4][1], 430 + reference[13].y * 160);
assert.ok(
  lines[4][0] < 500 && lines[4][1] < moves[4][1],
  'the raised anatomical left arm is drawn on screen left',
);
console.log(
  'PASS four 6-second rounds: 10/20/30/40, best retained, invalid frames ignored, final score once, restart, manager integration, left-arm instruction/drawing',
);
