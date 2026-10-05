import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync(
  new URL('../src/online/match-difficulty.ts', import.meta.url),
  'utf8',
);
const manager = fs.readFileSync(new URL('../src/game-manager.ts', import.meta.url), 'utf8');
const screen = fs.readFileSync(
  new URL('../src/components/OnlineScreen.tsx', import.meta.url),
  'utf8',
);
const exports = {};
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
vm.runInNewContext(outputText, { exports });

assert.equal(exports.difficultyForRound(0).label, 'RAHAT');
assert.equal(exports.difficultyForRound(1).label, 'NORMAL');
assert.equal(exports.difficultyForRound(2).label, 'ZORLU');
assert.equal(exports.difficultyForRound(99).label, 'ZORLU');
assert.ok(exports.difficultyForRound(0).durationMultiplier > 1);
assert.ok(exports.difficultyForRound(2).durationMultiplier < 1);
assert.match(manager, /getRoundDuration\(\)/, 'online engine should use adjusted duration');
assert.match(screen, /difficulty\.durationMultiplier/, 'arena clock should use adjusted duration');

console.log('Progressive online difficulty checks passed.');
