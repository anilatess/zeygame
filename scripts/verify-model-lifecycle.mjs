// Run: node scripts/verify-model-lifecycle.mjs. No real camera, network or timers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function runtime() {
  const cache = new Map();
  function load(relative) {
    const url = new URL(relative, import.meta.url);
    if (cache.has(url.href)) return cache.get(url.href);
    const exports = {};
    cache.set(url.href, exports);
    const { outputText } = ts.transpileModule(fs.readFileSync(url, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    vm.runInNewContext(
      outputText,
      { exports, performance, require: (specifier) => load(new URL(`${specifier}.ts`, url).href) },
      { filename: url.pathname },
    );
    return exports;
  }
  return load;
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const flush = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve();
};
const fakeModel = () => ({
  closes: 0,
  close() {
    this.closes++;
  },
  detectForVideo() {
    return { landmarks: [], faceLandmarks: [] };
  },
});
const load = runtime();

for (const [file, name] of [
  ['hand', 'HandTracker'],
  ['pose', 'PoseTracker'],
  ['face', 'FaceTracker'],
]) {
  const Tracker = load(`../src/${file}-tracker.ts`)[name];
  const requests = [];
  let calls = 0;
  const tracker = new Tracker(() => {
    calls++;
    const request = deferred();
    requests.push(request);
    return request.promise;
  });
  const first = tracker.load();
  assert.equal(tracker.load(), first);
  await flush();
  assert.equal(calls, 1);
  requests[0].reject(new Error('offline'));
  await first;
  assert.equal(tracker.state, 'failed');
  const retry = tracker.retry();
  await flush();
  const ready = fakeModel();
  requests[1].resolve(ready);
  await retry;
  assert.equal(tracker.state, 'ready');
  tracker.close();
  tracker.close();
  assert.equal(ready.closes, 1);

  const staleLoad = tracker.load();
  await flush();
  tracker.close();
  const stale = fakeModel();
  requests[2].resolve(stale);
  await staleLoad;
  assert.equal(stale.closes, 1, `${file} disposes stale model completion`);
  assert.equal(tracker.state, 'idle');
}

const { GameManager } = load('../src/game-manager.ts');
const miniGame = {
  name: 'test',
  description: '',
  tracking: 'hands',
  start() {},
  update() {},
  draw() {},
  getScores: () => [0, 0],
};
const manager = new GameManager([miniGame]);
const players = [{ detected: true }, { detected: true }];
const rect = { drawWidth: 1280, drawHeight: 720, offsetX: 0, offsetY: 0 };
const tick = (dt, ready) => manager.update(dt, players, 1280, 720, rect, ready);
manager.enterCalibration();
tick(100, false);
assert.equal(manager.getState(), 'CALIBRATION');
tick(100, true);
assert.equal(manager.getState(), 'COUNTDOWN');
tick(1, true);
assert.equal(manager.getCountdown(), 2);
for (let i = 0; i < 20; i++) tick(1, false);
tick(100, true);
assert.equal(manager.getCountdown(), 2, 'model resume discards accumulated delta');
tick(2, true);
assert.equal(manager.getState(), 'PLAYING');

const controller = fs.readFileSync(new URL('../src/game-controller.ts', import.meta.url), 'utf8');
assert.match(controller, /if \(needsModel && tracker\.state === 'idle'\) void tracker\.load\(\)/);
assert.match(controller, /this\.handTracker\.close\(\)/);
assert.match(controller, /this\.poseTracker\.close\(\)/);
assert.match(controller, /this\.faceTracker\.close\(\)/);
assert.match(controller, /cancelAnimationFrame\(this\.frame\)/);
assert.match(
  controller,
  /if \(generation !== this\.generation\) \{[\s\S]*this\.camera\.stop\(\)[\s\S]*return false/,
  'a cancelled camera start releases a stream that resolves late',
);

const host = fs.readFileSync(new URL('../src/components/GameHost.tsx', import.meta.url), 'utf8');
assert.match(host, /addEventListener\('beforeunload', stop\)/);
assert.match(host, /removeEventListener\('beforeunload', stop\)/);

console.log(
  'PASS model lifecycle: shared load, retry, stale disposal, close once, manager pause/resume, cancellation and controller cleanup',
);
