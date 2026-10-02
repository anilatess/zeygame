// Run: node scripts/verify-game-selection.mjs. Real app flow with controlled media/models/time.
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
const actions = [
  'start',
  'select',
  'games',
  'howto',
  'retry',
  'home',
  'replay',
  'choose-another',
  'back',
  'update',
];
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
const video = {
  videoWidth: 1280,
  videoHeight: 720,
  readyState: 4,
  currentTime: 0,
  srcObject: null,
  async play() {},
};
canvas.clientWidth = 1280;
canvas.clientHeight = 720;
let selectedButtons = [];
let cameraCalls = 0,
  cameraStops = 0,
  audioUnlocks = 0,
  audioStops = 0;
let cameraPending = null,
  regions = [0.75],
  unreliable = false,
  missingPoint = null;
const closedModels = { hands: 0, pose: 0, face: 0 };
const rect = { drawWidth: 1280, drawHeight: 720, offsetX: 0, offsetY: 0 };

function query(selector) {
  if (selector === 'canvas') return canvas;
  if (selector === 'video') return video;
  const action = selector.match(/data-action="(.*?)"/);
  if (action) return buttons[action[1]];
  const selected = selector.match(/data-game-index="(.*?)"/);
  if (selected) return selectedButtons[Number(selected[1])];
  if (!elements.has(selector)) elements.set(selector, element());
  return elements.get(selector);
}

const content = query('.info-content');
Object.defineProperty(content, 'innerHTML', {
  get() {
    return this.markup || '';
  },
  set(value) {
    this.markup = value;
    selectedButtons = [...value.matchAll(/data-game-index="(\d+)"/g)].map((match) => {
      const button = element();
      button.dataset = { action: 'play-selected', gameIndex: match[1] };
      return button;
    });
  },
});
content.querySelectorAll = () => selectedButtons;
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

function handResult() {
  return { landmarks: regions.map((x) => Array.from({ length: 21 }, () => ({ x, y: 0.5, z: 0 }))) };
}
function poseResult() {
  return {
    landmarks: regions.map((x) =>
      Array.from({ length: 33 }, (_, i) =>
        i === missingPoint
          ? { x, y: 0.5, z: 0 }
          : { x, y: 0.5, z: 0, visibility: unreliable ? 0.2 : 0.95, presence: 0.95 },
      ),
    ),
  };
}
function faceResult() {
  return {
    faceLandmarks: regions.map((x) => Array.from({ length: 478 }, () => ({ x, y: 0.5, z: 0 }))),
    faceBlendshapes: regions.map(() => ({ categories: [] })),
  };
}

