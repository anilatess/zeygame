// Run: node scripts/verify-detection-gating.mjs. No real camera, network or timers.
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

function element() {
  return {
    hidden: false,
    disabled: false,
    textContent: '',
    dataset: {},
    handlers: {},
    querySelectorAll() {
      return [];
    },
    focus() {
      this.focused = true;
    },
    addEventListener(event, handler) {
      this.handlers[event] = handler;
    },
  };
}

const elements = new Map();
const actions = ['start', 'select', 'games', 'howto', 'retry', 'home', 'replay', 'choose-another'];
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
const rect = { drawWidth: 1280, drawHeight: 720, offsetX: 0, offsetY: 0 };

function query(selector) {
  if (selector === 'canvas') return canvas;
  if (selector === 'video') return video;
  const action = selector.match(/data-action="(.*?)"/);
  if (action) return buttons[action[1]];
  if (!elements.has(selector)) elements.set(selector, element());
  return elements.get(selector);
}

const app = { innerHTML: '', querySelector: query, querySelectorAll: () => Object.values(buttons) };
const frames = new Map();
const overrides = new Map();
const pending = { hands: [], pose: [], face: [] };
const detectCalls = { hands: 0, pose: 0, face: 0 };
const clearCalls = { hands: 0, pose: 0, face: 0 };
const tracks = {};
let now = 0;
let nextFrame = 0;
let appManager;
let bothRegions = false;

function handResult() {
  const hand = Array.from({ length: 21 }, () => ({
    x: 0.75,
    y: 0.5,
    z: 0,
    visibility: 0.95,
    presence: 0.95,
  }));
  return { landmarks: bothRegions ? [hand, hand.map((point) => ({ ...point, x: 0.25 }))] : [hand] };
}

function poseResult() {
  const pose = Array.from({ length: 33 }, () => ({
    x: 0.75,
    y: 0.5,
    z: 0,
    visibility: 0.95,
    presence: 0.95,
  }));
  pose[11] = { x: 0.75, y: 0.3, z: 0, visibility: 0.95, presence: 0.95 };
  pose[23] = { x: 0.75, y: 0.5, z: 0, visibility: 0.95, presence: 0.95 };
  return { landmarks: bothRegions ? [pose, pose.map((point) => ({ ...point, x: 0.25 }))] : [pose] };
}

function faceResult() {
  const face = Array.from({ length: 16 }, () => ({
    x: 0.75,
    y: 0.5,
    z: 0,
    visibility: 0.95,
    presence: 0.95,
  }));
  return {
    faceLandmarks: bothRegions ? [face, face.map((point) => ({ ...point, x: 0.25 }))] : [face],
    faceBlendshapes: [{ categories: [] }],
  };
}

function fakeModel(type) {
  return {
    close() {},
    detectForVideo() {
      detectCalls[type]++;
      if (type === 'hands') return handResult();
      if (type === 'pose') return poseResult();
      return faceResult();
    },
  };
}

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
    stop() {}
    draw() {
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
          const request = deferred();
          pending[key].push(request);
          return request.promise;
        });
        tracks[key] = this;
      }

      clearDetections() {
        clearCalls[key]++;
        super.clearDetections();
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

async function click(action) {
  await buttons[action].handlers.click();
  await flush();
}

async function frame(advance = true) {
  now += 16;
  if (advance) video.currentTime += 0.016;
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback());
  await flush();
}

function resetCounts() {
  detectCalls.hands = 0;
  detectCalls.pose = 0;
  detectCalls.face = 0;
}

function snapshotCounts() {
  return { ...detectCalls };
}

function countDelta(before, type) {
  return detectCalls[type] - before[type];
}

function readyRequest(type) {
  pending[type].at(-1).resolve(fakeModel(type));
  return flush();
}

function forceState(state, index = 0) {
  appManager.state = state;
  appManager.index = index;
  appManager.countdown = 3;
  appManager.elapsed = 0;
  appManager.resultTime = 0;
}

