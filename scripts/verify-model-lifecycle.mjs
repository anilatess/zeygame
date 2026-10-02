// Run: node scripts/verify-model-lifecycle.mjs. No real camera, network or timers.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function runtime(globals = {}, overrides = new Map()) {
  const cache = new Map();
  function load(relative) {
    const url = new URL(relative, import.meta.url);
    if (overrides.has(url.href)) return overrides.get(url.href);
    if (cache.has(url.href)) return cache.get(url.href);
    if (url.pathname.endsWith('.css')) return {};
    const exports = {};
    cache.set(url.href, exports);
    const source = fs
      .readFileSync(url, 'utf8')
      .replaceAll('import.meta.env.PROD', 'false')
      .replaceAll('import.meta.env.BASE_URL', "'/zeygame/'");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    vm.runInNewContext(
      outputText,
      {
        exports,
        performance,
        require: (specifier) =>
          load(new URL(specifier + (specifier.endsWith('.css') ? '' : '.ts'), url).href),
        ...globals,
      },
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
  for (let i = 0; i < 12; i++) await Promise.resolve();
};
function fakeModel() {
  return {
    closes: 0,
    close() {
      this.closes++;
    },
    detectForVideo() {
      return { landmarks: [], faceLandmarks: [] };
    },
  };
}
const load = runtime();
for (const [file, name] of [
  ['hand', 'HandTracker'],
  ['pose', 'PoseTracker'],
  ['face', 'FaceTracker'],
]) {
  const Tracker = load(`../src/${file}-tracker.ts`)[name];
  let calls = 0;
  const requests = [];
  const tracker = new Tracker(() => {
    calls++;
    const d = deferred();
    requests.push(d);
    return d.promise;
  });
  assert.equal(tracker.state, 'idle');
  await tracker.retry();
  assert.equal(calls, 0, 'Retry only starts failed loads');
  const first = tracker.load();
  for (let i = 0; i < 100; i++) assert.equal(tracker.load(), first);
  await flush();
  assert.equal(calls, 1);
  assert.equal(tracker.state, 'loading');
  requests[0].reject(new Error('offline'));
  await first;
  assert.equal(tracker.state, 'failed');
  for (let i = 0; i < 100; i++) await tracker.load();
  assert.equal(calls, 1);
  const retry = tracker.retry();
  for (let i = 0; i < 100; i++) assert.equal(tracker.retry(), retry);
  await flush();
  assert.equal(calls, 2);
  const ready = fakeModel();
  requests[1].resolve(ready);
  await retry;
  assert.equal(tracker.state, 'ready');
  await tracker.load();
  assert.equal(calls, 2);
  tracker.close();
  tracker.close();
  assert.equal(ready.closes, 1);

  const old = tracker.load();
  await flush();
  tracker.close();
  const current = tracker.load();
  await flush();
  const obsolete = fakeModel();
  requests[2].resolve(obsolete);
  await old;
  assert.equal(obsolete.closes, 1);
  assert.equal(tracker.state, 'loading');
  assert.equal(tracker.load(), current);
  const fresh = fakeModel();
  requests[3].resolve(fresh);
  await current;
  assert.equal(tracker.state, 'ready');
  tracker.close();
  assert.equal(fresh.closes, 1);

  const oldFailure = tracker.load();
  await flush();
  tracker.close();
  const newLoad = tracker.load();
  await flush();
  const newer = fakeModel();
  requests[5].resolve(newer);
  await newLoad;
  requests[4].reject(new Error('late failure'));
  await oldFailure;
  assert.equal(tracker.state, 'ready');
  tracker.close();
  assert.equal(newer.closes, 1);
  console.log(`PASS ${file}: shared load, failure latch, retry, stale success/error, close once`);
}

const { GameManager } = load('../src/game-manager.ts');
const miniGame = {
  tracking: 'hands',
  name: 'test',
  description: '',
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
for (let i = 0; i < 100; i++) tick(1, false);
assert.equal(manager.getCountdown(), 2);
tick(100, true);
assert.equal(manager.getCountdown(), 2);
tick(2, true);
assert.equal(manager.getState(), 'PLAYING');
tick(1, true);
assert.equal(manager.getRemainingTime(), 19);
for (let i = 0; i < 100; i++) tick(1, false);
tick(100, true);
assert.equal(manager.getRemainingTime(), 19);
tick(1, true);
assert.equal(manager.getRemainingTime(), 18);
console.log('PASS calibration/countdown/game pause and resume without delta catch-up');

// Run the real main.ts event handlers and render loop against a small fake DOM/camera.
const elements = new Map();
function element() {
  return {
    hidden: false,
    disabled: false,
    textContent: '',
    dataset: {},
    handlers: {},
    focus() {
      this.focused = true;
    },
    addEventListener(event, handler) {
      this.handlers[event] = handler;
    },
  };
}
const actions = ['start', 'games', 'howto', 'retry', 'home', 'replay'];
const buttons = Object.fromEntries(
  actions.map((action) => {
    const node = element();
    node.dataset.action = action;
    return [action, node];
  }),
);
const context = new Proxy({}, { get: (obj, key) => obj[key] ?? (() => {}) });
const canvas = { width: 1280, height: 720, getContext: () => context };
context.canvas = canvas;
const video = { videoWidth: 1280, currentTime: 0 };
function query(selector) {
  if (selector === 'canvas') return canvas;
  if (selector === 'video') return video;
  const action = selector.match(/data-action="(.*?)"/);
  if (action) return buttons[action[1]];
  if (!elements.has(selector)) elements.set(selector, element());
  return elements.get(selector);
}
const app = { innerHTML: '', querySelector: query, querySelectorAll: () => Object.values(buttons) };
let now = 0,
  nextFrame = 0,
  cameraDraws = 0,
  cameraStops = 0;
const frames = new Map();
const overrides = new Map();
const tracks = {},
  pending = { hands: [], pose: [], face: [] };
let appManager;
const appLoad = runtime(
  {
    document: { querySelector: () => app },
    window: { addEventListener() {} },
    navigator: {},
    performance: { now: () => now },
    requestAnimationFrame: (cb) => {
      frames.set(++nextFrame, cb);
      return nextFrame;
    },
    cancelAnimationFrame: (id) => frames.delete(id),
  },
  overrides,
);
const override = (file, exports) =>
  overrides.set(new URL(`../src/${file}.ts`, import.meta.url).href, exports);
override('camera', {
  CameraController: class {
    async start() {}
    resize() {}
    stop() {
      cameraStops++;
    }
    draw() {
      cameraDraws++;
      return rect;
    }
  },
});
for (const [file, name, key] of [
  ['hand', 'HandTracker', 'hands'],
  ['pose', 'PoseTracker', 'pose'],
  ['face', 'FaceTracker', 'face'],
]) {
  const Real = appLoad(`../src/${file}-tracker.ts`)[name];
  override(`${file}-tracker`, {
    [name]: class extends Real {
      constructor() {
        super(() => {
          const d = deferred();
          pending[key].push(d);
          return d.promise;
        });
        tracks[key] = this;
      }
    },
  });
}
const RealManager = appLoad('../src/game-manager.ts').GameManager;
override('game-manager', {
  GameManager: class extends RealManager {
    constructor(games) {
      super(games);
      appManager = this;
    }
  },
});
appLoad('../src/main.ts');
const click = async (action) => {
  await buttons[action].handlers.click();
  await flush();
};
const frame = async () => {
  now += 16;
  video.currentTime += 0.016;
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((cb) => cb());
  await flush();
};
await click('start');
assert.equal(tracks.hands.state, 'loading');
assert.equal(query('.game').hidden, false);
await frame();
await frame();
assert.ok(cameraDraws >= 3);
assert.equal(appManager.getState(), 'CALIBRATION');
pending.hands[0].reject(new Error('offline'));
await flush();
await frame();
assert.equal(buttons.retry.hidden, false);
assert.ok(query('.model-message p').textContent.includes('yüklenemedi'));
for (let i = 0; i < 100; i++) await frame();
assert.equal(pending.hands.length, 1);
await click('retry');
await click('retry');
assert.equal(pending.hands.length, 2);
await click('home');
assert.equal(cameraStops, 1);
assert.equal(frames.size, 0);
assert.equal(query('.game').hidden, true);
assert.equal(buttons.start.focused, true, 'Home restores focus to the enabled start button');
assert.equal(tracks.hands.state, 'idle');
await click('start');
assert.equal(pending.hands.length, 3);
const stale = fakeModel();
pending.hands[1].resolve(stale);
await flush();
assert.equal(stale.closes, 1);
assert.equal(tracks.hands.state, 'loading');
pending.hands[2].resolve(fakeModel());
await flush();
await frame();
assert.equal(tracks.hands.state, 'ready');
assert.equal(query('.model-message').hidden, true);
// Force the actual manager to the pose countdown to test active-model gating in main.
appManager.index = 1;
appManager.state = 'COUNTDOWN';
appManager.countdown = 3;
await frame();
assert.equal(tracks.pose.state, 'loading');
for (let i = 0; i < 100; i++) await frame();
assert.equal(appManager.getCountdown(), 3);
await click('home');
await click('start');
pending.pose[0].reject(new Error('old session'));
await flush();
assert.equal(tracks.pose.state, 'idle');
assert.equal(tracks.hands.state, 'loading');
await click('home');
const late = fakeModel();
pending.hands[3].resolve(late);
await flush();
assert.equal(late.closes, 1);
assert.equal(query('.game').hidden, true);
assert.equal(frames.size, 0);
console.log(
  'PASS real main.ts: live camera while loading, retry UI, frame gating, home, restart, stale completion/error',
);
