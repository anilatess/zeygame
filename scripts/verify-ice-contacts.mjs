// Run: node scripts/verify-ice-contacts.mjs
// Executes the real game; controlled RNG is supplied only in the VM environment.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
const root = fileURLToPath(new URL('../', import.meta.url));
const modules = new Map();
let randomValue = 0.5;
const controlledMath = Object.assign(Object.create(Math), { random: () => randomValue });
function load(relative) {
  const filename = path.resolve(root, relative);
  if (modules.has(filename)) return modules.get(filename);
  const exports = {};
  modules.set(filename, exports);
  const { outputText } = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  vm.runInNewContext(
    outputText,
    {
      exports,
      require: (s) => load(path.relative(root, path.resolve(path.dirname(filename), s + '.ts'))),
      Math: controlledMath,
    },
    { filename },
  );
  return exports;
}
const { IceBreaker } = load('src/games/ice-breaker.ts');
const { GameManager } = load('src/game-manager.ts');
const { getCoverRect } = load('src/coordinate-mapper.ts');
const rect = getCoverRect(1000, 1000, 1000, 1000);
function create() {
  randomValue = 0.5;
  const game = new IceBreaker();
  game.start(1000, 1000);
  assert.equal(game.cubes.length, 2);
  return game;
}
// Only inspect produced cubes; never replace them or copy collision/entry logic.
const left = (game) => game.cubes.find((c) => c.owner === 0);
function hand(x, y, mapping = rect) {
  return Array.from({ length: 21 }, () => ({
    x: 1 - (x - mapping.offsetX) / mapping.drawWidth,
    y: (y - mapping.offsetY) / mapping.drawHeight,
    z: 0,
  }));
}
const inside = (cube, mapping = rect) => hand(cube.x, cube.y, mapping);
const outside = (cube, mapping = rect) => hand(cube.x + cube.size, cube.y, mapping);
function player(hands) {
  return {
    hands,
    pose: null,
    face: { face: null, blend: {}, detected: false },
    detected: hands.length > 0,
  };
}
function step(game, dt, hands = [], other = [], mapping = rect) {
  game.update(dt, [player(hands), player(other)], mapping);
}
const scores = (game) => Array.from(game.getScores());

