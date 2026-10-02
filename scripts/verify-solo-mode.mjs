// Run: node scripts/verify-solo-mode.mjs. No camera, browser or network required.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

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
    {
      exports,
      performance,
      require: (specifier) => load(new URL(`${specifier}.ts`, url).href),
    },
    { filename: url.pathname },
  );
  return exports;
}

const emptyFace = () => ({ face: null, blend: {}, detected: false });
const empty = () => ({ hands: [], pose: null, face: emptyFace(), detected: false });
const landmark = (x = 0.2, y = 0.3) => ({ x, y, z: 0, visibility: 1, presence: 1 });
const hand = Array.from({ length: 21 }, () => landmark());
const pose = Array.from({ length: 33 }, () => landmark());
const face = Array.from({ length: 10 }, () => landmark());

const { toSoloPlayers } = load('../src/player-tracker.ts');
const rightSidePlayer = empty();
rightSidePlayer.hands = [hand];
rightSidePlayer.detected = true;
rightSidePlayer.pose = { pose, detected: true };
rightSidePlayer.face = { face, blend: { jawOpen: 0.8 }, detected: true };
const normalized = toSoloPlayers([empty(), rightSidePlayer]);
assert.equal(normalized[0].detected, true);
assert.equal(normalized[0].hands.length, 1);
assert.equal(normalized[0].pose.detected, true);
assert.equal(normalized[0].face.detected, true);
assert.equal(normalized[1].detected, false);

const starts = [];
const miniGame = {
  name: 'Solo fixture',
  description: '',
  tracking: 'pose',
  calibrationLandmarks: [23, 24],
  start(width, height, context) {
    starts.push({ width, height, context });
  },
  update() {},
  draw() {},
  getScores: () => [4, 0],
};
const { GameManager } = load('../src/game-manager.ts');
const manager = new GameManager([miniGame]);
manager.startSoloTest(0);
assert.equal(manager.getSession().mode, 'solo-test');
assert.deepEqual([...manager.getCalibrationReadiness(normalized)], [true, true]);
manager.enterCalibration();
const rect = { drawWidth: 1280, drawHeight: 720, offsetX: 0, offsetY: 0 };
manager.update(0.016, normalized, 1280, 720, rect, true);
assert.equal(manager.getState(), 'COUNTDOWN');
manager.update(3.1, normalized, 1280, 720, rect, true);
assert.equal(manager.getState(), 'PLAYING');
assert.equal(starts[0].context.mode, 'solo-test');
assert.equal(starts[0].context.activePlayers, 1);

for (const [file, ClassName, collection] of [
  ['ice-breaker', 'IceBreaker', 'cubes'],
  ['fruit-slice', 'FruitSlice', 'fruits'],
  ['mouth-catch', 'MouthCatch', 'foods'],
]) {
  const Game = load(`../src/games/${file}.ts`)[ClassName];
  const game = new Game();
  game.start(1000, 600, { mode: 'solo-test', activePlayers: 1 });
  game.update(2, [normalized[0], empty()], rect);
  assert.ok(game[collection].length > 0, `${ClassName} should create solo targets`);
  assert.ok(
    game[collection].every((target) => target.owner === 0),
    `${ClassName} should assign every solo target to Player 1`,
  );
}

manager.startParty();
assert.equal(manager.getSession().mode, 'party');
assert.deepEqual(
  [...manager.getCalibrationReadiness([normalized[0], empty()])],
  [true, false],
  'Party mode must still require Player 2',
);
assert.throws(() => manager.startSoloTest(-1));
assert.throws(() => manager.startSoloTest(1));

console.log(
  'PASS solo mode: right/left detections collapse to Player 1, Player 2 is passive, calibration needs one player, context reaches games, targets remain testable, party gating is unchanged',
);
