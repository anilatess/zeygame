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
    require: (s) => load(new URL(s + '.ts', url).href),
  });
  return exports;
}
const { createGames } = load('../src/games.ts');
const { createSeededRandom } = load('../src/random.ts');
const { toSinglePlayer } = load('../src/player-tracker.ts');
const { getCoverRect, toCanvasPoint } = load('../src/coordinate-mapper.ts');
const empty = () => ({
  hands: [],
  pose: null,
  face: { face: null, blend: {}, detected: false },
  detected: false,
});
for (const slot of [1, 2]) {
  const games = createGames();
  for (const game of games) {
    game.start(422, 390, {
      mode: 'online',
      activePlayers: 1,
      localPlayerSlot: slot,
      random: createSeededRandom(42),
    });
    game.update(0.8, [empty(), empty()], getCoverRect(1280, 720, 422, 390));
    const before = game.getScores();
    const targets = game.cubes ?? game.fruits ?? game.foods ?? [];
    const initial = targets.map((x) => ({ x: x.x, y: x.y }));
    game.resize?.(320, 360);
    assert.deepEqual([...game.getScores()], [...before], 'resize preserves score');
    targets.forEach((target, i) => {
      assert.equal(target.owner, slot - 1);
      assert.ok(Math.abs(target.x - (initial[i].x * 320) / 422) < 1e-6);
      assert.ok(Math.abs(target.y - (initial[i].y * 360) / 390) < 1e-6);
    });
  }
  // The same finger hits the same local target for host AND guest after resize.
  const ice = games[0];
  const cube = ice.cubes[0];
  const rect = getCoverRect(1280, 720, 320, 360);
  const tip = {
    x: 1 - (cube.x - rect.offsetX) / rect.drawWidth,
    y: (cube.y - rect.offsetY) / rect.drawHeight,
    z: 0,
  };
  const mapped = toCanvasPoint(tip, rect);
  assert.ok(Math.abs(mapped.x - cube.x) < 1e-6);
  const hand = Array.from({ length: 21 }, () => ({ ...tip }));
  const left = { ...empty(), hands: [hand], detected: true };
  ice.update(0.01, toSinglePlayer([left, empty()], slot), rect);
  assert.equal(cube.hits, 1, `P${slot} collisions remain in the left local canvas`);
}
console.log(
  'PASS online layout: both player slots, all eight games resize without score reset, post-resize finger/target alignment',
);
