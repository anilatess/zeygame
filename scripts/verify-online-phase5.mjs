// Run: node scripts/verify-online-phase5.mjs. Eight-game online adapter checks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const root = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const gameIds = [
  'ice-breaker',
  'squat-race',
  'mouth-open-race',
  'fruit-slice',
  'jump-race',
  'dance-mimic',
  'face-mimic',
  'mouth-catch',
];
const registry = read('src/games.ts');
const migration = read('supabase/migrations/202610040004_online_scores_events_and_round_seed.sql');
for (const id of gameIds) {
  assert.match(registry, new RegExp(`'${id}'`));
  assert.match(migration, new RegExp(`'${id}'`));
}

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

const { createSeededRandom } = load('../src/random.ts');
for (const [file, ClassName, collection] of [
  ['ice-breaker', 'IceBreaker', 'cubes'],
  ['fruit-slice', 'FruitSlice', 'fruits'],
  ['mouth-catch', 'MouthCatch', 'foods'],
]) {
  const Game = load(`../src/games/${file}.ts`)[ClassName];
  const first = new Game();
  const second = new Game();
  const context = { mode: 'online', activePlayers: 1, localPlayerSlot: 2 };
  first.start(1000, 600, { ...context, random: createSeededRandom(424242) });
  second.start(1000, 600, { ...context, random: createSeededRandom(424242) });
  const empty = {
    hands: [],
    pose: null,
    face: { face: null, blend: {}, detected: false },
    detected: false,
  };
  const rect = { drawWidth: 1000, drawHeight: 600, offsetX: 0, offsetY: 0 };
  first.update(2, [empty, empty], rect);
  second.update(2, [empty, empty], rect);
  assert.ok(first[collection].length > 0, `${ClassName} should spawn online targets`);
  assert.ok(
    first[collection].every((target) => target.owner === 1),
    `${ClassName} must target P2`,
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(first[collection])),
    JSON.parse(JSON.stringify(second[collection])),
    `${ClassName} challenge generation must be deterministic`,
  );
}

const manager = read('src/game-manager.ts');
assert.match(manager, /localPlayerSlot: this\.isOnline\(\)/);
assert.match(manager, /createSeededRandom\(this\.onlineRoundSeed\)/);
assert.match(read('src/player-tracker.ts'), /toSinglePlayer/);

console.log('PASS online phase 5: all eight games registered, P2 targets and deterministic rounds');
