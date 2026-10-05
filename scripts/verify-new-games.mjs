import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const read = (path) => fs.readFileSync(new URL(path, root), 'utf8');
const registry = read('src/games.ts');
const menu = read('src/components/MenuScreens.tsx');
const visuals = read('src/components/ZeyVisuals.tsx');

for (const [id, name, file] of [
  ['balloon-pop', 'Balon Patlatma', 'balloon-pop.ts'],
  ['freeze-dance', 'Don–Hareket Et', 'freeze-dance.ts'],
  ['goalkeeper', 'Sanal Kaleci', 'goalkeeper.ts'],
]) {
  const source = read(`src/games/${file}`);
  assert.match(registry, new RegExp(`'${id}'`), `${name} should be registered`);
  assert.match(source, /getScores\(\)/, `${name} should expose scores`);
  assert.match(source, /resize\(width: number, height: number\)/, `${name} should resize safely`);
  assert.match(menu, new RegExp(name), `${name} should have a library category`);
  assert.match(visuals, new RegExp(name), `${name} should have cover art`);
}

assert.match(registry, /ONLINE_GAME_IDS = GAME_IDS\.slice\(0, 8\)/);
assert.match(
  read('src/components/OnlineScreen.tsx'),
  /ONLINE_GAME_IDS/,
  'new games must stay out of online selection until the database accepts their ids',
);

console.log('Three new local game checks passed.');
