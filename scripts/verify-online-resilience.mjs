import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const cache = new Map();
function load(file) {
  const url = new URL(file, import.meta.url);
  if (cache.has(url.href)) return cache.get(url.href);
  const exports = {};
  cache.set(url.href, exports);
  const { outputText } = ts.transpileModule(fs.readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(outputText, {
    exports,
    performance,
    require: (specifier) => load(new URL(`${specifier}.ts`, url).href),
  });
  return exports;
}
const { GameManager } = load('../src/game-manager.ts');
const { createGames } = load('../src/games.ts');
const { ScoreOutbox } = load('../src/online/score-outbox.ts');
// Date.now rounds to milliseconds while animation time is fractional.
// A normal 17ms frame must never insert an artificial tracking-loss sample.
{
  let now = 0;
  const observations = [];
  const game = {
    id: 'ice-breaker',
    name: 'Clock test',
    tracking: 'hands',
    start() {},
    update(_dt, players) {
      observations.push(players[0].detected);
    },
    getScores() {
      return [0, 0];
    },
  };
  const manager = new GameManager([game]);
  manager.startOnline(0, 1);
  manager.enterOnlineCalibration(0, 0, () => now);
  const present = [
    { hands: [], pose: null, face: { detected: false, blend: {}, face: null }, detected: true },
    { hands: [], pose: null, face: { detected: false, blend: {}, face: null }, detected: false },
  ];
  for (let i = 1; i <= 100; i++) {
    now = i * 17;
    manager.update(0.0166, present, 640, 480, {});
  }
  assert.equal(observations.length, 100);
  assert.ok(observations.every(Boolean));
}
const empty = () => ({
  hands: [],
  pose: null,
  face: { face: null, blend: {}, detected: false },
  detected: false,
});
const players = [empty(), empty()];
const rect = { drawWidth: 640, drawHeight: 480, offsetX: 0, offsetY: 0 };
for (let index = 0; index < 8; index++) {
  let now = 1000;
  const first = new GameManager(createGames());
  const second = new GameManager(createGames());
  for (const manager of [first, second]) {
    manager.startOnline(index, 1, 42);
    manager.enterOnlineCalibration(5, 6000, () => now);
    manager.update(0.01, players, 640, 480, rect);
    assert.equal(manager.getState(), 'COUNTDOWN');
  }
  now = 6000;
  for (const manager of [first, second]) manager.update(0.01, players, 640, 480, rect);
  assert.equal(
    first.getState(),
    'PLAYING',
    'missing landmarks must not extend the online deadline',
  );
  for (let tick = 1; tick <= 100; tick++) {
    now = 6000 + tick * 100;
    first.update(0.1, players, 640, 480, rect);
    second.update(0.1, players, 640, 480, rect);
  }
  for (let tick = 1; tick <= 60; tick++) {
    now = 16000 + tick * 100;
    first.update(0.1, players, 640, 480, rect);
  }
  second.update(0.1, players, 640, 480, rect, false);
  assert.equal(
    second.getRemainingTime(),
    first.getRemainingTime(),
    'background/model delay cannot add time',
  );
  now = 6000 + (first.getCurrentGame().duration ?? 20) * 1000 + 1;
  for (const manager of [first, second]) {
    manager.update(0.1, players, 640, 480, rect);
    assert.equal(manager.getState(), 'FINAL');
    assert.equal(manager.getRemainingTime(), 0);
    assert.deepEqual([...manager.getScores()], [0, 0], 'catch-up must not invent observations');
  }
}
const memory = new Map();
const storage = {
  getItem: (key) => memory.get(key),
  setItem: (key, value) => memory.set(key, value),
  removeItem: (key) => memory.delete(key),
};
let queue = new ScoreOutbox(storage);
queue.setScope('room', 'round', 'user');
const score = {
  roomId: 'room',
  roundId: 'round',
  userId: 'user',
  score: 12,
  sequence: 5,
  final: true,
};
queue.enqueue(score);
await assert.rejects(
  queue.flush(async () => {
    throw new Error('offline');
  }),
);
assert.equal(queue.hasPending(), true);
queue = new ScoreOutbox(storage);
queue.setScope('room', 'round', 'user');
assert.equal(queue.getSequence(), 5);
queue.enqueue({ ...score, sequence: 6, score: 0, final: false });
await queue.flush(async (pending) => assert.equal(pending.score, 12));
assert.equal(queue.hasPending(), false);
assert.equal(queue.getSequence(), 5);
queue.enqueue({ ...score, final: false, sequence: 6 });
let resolve;
const flight = queue.flush(
  () =>
    new Promise((done) => {
      resolve = done;
    }),
);
queue.enqueue({ ...score, sequence: 7, score: 15 });
resolve();
await flight;
assert.equal(queue.hasPending(), true, 'an older acknowledgement cannot delete a newer final');
await queue.flush(async (pending) => assert.equal(pending.score, 15));
queue.enqueue({ ...score, sequence: 8 });
queue.setScope('room', 'new-round', 'user');
assert.equal(queue.hasPending(), false, 'never retry scores into a different round');
console.log(
  'PASS online resilience: eight absolute deadlines, background/model gaps, durable final-score retries, reload and in-flight ordering',
);