{
  const game = create(),
    cube = left(game),
    finger = inside(cube);
  for (let i = 0; i < 10; i++) step(game, 0.1, [finger]);
  assert.equal(cube.hits, 1);
  assert.deepEqual(scores(game), [0, 0]);
  console.log('PASS stationary finger for one second: exactly one hit');
}
{
  const game = create(),
    cube = left(game);
  for (let entry = 1; entry <= 3; entry++) {
    step(game, 0.1, [inside(cube)]);
    assert.equal(cube.hits, entry);
    for (let held = 0; held < 3; held++) step(game, 0.1, [inside(cube)]);
    assert.equal(cube.hits, entry);
    step(game, 0.1, [outside(cube)]);
  }
  assert.ok(!game.cubes.includes(cube));
  assert.deepEqual(scores(game), [1, 0]);
  step(game, 0.1, [inside(cube)]);
  assert.deepEqual(scores(game), [1, 0]);
  console.log('PASS three separate entries: cube removed, exactly one point');
}
{
  const game = create(),
    cube = left(game),
    a = inside(cube),
    b = hand(cube.x + 5, cube.y);
  step(game, 0, [a, b]);
  assert.equal(cube.hits, 1);
  for (let i = 0; i < 6; i++) step(game, 0.1, i % 2 ? [b, a] : [a, outside(cube)]);
  assert.equal(
    cube.hits,
    1,
    'one finger remains inside despite the other leaving and swapping order',
  );
  step(game, 0.1, [outside(cube), outside(cube)]);
  step(game, 0.1, [b, a]);
  assert.equal(cube.hits, 2, 'all fingers must leave before another entry');
  console.log('PASS simultaneous fingers, partial exit, reordered hands and full exit');
}
{
  const game = create(),
    cube = left(game);
  step(game, 0, [inside(cube)]);
  // Cross the entry edge repeatedly, but stay within the wider exit band.
  for (let i = 0; i < 8; i++)
    step(game, 0.1, [hand(cube.x + cube.size * (i % 2 ? 0.49 : 0.55), cube.y)]);
  assert.equal(cube.hits, 1);
  step(game, 0.1, [outside(cube)]);
  step(game, 0.1, [inside(cube)]);
  assert.equal(cube.hits, 2);
  console.log('PASS boundary jitter does not rearm; valid outer exit does');
}
{
  const game = create(),
    cube = left(game);
  step(game, 0, [inside(cube)]);
  step(game, 0.3, []);
  step(game, 0.1, [inside(cube)]);
  assert.equal(cube.hits, 1, 'tracking loss is not exit');
  const invalid = inside(cube);
  invalid[8].x = NaN;
  step(game, 0.1, [invalid]);
  step(game, 0.1, [inside(cube)]);
  assert.equal(cube.hits, 1, 'invalid coordinates are not exit');
  const missingTip = inside(cube);
  delete missingTip[8];
  step(game, 0.1, [missingTip]);
  step(game, 0.1, [inside(cube)]);
  assert.equal(cube.hits, 1, 'missing tip is not exit');
  step(game, 0.1, [outside(cube)]);
  step(game, 0.1, [inside(cube)]);
  assert.equal(cube.hits, 2);
  console.log('PASS tracking loss, invalid/missing tip, reappearance inside and observed outside');
}
{
  const game = create(),
    cube = left(game),
    a = inside(cube),
    b = outside(cube);
  step(game, 0, [a, b]);
  // The previously touching hand disappears; the other hand being outside is insufficient.
  step(game, 0.3, [b]);
  step(game, 0.1, [b, a]);
  assert.equal(cube.hits, 1);
  step(game, 0.1, [outside(cube), outside(cube)]);
  step(game, 0.1, [a, b]);
  assert.equal(cube.hits, 2);
  console.log('PASS partial hand loss cannot rearm a previously two-hand observation');
}
{
  const game = create(),
    cube = left(game);
  step(game, 0, [inside(cube)]);
  step(game, 0.05, [outside(cube)]);
  step(game, 0.05, [inside(cube)]);
  assert.equal(cube.hits, 1, 'entry within cooldown is rejected');
  for (let i = 0; i < 6; i++) step(game, 0.1, [inside(cube)]);
  assert.equal(cube.hits, 1, 'rejected entry must not become a delayed hit');
  step(game, 0.1, [outside(cube)]);
  step(game, 0.1, [inside(cube)]);
  assert.equal(cube.hits, 2);
  console.log('PASS cooldown entry is consumed, never delayed');
}
{
  const game = create(),
    cube = left(game),
    right = game.cubes.find((c) => c.owner === 1);
  step(game, 0, [inside(cube)], [inside(right)]);
  step(game, 0.3, [inside(cube)], [outside(right)]);
  step(game, 0.1, [inside(cube)], [inside(right)]);
  assert.equal(cube.hits, 1);
  assert.equal(right.hits, 2);
  randomValue = 0.1;
  // The controlled next spawn is at (114, 260); keep a finger there before birth.
  step(game, 0.8, [inside(cube), hand(114, 260)], [inside(right)]);
  const other = game.cubes.find((c) => c.owner === 0 && c !== cube);
  assert.ok(other, 'unchanged 1.2-second spawning creates another controlled cube');
  assert.equal(other.hits, 1, 'a cube born under an already visible finger gets one initial hit');
  for (let i = 0; i < 3; i++) step(game, 0.1, [inside(cube), inside(other)], [inside(right)]);
  assert.equal(cube.hits, 1);
  assert.equal(other.hits, 1, 'new cube under a stationary finger gets at most one hit');
  step(game, 0.1, [inside(cube), outside(other)]);
  step(game, 0.1, [inside(cube), inside(other)]);
  assert.equal(cube.hits, 1);
  assert.equal(other.hits, 2);
  assert.equal(right.hits, 2);
  console.log('PASS independent cubes and owners, unchanged spawning, new cube first contact');
}
{
  const game = create(),
    cube = left(game),
    finger = inside(cube);
  step(game, 0, [finger]);
  game.start(1000, 1000);
  const fresh = left(game);
  assert.notEqual(fresh, cube);
  assert.equal(fresh.hits, 0);
  assert.deepEqual(scores(game), [0, 0]);
  step(game, 0, [finger]);
  assert.equal(fresh.hits, 1);
  step(game, 1, [finger]);
  assert.equal(fresh.hits, 1);
  const expired = create(),
    old = left(expired);
  for (let i = 0; i < 40; i++) step(expired, 0.1, []);
  assert.ok(!expired.cubes.includes(old), 'original four-second cube lifetime is preserved');
  assert.equal(new GameManager([new IceBreaker()]).getRemainingTime(), 20);
  console.log(
    'PASS restart resets contacts; four-second lifetime and 20-second duration preserved',
  );
}
// Real shared mapping in a cropped portrait frame; no replacement coordinate conversion.
{
  const game = create(),
    cube = left(game),
    mapping = getCoverRect(1280, 720, 1000, 1000);
  step(game, 0, [inside(cube, mapping)], [], mapping);
  step(game, 0.3, [outside(cube, mapping)], [], mapping);
  step(game, 0.1, [inside(cube, mapping)], [], mapping);
  assert.equal(cube.hits, 2);
  console.log('PASS shared cover coordinate conversion retained');
}