function fakeModel(type) {
  return {
    close() {
      closedModels[type]++;
    },
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
    navigator: {
      mediaDevices: {
        getUserMedia() {
          cameraCalls++;
          return (
            cameraPending?.promise ??
            Promise.resolve({
              getTracks: () => [
                {
                  stop() {
                    cameraStops++;
                  },
                },
              ],
            })
          );
        },
      },
    },
    HTMLMediaElement: { HAVE_METADATA: 1, HAVE_CURRENT_DATA: 2 },
    DOMException,
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

override('audio', {
  audio: {
    unlock() {
      audioUnlocks++;
    },
    stopAll() {
      audioStops++;
    },
    tone() {},
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
      this.starts = [];
      games.forEach((game, index) => {
        const start = game.start.bind(game);
        game.start = (...args) => {
          this.starts.push(index);
          start(...args);
        };
      });
    }
  },
});

appLoad('../src/main.ts');

async function click(action) {
  await buttons[action].handlers.click();
  await flush();
}

async function frame(advance = true) {
  now += 100;
  if (advance) video.currentTime += 0.1;
  const callbacks = [...frames.values()];
  frames.clear();
  callbacks.forEach((callback) => callback());
  await flush();
}

function readyRequest(type) {
  pending[type].at(-1).resolve(fakeModel(type));
  return flush();
}

async function select(index) {
  await click('select');
  assert.equal(selectedButtons.length, 8);
  await selectedButtons[index].handlers.click();
  await flush();
}
async function until(state, max = 400) {
  for (let i = 0; i < max && appManager.getState() !== state; i++) await frame();
  assert.equal(appManager.getState(), state);
}
await click('select');
assert.equal(cameraCalls, 0, 'Selection never requests camera');
assert.equal(audioUnlocks, 0, 'Selection never starts audio');
const catalog = appManager.getGames();
assert.equal(selectedButtons.length, catalog.length);
for (const game of catalog) {
  assert.ok(content.innerHTML.includes('<h3>' + game.name + '</h3>'));
  assert.ok(content.innerHTML.includes(game.description.split(/(?<=\.)\s/)[0]));
  const labels = { hands: 'El', pose: 'V\u00fccut', face: 'Y\u00fcz' };
  assert.ok(
    content.innerHTML.includes(
      'tracking-label">' + labels[game.needs ?? game.tracking] + '</span>',
    ),
  );
}
assert.equal((content.innerHTML.match(/tracking-label/g) || []).length, 8);
assert.equal((content.innerHTML.match(/>Bu Oyunu Oyna<\/button>/g) || []).length, 8);
await click('back');
assert.equal(buttons.select.focused, true, 'Back restores selection trigger focus');

for (let index = 0; index < catalog.length; index++) {
  const expected = catalog[index].needs ?? catalog[index].tracking;
  regions = [0.75];
  unreliable = false;
  missingPoint = null;
  const beforeLoads = Object.fromEntries(
    Object.entries(pending).map(([type, list]) => [type, list.length]),
  );
  const beforeCamera = cameraCalls;
  appManager.starts = [];
  await select(index);
  await selectedButtons[index].handlers.click();
  await selectedButtons[(index + 1) % 8].handlers.click();
  assert.equal(
    cameraCalls,
    beforeCamera + 1,
    'Repeated and other-card clicks start only one session',
  );
  assert.equal(appManager.getSession().mode, 'single');
  assert.equal(appManager.getSession().games.length, 1);
  assert.equal(appManager.getCurrentGame(), catalog[index]);
  assert.equal(appManager.getState(), 'CALIBRATION');
  for (let i = 0; i < 40; i++) await frame();
  assert.equal(appManager.getState(), 'CALIBRATION', 'Model load gates calibration/countdown');
  for (const type of ['hands', 'pose', 'face'])
    assert.equal(
      pending[type].length - beforeLoads[type],
      type === expected ? 1 : 0,
      gameMessage(index, type),
    );
  await readyRequest(expected);
  await frame();
  assert.equal(appManager.getState(), 'CALIBRATION', 'One left region is insufficient');
  regions = [0.75, 0.75];
  await frame();
  assert.equal(
    appManager.getState(),
    'CALIBRATION',
    'Two detections in one region do not prepare both players',
  );
  regions = [0.25];
  await frame();
  assert.equal(appManager.getState(), 'CALIBRATION', 'One right region is insufficient');
  regions = [];
  await frame();
  assert.equal(appManager.getState(), 'CALIBRATION', 'Missing regions cannot pass');
  regions = [0.75, 0.25];
  if (expected === 'pose') {
    unreliable = true;
    await frame();
    assert.equal(appManager.getState(), 'CALIBRATION', 'Unreliable body points cannot pass');
    unreliable = false;
    missingPoint = catalog[index].calibrationLandmarks[0];
    await frame();
    assert.equal(
      appManager.getState(),
      'CALIBRATION',
      'Required joint confidence missing cannot pass',
    );
    missingPoint = null;
  }
  await frame();
  assert.equal(appManager.getState(), 'COUNTDOWN', 'Both appropriate regions pass');
  await until('PLAYING');
  assert.deepEqual([...appManager.getLiveScores()], [0, 0], 'Game start resets scores');
  assert.deepEqual([...appManager.starts], [index]);
  await until('RESULT');
  const scores = [...appManager.getScores()];
  await until('FINAL');
  for (let i = 0; i < 70; i++) await frame();
  assert.deepEqual([...appManager.starts], [index], 'Single game cannot advance to another game');
  assert.equal(query('[data-ui="result-title"]').textContent, catalog[index].name);
  assert.equal(query('[data-ui="result-one"]').textContent, String(scores[0]));
  assert.equal(query('[data-ui="result-two"]').textContent, String(scores[1]));
  assert.equal(query('[data-ui="next"]').hidden, true, 'No next game or party total prompt');
  assert.equal(buttons['choose-another'].hidden, false);
  if (index === 2) {
    // Controlled result values test single-game presentation independently of party totals.
    appManager.lastScores = [7, 11];
    appManager.totals = [999, 888];
    await frame();
    assert.equal(query('[data-ui="result-one"]').textContent, '7');
    assert.equal(query('[data-ui="result-two"]').textContent, '11');
    assert.ok(query('[data-ui="winner"]').textContent.includes('Oyuncu 2'));
    appManager.lastScores = [11, 11];
    await frame();
    assert.ok(query('[data-ui="winner"]').textContent.includes('Berabere'));
  }
  await click('replay');
  assert.equal(appManager.getState(), 'CALIBRATION');
  assert.equal(appManager.getCurrentGame(), catalog[index]);
  assert.deepEqual([...appManager.getScores()], [0, 0]);
  assert.deepEqual([...appManager.getTotals()], [0, 0]);
  await until('PLAYING');
  assert.deepEqual([...appManager.getLiveScores()], [0, 0]);
  assert.deepEqual([...appManager.starts], [index, index]);
  const beforeStop = cameraStops;
  await click(index % 2 ? 'home' : 'choose-another');
  assert.equal(cameraStops, beforeStop + 1, 'Exit closes media tracks');
  assert.equal(frames.size, 0, 'Exit cancels rendering');
  assert.equal(video.srcObject, null);
  assert.ok(
    Object.values(tracks).every((track) => track.state === 'idle'),
    'Exit resets detection/model resources',
  );
  assert.equal(query('.game').hidden, true);
  if (index % 2 === 0) {
    assert.equal(query('.info-panel').hidden, false);
    assert.equal(selectedButtons[index].focused, true);
    await click('back');
  }
}
function gameMessage(index, type) {
  return (
    catalog[index].name +
    ' loads only ' +
    (catalog[index].needs ?? catalog[index].tracking) +
    ', checking ' +
    type
  );
}
await click('start');
assert.equal(appManager.getSession().mode, 'party');
assert.equal(appManager.getSession().games.length, 8);
assert.deepEqual([...appManager.getSession().games], [...catalog]);
await click('home');

// Real loading, error, explicit retry and stale model completion paths.
await select(2);
pending.face.at(-1).reject(new Error('offline'));
await flush();
await frame();
assert.equal(tracks.face.state, 'failed');
assert.equal(buttons.retry.hidden, false);
assert.equal(appManager.getState(), 'CALIBRATION');
await click('retry');
assert.equal(tracks.face.state, 'loading');
await readyRequest('face');
await frame();
assert.equal(appManager.getState(), 'COUNTDOWN');
await click('home');
await select(1);
const late = pending.pose.at(-1);
const beforeClosed = closedModels.pose;
await click('home');
late.resolve(fakeModel('pose'));
await flush();
assert.equal(closedModels.pose, beforeClosed + 1);
assert.equal(tracks.pose.state, 'idle');
assert.equal(frames.size, 0);

// Camera errors remain visible and re-enable the selected start button.
cameraPending = deferred();
await select(0);
cameraPending.reject(new DOMException('denied', 'NotAllowedError'));
await flush();
assert.equal(selectedButtons[0].disabled, false);
assert.ok(query('.selection-status').textContent.length > 0);
assert.equal(appManager.getState(), 'MENU');
assert.equal(frames.size, 0);
cameraPending = null;
await click('back');

// Leaving pending permission must not interrupt a newer live session.
cameraPending = deferred();
const oldRequest = cameraPending;
await select(0);
await selectedButtons[1].handlers.click();
assert.equal(appManager.getCurrentGame(), catalog[0]);
await click('back');
cameraPending = null;
await select(7);
const currentStream = video.srcObject;
const lateStreamStop = cameraStops;
oldRequest.resolve({
  getTracks: () => [
    {
      stop() {
        cameraStops++;
      },
    },
  ],
});
await flush();
assert.equal(cameraStops, lateStreamStop + 1, 'Late camera stream closes');
assert.equal(video.srcObject, currentStream, 'Late start cannot replace the new camera');
assert.equal(appManager.getCurrentGame(), catalog[7]);
await click('home');

// Camera metadata waiting also releases its listener and stream on stop.
const events = new Map();
const metadataVideo = {
  readyState: 0,
  srcObject: null,
  addEventListener(name, handler) {
    events.set(name, handler);
  },
  removeEventListener(name) {
    events.delete(name);
  },
  async play() {
    throw new Error('Stopped metadata must never play');
  },
};
const ActualCamera = appLoad('../src/camera.ts').CameraController;
const metadataCamera = new ActualCamera(metadataVideo, canvas);
const startingCamera = metadataCamera.start();
await flush();
assert.equal(events.size, 1);
const beforeMetadataStop = cameraStops;
metadataCamera.stop();
await startingCamera;
assert.equal(events.size, 0);
assert.equal(cameraStops, beforeMetadataStop + 1);
assert.equal(metadataVideo.srcObject, null);
assert.ok(audioUnlocks > 0 && audioStops > 0);
assert.throws(() => appManager.startSingle(-1));
assert.throws(() => appManager.startSingle(8));
console.log(
  'PASS selection: real main/camera/manager/trackers, eight metadata cards, single-model readiness, click guard, final, replay, safe exits, party restoration, retry and stale loads',
);
