// Separate Vite development entry. Not imported by the app or included in dist.
import '../src/styles.css';
import { createGames } from '../src/games';
import { GameManager } from '../src/game-manager';
import { GameUI, gameUiMarkup } from '../src/game-ui';
import { CameraController } from '../src/camera';
import { getCoverRect } from '../src/coordinate-mapper';
import { PlayerTracker } from '../src/player-tracker';
import type { GameState, PlayersTracking } from '../src/types';

if (!import.meta.env.DEV) throw new Error('Visual fixtures are development-only.');
const root = document.querySelector<HTMLElement>('#app')!;
root.innerHTML = `<section class="game" tabindex="-1"><video></video><canvas></canvas>${gameUiMarkup}<div class="model-message" hidden><p role="status"></p><button data-action="retry">Tekrar Dene</button><button data-action="fixture-home">Ana Menüye Dön</button></div><span class="fixture-badge">SAHTE VERİ · KAMERA TESTİ DEĞİL</span></section><div class="update-notice" hidden><span>Yeni sürüm hazır — Yenile</span><button data-action="update">Yenile</button></div>`;
const style = document.createElement('style');
style.textContent =
  '.fixture-badge{position:fixed;left:50%;bottom:2px;transform:translateX(-50%);font:9px system-ui;color:#fff;background:#10162e;pointer-events:none;z-index:9;padding:2px 6px;border-radius:4px}';
document.head.append(style);
const canvas = root.querySelector('canvas')!;
const camera = new CameraController(root.querySelector('video')!, canvas);
const manager = new GameManager(createGames());
const ui = new GameUI(root);
const params = new URLSearchParams(location.search);
const states: GameState[] = ['CALIBRATION', 'COUNTDOWN', 'PLAYING', 'RESULT', 'FINAL'];
let state = (params.get('state') || 'CALIBRATION') as GameState;
if (!states.includes(state)) state = 'CALIBRATION';
let index = Math.max(0, Math.min(7, Number(params.get('game')) || 0));
let tie = params.has('tie');
let ready = !params.has('loading') && !params.has('error');
let failed = params.has('error');
const controlled = manager as unknown as {
  state: GameState;
  index: number;
  elapsed: number;
  countdown: number;
  resultTime: number;
  lastScores: [number, number];
  totals: [number, number];
};
const players: PlayersTracking = [
  { hands: [], pose: null, face: { face: null, blend: {}, detected: false }, detected: true },
  { hands: [], pose: null, face: { face: null, blend: {}, detected: false }, detected: false },
];

function render() {
  camera.resize(); // Same production DPR behavior; no camera permission or media stream.
  const context = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const scale = width / canvas.clientWidth;
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#6c8290');
  background.addColorStop(1, '#c5b9a6');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.save();
  context.strokeStyle = '#ffffff24';
  context.lineWidth = 2 * scale;
  for (let x = 0; x < width; x += 80 * scale) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  // Neutral silhouettes represent the simulated camera only, not tracking output.
  for (const x of [width * 0.25, width * 0.75]) {
    const unit = Math.min(width * 0.13, height * 0.16);
    context.fillStyle = '#22344188';
    context.beginPath();
    context.arc(x, height * 0.4, unit * 0.45, 0, Math.PI * 2);
    context.fill();
    context.lineWidth = unit * 0.25;
    context.lineCap = 'round';
    context.strokeStyle = '#22344188';
    context.beginPath();
    context.moveTo(x, height * 0.4 + unit * 0.6);
    context.lineTo(x, height * 0.7);
    context.moveTo(x - unit, height * 0.55);
    context.lineTo(x + unit, height * 0.55);
    context.moveTo(x, height * 0.7);
    context.lineTo(x - unit * 0.6, height * 0.88);
    context.moveTo(x, height * 0.7);
    context.lineTo(x + unit * 0.6, height * 0.88);
    context.stroke();
  }
  context.restore();
  new PlayerTracker().drawRegions(canvas);
  controlled.index = index;
  controlled.state = state;
  controlled.countdown = 3;
  controlled.elapsed = 7;
  controlled.resultTime = 1;
  controlled.lastScores = tie ? [11, 11] : [7, 11];
  // Opposite winners ensure FINAL is using totals rather than lastScores.
  controlled.totals = tie ? [42, 42] : [48, 36];
  const mini = manager.getCurrentGame();
  mini.start(width, height);
  const rect = getCoverRect(1280, 720, width, height);
  let seed = 17;
  const random = Math.random;
  Math.random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  try {
    mini.update(0.8, players, rect);
  } finally {
    Math.random = random;
  }
  const fields = mini as unknown as {
    scores: [number, number];
    best?: [number, number];
    rounds?: { best: number }[];
    round?: number;
  };
  fields.scores = [7, 11];
  if (fields.best) fields.best = [0.72, 0.46];
  if (fields.rounds)
    fields.rounds.forEach((round, i) => {
      round.best = i ? 0.46 : 0.72;
    });
  if (fields.round !== undefined)
    fields.round = Math.max(0, Math.min(3, Number(params.get('target')) || 0));
  ui.render(manager, players, ready);
  root.querySelector<HTMLElement>('.calibration-status')!.textContent =
    'Oyuncu 2 için sağ tarafta el gösterin.';
  const model = root.querySelector<HTMLElement>('.model-message')!;
  model.hidden = ready;
  model.querySelector('p')!.textContent = failed
    ? 'Takip modeli yüklenemedi. Bağlantınızı kontrol edip tekrar deneyin.'
    : 'Takip modeli yükleniyor…';
  model.querySelector<HTMLButtonElement>('[data-action="retry"]')!.hidden = !failed;
  root.querySelector<HTMLElement>('.update-notice')!.hidden = !params.has('update');
  const labels: { text: string; x: number; y: number; width: number; height: number }[] = [];
  const fillText = context.fillText;
  context.fillText = function (text, x, y, maxWidth) {
    const metric = this.measureText(text);
    const width = metric.width;
    const ascent = metric.actualBoundingBoxAscent;
    const descent = metric.actualBoundingBoxDescent;
    labels.push({
      text,
      x: (x - (this.textAlign === 'center' ? width / 2 : 0)) / scale,
      y: (y - ascent) / scale,
      width: width / scale,
      height: (ascent + descent) / scale,
    });
    if (maxWidth === undefined) fillText.call(this, text, x, y);
    else fillText.call(this, text, x, y, maxWidth);
  };
  try {
    if (ready) manager.draw(context);
  } finally {
    context.fillText = fillText;
  }
  root.dataset.fixtureLabels = JSON.stringify(labels);
}
root.querySelectorAll<HTMLButtonElement>('button').forEach((button) =>
  button.addEventListener('click', () => {
    if (button.dataset.action === 'replay') {
      manager.reset();
      manager.enterCalibration();
      state = manager.getState();
      ui.reset();
      render();
      root.querySelector<HTMLElement>('.game')!.focus();
    } else if (button.dataset.action === 'retry') {
      ready = true;
      failed = false;
      render();
    } else if (button.dataset.action === 'update') {
      params.delete('update');
      render();
    } else location.href = './';
  }),
);
window.addEventListener('resize', render);
window.addEventListener('keydown', (event) => {
  if (/^[1-5]$/.test(event.key)) {
    state = states[Number(event.key) - 1];
    render();
  }
  if (event.key === 'n') {
    index = (index + 1) % 8;
    render();
  }
  if (event.key === 't') {
    tie = !tie;
    render();
  }
});
render();