await click('start');
assert.equal(pending.hands.length, 1, 'Calibration starts the hand model load');
await frame();
assert.deepEqual(detectCalls, { hands: 0, pose: 0, face: 0 }, 'Loading model is not detected');
await readyRequest('hands');
await frame();
assert.equal(detectCalls.hands, 1, 'Calibration detects hands when ready');
await frame(false);
assert.equal(detectCalls.hands, 1, 'Same video frame is not processed twice');
await frame();
assert.equal(detectCalls.hands, 2, 'New frame is processed by active hand tracker');

const games = appManager.getGames();
for (let index = 0; index < games.length; index++) {
  const expected = appManager.games[index].needs ?? appManager.games[index].tracking;
  bothRegions = false;
  forceState('CALIBRATION', index);
  resetCounts();
  await frame();
  if (tracks[expected].state === 'loading') {
    assert.equal(appManager.getState(), 'CALIBRATION', 'Loading cannot finish preparation');
    await readyRequest(expected);
  }
  await frame();
  assert.equal(appManager.getState(), 'CALIBRATION', games[index].name + ' needs both regions');
  assert.ok(detectCalls[expected] > 0, games[index].name + ' calibration uses metadata model');
  for (const type of ['hands', 'pose', 'face'].filter((type) => type !== expected))
    assert.equal(detectCalls[type], 0, games[index].name + ' preparation does not use ' + type);
  bothRegions = true;
  await frame();
  assert.equal(
    appManager.getState(),
    'COUNTDOWN',
    games[index].name + ' appropriate data permits countdown',
  );
  forceState('COUNTDOWN', index);
  resetCounts();
  await frame();
  if (tracks[expected].state === 'loading') await readyRequest(expected);
  const beforeCountdown = snapshotCounts();
  await frame();
  assert.ok(
    countDelta(beforeCountdown, expected) > 0,
    `${games[index].name} countdown uses ${expected}`,
  );
  for (const type of ['hands', 'pose', 'face'].filter((item) => item !== expected)) {
    assert.equal(detectCalls[type], 0, `${games[index].name} countdown does not use ${type}`);
  }

  forceState('PLAYING', index);
  resetCounts();
  const beforePlaying = snapshotCounts();
  await frame();
  assert.ok(
    countDelta(beforePlaying, expected) > 0,
    `${games[index].name} playing uses ${expected}`,
  );
  for (const type of ['hands', 'pose', 'face'].filter((item) => item !== expected)) {
    assert.equal(detectCalls[type], 0, `${games[index].name} playing does not use ${type}`);
  }
}

for (const state of ['MENU', 'RESULT', 'FINAL']) {
  forceState(state, 0);
  resetCounts();
  await frame();
  assert.deepEqual(detectCalls, { hands: 0, pose: 0, face: 0 }, `${state} does not detect`);
}
assert.equal(query('#result-title').focused, true, 'Final focuses the result title');

forceState('PLAYING', 0);
tracks.hands.close();
resetCounts();
await frame();
assert.equal(tracks.hands.state, 'loading');
assert.deepEqual(
  detectCalls,
  { hands: 0, pose: 0, face: 0 },
  'Fresh loading tracker does not detect',
);
pending.hands.at(-1).reject(new Error('offline'));
await flush();
await frame();
assert.equal(tracks.hands.state, 'failed');
assert.deepEqual(detectCalls, { hands: 0, pose: 0, face: 0 }, 'Failed tracker does not detect');

await click('home');
await click('start');
resetCounts();
await readyRequest('hands');
await frame();
assert.equal(detectCalls.hands, 1, 'New session first ready frame is detected');
assert.ok(clearCalls.hands > 0 && clearCalls.pose > 0 && clearCalls.face > 0);

console.log('PASS detection gating: active metadata model only, same-frame cache, stale clears');
