// Presentation assertions use real GameManager with a fake DOM; no media or model access.
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
    require: (specifier) => load(new URL(specifier + '.ts', url).href),
  });
  return exports;
}
const { GameManager } = load('../src/game-manager.ts');
const { GameUI } = load('../src/game-ui.ts');
const nodes = new Map();
const root = {
  querySelector(selector) {
    if (!nodes.has(selector))
      nodes.set(selector, {
        hidden: false,
        textContent: '',
        focusCount: 0,
        focus() {
          this.focusCount++;
        },
      });
    return nodes.get(selector);
  },
};
const node = (s) => root.querySelector(s);
const text = (key) => node(`[data-ui="${key}"]`).textContent;
const mini = {
  name: 'Test oyunu',
  description: 'İlk talimat. İkinci cümle.',
  tracking: 'hands',
  getScores: () => [7, 11],
  draw() {},
  start() {},
  update() {},
};
const manager = new GameManager([mini, mini]);
const ui = new GameUI(root);
const players = [{ detected: true }, { detected: false }];
manager.enterCalibration();
ui.render(manager, players, true);
assert.equal(node('.calibration').hidden, false);
assert.equal(text('ready-one'), '✓ El algılandı');
assert.equal(text('ready-two'), '○ Elini göster');
manager.state = 'COUNTDOWN';
ui.render(manager, players, false);
assert.equal(node('.countdown-screen').hidden, true, 'Loading model hides countdown');
ui.render(manager, players, true);
assert.equal(node('.countdown-screen').hidden, false);
assert.equal(text('instruction'), 'İlk talimat.');
assert.equal(text('countdown'), '3');
manager.state = 'PLAYING';
ui.render(manager, players, false);
assert.equal(node('.play-hud').hidden, true, 'Model notice does not overlap the HUD');
ui.render(manager, players, true);
assert.equal(text('score-one'), '7');
assert.equal(text('score-two'), '11');
manager.state = 'RESULT';
manager.lastScores = [7, 11];
manager.resultTime = 1;
ui.render(manager, players, true);
assert.equal(text('result-title'), 'Test oyunu');
assert.equal(text('next'), 'Sonraki oyun: 2');
assert.ok(text('winner').includes('Oyuncu 2'));
manager.index = 1;
ui.render(manager, players, true);
assert.equal(text('next'), 'Genel sonuç birazdan…');
manager.state = 'FINAL';
manager.totals = [48, 36];
for (let i = 0; i < 20; i++) ui.render(manager, players, true);
assert.ok(text('winner').includes('Oyuncu 1'), 'Final winner uses totals, not last round');
assert.equal(text('result-one'), '48');
assert.equal(text('result-two'), '36');
assert.equal(node('#result-title').focusCount, 1, 'Final focus happens once, not every frame');
assert.equal(node('.final-actions').hidden, false);
assert.deepEqual(
  Array.from(manager.getTotals()),
  [48, 36],
  'Presentation never accumulates scores',
);
manager.totals = [42, 42];
ui.render(manager, players, true);
assert.ok(text('winner').includes('Berabere'));
assert.equal(text('award-one'), text('award-two'));
ui.reset();
for (const selector of [
  '.calibration',
  '.play-hud',
  '.countdown-screen',
  '.result-screen',
  '.final-actions',
])
  assert.equal(node(selector).hidden, true);
const styles = { fillStyle: 'original', font: 'original', globalAlpha: 1 };
const stack = [];
const context = {
  ...styles,
  save() {
    stack.push({ fillStyle: this.fillStyle, font: this.font, globalAlpha: this.globalAlpha });
  },
  restore() {
    Object.assign(this, stack.pop());
  },
};
mini.draw = (ctx) => {
  ctx.fillStyle = 'changed';
  ctx.font = 'changed';
  ctx.globalAlpha = 0.2;
  throw new Error('Drawing fixture');
};
manager.state = 'PLAYING';
assert.throws(() => manager.draw(context), /Drawing fixture/);
assert.equal(context.fillStyle, styles.fillStyle);
assert.equal(context.font, styles.font);
assert.equal(context.globalAlpha, styles.globalAlpha);
assert.equal(stack.length, 0, 'Canvas save/restore remains balanced even on draw errors');
console.log(
  'PASS UI: real detection labels, model gate, live scores, next timing, total winner, tie, focus once, reset',
);
