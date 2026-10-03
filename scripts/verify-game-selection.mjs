// Run: node scripts/verify-game-selection.mjs. No camera, DOM or network.
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
    { exports, performance, require: (specifier) => load(new URL(`${specifier}.ts`, url).href) },
    { filename: url.pathname },
  );
  return exports;
}

const { createGames } = load('../src/games.ts');
const { GameManager } = load('../src/game-manager.ts');
const games = createGames();
assert.equal(games.length, 8);
assert.equal(new Set(games.map((game) => game.name)).size, 8);
assert.equal(
  Array.from(new Set(Array.from(games, (game) => game.needs ?? game.tracking)))
    .sort()
    .join(','),
  'face,hands,pose',
);

const manager = new GameManager(games);
assert.equal(manager.getGames().length, games.length);
games.forEach((game, index) => assert.equal(manager.getGames()[index], game));
manager.startParty();
assert.equal(manager.getSession().mode, 'party');
assert.equal(manager.getSession().games.length, 8);
for (let index = 0; index < games.length; index++) {
  manager.startSingle(index);
  assert.equal(manager.getSession().mode, 'single');
  assert.equal(manager.getCurrentGame(), games[index]);
  assert.equal(manager.hasNextGame(), false);
  manager.startSoloTest(index);
  assert.equal(manager.getSession().mode, 'solo-test');
  assert.equal(manager.getCurrentGame(), games[index]);
  assert.equal(manager.hasNextGame(), false);
}
assert.throws(() => manager.startSingle(-1));
assert.throws(() => manager.startSingle(8));
assert.throws(() => manager.startSoloTest(-1));
assert.throws(() => manager.startSoloTest(8));
manager.startParty();
assert.equal(
  manager.getSession().games.length,
  8,
  'party catalog is restored after selected sessions',
);

const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
const menu = fs.readFileSync(new URL('../src/components/MenuScreens.tsx', import.meta.url), 'utf8');
assert.match(app, /const games = useMemo<MiniGame\[]>\(\(\) => createGames\(\)/);
assert.match(
  menu,
  /games\.map\(\(miniGame, index\)/,
  'selection cards derive from the game registry',
);
assert.match(app, /startSession\(solo \? 'solo-test' : 'single', index\)/);
assert.match(app, /manager\?\.isSoloTest\(\) \? 'solo-test' : 'select'/);
assert.match(menu, /data-game-index=\{index\}/);

console.log(
  'PASS selection: eight registry games, party/single/solo sessions, invalid indices, React-derived cards and return routes',
);
