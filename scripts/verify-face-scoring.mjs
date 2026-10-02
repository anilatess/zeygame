// Run: node scripts/verify-face-scoring.mjs (uses the existing TypeScript dependency).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function load(relative) {
  const url = new URL(relative, import.meta.url);
  const source = fs.readFileSync(url, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, {
    exports, performance,
    require: () => load('../src/coordinate-mapper.ts'),
  });
  return exports;
}
const { FaceMimic, EXPRESSIONS, scoreExpression } = load('../src/games/face-mimic.ts');
const { FaceTracker } = load('../src/face-tracker.ts');
const zero = {
  jawOpen: 0, browInnerUp: 0, mouthSmileLeft: 0, mouthSmileRight: 0,
  eyeBlinkLeft: 0, eyeBlinkRight: 0, mouthPucker: 0,
};
function check(label, index, values, expected) {
  const result = scoreExpression({ ...zero, ...values }, EXPRESSIONS[index]);
  assert.equal(result.reliable, true);
  assert.ok(Math.abs(result.score - expected) < 1e-10, label);
  console.log(`${label}: ${result.score.toFixed(6)}`);
}
for (let i = 0; i < 4; i++) check(`Neutral target ${i + 1}`, i, {}, 0);
check('Smile', 0, { mouthSmileLeft: .9, mouthSmileRight: .9 }, 1);
check('Jaw only, smile target', 0, { jawOpen: .9 }, 0);
check('Left wink', 2, { eyeBlinkLeft: .9, eyeBlinkRight: .1 }, 1);
check('Right wink', 2, { eyeBlinkLeft: .1, eyeBlinkRight: .9 }, 1);
check('Both eyes closed', 2, { eyeBlinkLeft: .9, eyeBlinkRight: .9 }, 1 / 7);
check('Kiss', 3, { mouthPucker: .9, mouthSmileLeft: .1, mouthSmileRight: .1 }, 1);
check('Kiss with smile', 3, { mouthPucker: .9, mouthSmileLeft: .9, mouthSmileRight: .9 }, 1 / 7);
check('Surprise', 1, { jawOpen: .9, browInnerUp: .8, mouthSmileLeft: .1, mouthSmileRight: .1 }, 1);

let boundaryChecks = 0;
let invalidChecks = 0;
for (const expression of EXPRESSIONS) {
  for (const target of expression.alternatives) {
    const valid = Object.fromEntries(Object.entries(target).map(([key, [min, max]]) => [key, (min + max) / 2]));
    for (const [name, [min, max]] of Object.entries(target)) {
      for (const value of [min, max]) {
        const result = scoreExpression({ ...valid, [name]: value }, expression);
        assert.equal(result.reliable, true);
        assert.equal(result.score, 1);
        boundaryChecks++;
      }
      for (const value of [0, 1, min - 1e-6, min + 1e-6, max - 1e-6, max + 1e-6].filter(v => v >= 0 && v <= 1)) {
        const result = scoreExpression({ ...valid, [name]: value }, expression);
        assert.ok(Number.isFinite(result.score) && result.score >= 0 && result.score <= 1);
        boundaryChecks++;
      }
      for (const value of [undefined, NaN, Infinity, -Infinity, -.1, 1.1]) {
        const actual = { ...valid, [name]: value };
        if (value === undefined) delete actual[name];
        const result = scoreExpression(actual, expression);
        assert.equal(result.reliable, false);
        assert.equal(result.score, 0);
        invalidChecks++;
      }
    }
  }
}
console.log(`PASS ${boundaryChecks} boundary checks; ${invalidChecks} invalid/missing cases: score 0, skipped`);

// Exercise the real tracker with synthetic MediaPipe categories, without loading a model.
const tracker = new FaceTracker();
tracker.model = { detectForVideo: () => ({
  faceLandmarks: [[{ x: .75, y: .5, z: 0 }]],
  faceBlendshapes: [{ categories: Object.entries(zero).map(([categoryName, score]) => ({ categoryName, score })) }],
}) };
const tracked = tracker.detect({ videoWidth: 1280, currentTime: 1 });
for (const name of Object.keys(zero)) assert.equal(tracked[0].blend[name], 0);
console.log('PASS tracker forwards all seven required blendshape fields');

const best = [
  { ...zero, mouthSmileLeft: .9, mouthSmileRight: .9 },
  { ...zero, jawOpen: .9, browInnerUp: .8 },
  { ...zero, eyeBlinkLeft: .9, eyeBlinkRight: .1 },
  { ...zero, mouthPucker: .9 },
];
const game = new FaceMimic();
game.start(1280, 720);
const scores = [];
for (let frame = 0; frame < 96; frame++) {
  const round = Math.floor(frame / 24);
  game.update(.25, [
    { face: { detected: true, blend: best[round] } },
    { face: { detected: true, blend: zero } },
  ]);
  const first = game.getScores();
  assert.equal(game.getScores()[0], first[0], 'Reading scores must not add them again');
  assert.equal(first[1], 0);
  if (frame % 24 === 0 && frame > 0) scores.push(first[0]);
}
scores.push(game.getScores()[0]);
assert.deepEqual(scores, [10, 20, 30, 40]);
for (let i = 0; i < 10; i++) assert.equal(game.getScores()[0], 40);
console.log(`PASS round totals added once: ${scores.join(', ')} (24 seconds)`);

// Live percentage and final points must use the same weakest-condition score.
const partial = new FaceMimic();
partial.start(1280, 720);
partial.update(0, [{ face: { detected: true, blend: { mouthSmileLeft: .3, mouthSmileRight: .9 } } },
  { face: { detected: false, blend: {} } }]);
const labels = [];
partial.draw(new Proxy({}, { get: (_, key) => (...args) => { if (key === 'fillText') labels.push(args[0]); } }));
assert.ok(labels.some(label => label.includes('Oyuncu 1: 50%')));
partial.update(6, [{ face: { detected: true, blend: {} } }, { face: { detected: false, blend: {} } }]);
partial.update(0, [{ face: { detected: false, blend: {} } }, { face: { detected: false, blend: {} } }]);
assert.equal(partial.getScores()[0], 5);
console.log('PASS live indicator 50% -> round score 5; missing data does not replace the best score');
