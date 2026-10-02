// Run: node scripts/verify-coordinates.mjs
// Uses the existing TypeScript dependency; no browser, camera or model downloads.
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
  const source = fs.readFileSync(filename, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(
    outputText,
    {
      exports,
      require: (specifier) =>
        load(path.relative(root, path.resolve(path.dirname(filename), specifier + '.ts'))),
      HTMLMediaElement: { HAVE_CURRENT_DATA: 2 },
      window: { devicePixelRatio: 2 },
    },
    { filename },
  );
  return exports;
}

const { getCoverRect, toCanvasPoint } = load('src/coordinate-mapper.ts');
const { CameraController } = load('src/camera.ts');
const { PlayerTracker } = load('src/player-tracker.ts');
const { PoseTracker } = load('src/pose-tracker.ts');
const { FaceTracker } = load('src/face-tracker.ts');
const { GameManager } = load('src/game-manager.ts');
const { IceBreaker } = load('src/games/ice-breaker.ts');
const { FruitSlice } = load('src/games/fruit-slice.ts');
const { MouthCatch } = load('src/games/mouth-catch.ts');
const near = (actual, expected) =>
  assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const landmark = { x: 0.6, y: 0.25, z: 0 };
const hand = Array.from({ length: 21 }, () => ({ ...landmark }));
const pose = Array.from({ length: 33 }, () => ({ ...landmark }));
const face = Array.from({ length: 478 }, () => ({ ...landmark }));
function players() {
  return [
    {
      hands: [hand],
      pose: { pose, detected: true },
      face: { face, blend: { jawOpen: 0.9 }, detected: true },
      detected: true,
    },
    { hands: [], pose: null, face: { face: null, blend: {}, detected: false }, detected: false },
  ];
}
function surface(width, height) {
  const calls = [];
  const canvas = { width, height, clientWidth: width, clientHeight: height };
  const context = new Proxy(
    { canvas },
    {
      get(target, key) {
        return key in target ? target[key] : (...args) => calls.push([key, ...args]);
      },
    },
  );
  canvas.getContext = () => context;
  return { canvas, context, calls };
}

// Independent expectations: 16:9 has no crop; 16:10 scales by 5/3 and crops
// 320/3 px horizontally; portrait scales by 211/180 and crops 4997/9 px.
const cases = [
  [1280, 720, 1280, 720, 0, 512, 180],
  [1920, 1200, 6400 / 3, 1200, -320 / 3, 2240 / 3, 300],
  [390, 844, 13504 / 9, 844, -4997 / 9, 2023 / 45, 211],
];
for (const [width, height, dw, dh, ox, x, y] of cases) {
  const rect = getCoverRect(1280, 720, width, height);
  near(rect.drawWidth, dw);
  near(rect.drawHeight, dh);
  near(rect.offsetX, ox);
  near(rect.offsetY, 0);
  const point = toCanvasPoint(landmark, rect);
  near(point.x, x);
  near(point.y, y);
  const { canvas, context, calls } = surface(width, height);
  const video = { videoWidth: 1280, videoHeight: 720, readyState: 2, srcObject: {} };
  const camera = new CameraController(video, canvas);
  const frameRect = camera.draw();
  const image = calls.find((call) => call[0] === 'drawImage');
  near(image[2], ox);
  near(image[3], 0);
  near(image[4], dw);
  near(image[5], dh);
  assert.equal(calls.filter((call) => call[0] === 'scale').length, 1);
  for (const draw of [
    () => new PlayerTracker().drawLandmarks(canvas, players(), frameRect),
    () => new PoseTracker().draw(context, [{ pose, detected: true }], frameRect),
    () => new FaceTracker().draw(context, [players()[0].face], frameRect),
  ]) {
    calls.length = 0;
    draw();
    const points = calls.filter((call) => ['arc', 'moveTo', 'lineTo'].includes(call[0]));
    assert.ok(points.length);
    for (const [, px, py] of points) {
      near(px, x);
      near(py, y);
    }
  }

  // Exercise real game updates through GameManager using controlled targets.
  for (const Game of [IceBreaker, FruitSlice, MouthCatch]) {
    const game = new Game();
    game.start(width, height);
    game.beep = () => {};
    const ice = { x, y, size: 2, hits: 0, age: 0, owner: 0, lastHit: -Infinity };
    game.cubes = [ice];
    game.fruits = [{ x, y, radius: 2, vx: 0, vy: 0, owner: 0, age: 0, sliced: false, bomb: false }];
    game.foods = [
      { x, y: y + height * 0.07, size: 2, speed: 0, owner: 0, caught: false, kind: 'normal' },
    ];
    const manager = new GameManager([game]);
    manager.state = 'PLAYING';
    const update = game.update.bind(game);
    game.update = (dt, tracked, received) => {
      assert.equal(received, frameRect, 'Manager must forward the exact frame rect');
      update(dt, tracked, received);
    };
    manager.update(0, players(), width, height, frameRect);
    if (Game === IceBreaker) assert.equal(ice.hits, 1);
    else assert.equal(game.getScores()[0], 1);
  }
  console.log(`PASS ${width}x${height}: camera, landmarks, manager and three collisions`);
}

const { canvas } = surface(1280, 720);
const video = { videoWidth: 1280, videoHeight: 720, readyState: 2, srcObject: {} };
const camera = new CameraController(video, canvas);
const before = camera.draw();
canvas.clientWidth = 390;
canvas.clientHeight = 844;
camera.resize();
const after = camera.draw();
assert.notEqual(after, before);
assert.equal(canvas.width, 780);
assert.equal(canvas.height, 1688);
near(toCanvasPoint(landmark, after).x, 4046 / 45);
near(toCanvasPoint(landmark, after).y, 422);
assert.ok(toCanvasPoint({ x: 1, y: 0.5, z: 0 }, after).x < 0);
assert.ok(toCanvasPoint({ x: 0, y: 0.5, z: 0 }, after).x > canvas.width);
video.videoWidth = 0;
assert.equal(camera.draw(), null, 'Not-ready video must not produce a rect');
console.log('PASS resize, DPR=2, unclamped crop and zero video dimensions');

// Verify the render entry point forwards its camera rect to every consumer.
const main = fs.readFileSync(path.join(root, 'src/main.ts'), 'utf8');
for (const wiring of [
  'const rect = camera.draw()',
  'if (!rect)',
  'manager.update(dt, players, canvas.width, canvas.height, rect, modelReady)',
  'poseTracker.draw(context, poses, rect)',
  'faceTracker.draw(context, faces, rect)',
  'playerTracker.drawLandmarks(canvas, players, rect)',
])
  assert.ok(main.includes(wiring), `Missing frame wiring: ${wiring}`);
console.log('PASS render rect wiring');
