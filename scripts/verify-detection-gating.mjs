// Run: node scripts/verify-detection-gating.mjs. No real camera or network.
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

const load = runtime();
const fixtures = {
  hands: { result: { landmarks: [[{ x: 0.2, y: 0.3, z: 0 }]] }, className: 'HandTracker' },
  pose: { result: { landmarks: [[{ x: 0.2, y: 0.3, z: 0 }]] }, className: 'PoseTracker' },
  face: {
    result: { faceLandmarks: [[{ x: 0.2, y: 0.3, z: 0 }]], faceBlendshapes: [] },
    className: 'FaceTracker',
  },
};

for (const [type, fixture] of Object.entries(fixtures)) {
  let calls = 0;
  const model = {
    detectForVideo() {
      calls++;
      return fixture.result;
    },
    close() {},
  };
  const Tracker = load(`../src/${type === 'hands' ? 'hand' : type}-tracker.ts`)[fixture.className];
  const tracker = new Tracker(async () => model);
  await tracker.load();
  const video = { videoWidth: 1280, currentTime: 1 };
  tracker.detect(video);
  tracker.detect(video);
  assert.equal(calls, 1, `${type} inference is cached for the same video frame`);
  video.currentTime = 2;
  tracker.detect(video);
  assert.equal(calls, 2, `${type} inference advances with video time`);
  tracker.clearDetections();
  tracker.detect(video);
  assert.equal(calls, 3, `${type} clear invalidates the frame cache`);
  tracker.close();
}

const source = fs.readFileSync(new URL('../src/game-controller.ts', import.meta.url), 'utf8');
for (const type of ['hands', 'pose', 'face']) {
  assert.match(source, new RegExp(`activeType === '${type}'`));
  assert.match(source, new RegExp(`type !== '${type}'`));
}
assert.match(source, /needsModel && modelReady \? type : null/);
assert.match(source, /clearDetectionsExcept\(activeType\)/);
assert.match(source, /manager\.update\([\s\S]*modelReady/);

console.log(
  'PASS detection gating: one active MediaPipe model, same-frame cache and stale detection clears',
);
