import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const score = fs.readFileSync(new URL('../src/online/match-score.ts', import.meta.url), 'utf8');
const screen = fs.readFileSync(
  new URL('../src/components/OnlineScreen.tsx', import.meta.url),
  'utf8',
);
const exports = {};
const { outputText } = ts.transpileModule(score, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
});
vm.runInNewContext(outputText, { exports });

const final = (roundId, playerSlot, value, minute) => ({
  roundId,
  playerSlot,
  score: value,
  sequence: 1,
  isFinal: true,
  updatedAt: `2026-10-05T10:0${minute}:00Z`,
});
const match = exports.calculateMatchScore([
  final('second', 2, 4, 3),
  final('first', 1, 8, 1),
  final('third', 1, 5, 5),
  final('first', 2, 2, 1),
  final('second', 1, 4, 3),
  final('third', 2, 9, 5),
  { ...final('ignored', 1, 99, 0), isFinal: false },
]);

assert.deepEqual(
  JSON.parse(JSON.stringify(match.rounds.map((round) => round.roundId))),
  ['first', 'second', 'third'],
  'completed rounds should be ordered by finish time',
);
assert.equal(match.winsOne, 1);
assert.equal(match.winsTwo, 1);
assert.equal(match.draws, 1);
assert.equal(match.complete, true);
assert.match(screen, /3 RAUNDLUK MAÇ/, 'lobby should show match progress');
assert.match(screen, /RAUND İÇİN RÖVANŞ/, 'finished rounds should offer a rematch');
assert.match(screen, /MAÇI KAZANDI/, 'the third round should produce a match winner');

console.log('Online best-of-three match checks passed.');
