import './styles.css';
import { CameraController } from './camera';
import { HandTracker } from './hand-tracker';
import { PlayerTracker } from './player-tracker';
import { GameManager } from './game-manager';
import { IceBreaker } from './games/ice-breaker';
import { PoseTracker } from './pose-tracker';
import { SquatRace } from './games/squat-race';
import { FaceTracker } from './face-tracker';
import { MouthOpenRace } from './games/mouth-open-race';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Uygulama kökü bulunamadı.');

app.innerHTML = `
  <section class="app" aria-label="Kamera partisi başlangıç ekranı"><div class="card">
    <div class="eyebrow">İki kişilik kamera kontrollü parti oyunu</div><h1>Hazır mısınız?</h1>
    <p>Hareketlerinizi kameraya gösterin, arkadaşınızla birlikte eğlenceli mücadeleye başlayın.</p>
    <p class="status" role="alert" aria-live="polite"></p><button type="button">Oyunu Başlat</button>
  </div></section>
  <section class="game" hidden aria-label="Oyun alanı"><video autoplay muted playsinline></video><canvas></canvas>
    <div class="calibration" hidden><div class="calibration-card"><div class="eyebrow">Kalibrasyon</div>
      <h2>Oyuncular yerleşsin</h2><p>Oyuncu 1 sol tarafta durmalı</p><p>Oyuncu 2 sağ tarafta durmalı</p>
      <p>İki oyuncunun elleri algılanmalı</p><p class="calibration-status" role="status" aria-live="polite"></p>
    </div></div>
  </section>`;

const startButton = app.querySelector<HTMLButtonElement>('button')!;
const status = app.querySelector<HTMLParagraphElement>('.status')!;
const intro = app.querySelector<HTMLElement>('.app')!;
const game = app.querySelector<HTMLElement>('.game')!;
const video = app.querySelector<HTMLVideoElement>('video')!;
const canvas = app.querySelector<HTMLCanvasElement>('canvas')!;
const calibration = app.querySelector<HTMLElement>('.calibration')!;
const calibrationStatus = app.querySelector<HTMLParagraphElement>('.calibration-status')!;
const camera = new CameraController(video, canvas);
const handTracker = new HandTracker();
const playerTracker = new PlayerTracker();
const poseTracker = new PoseTracker();
const faceTracker = new FaceTracker();
const gameManager = new GameManager([new IceBreaker(), new SquatRace(), new MouthOpenRace()]);
let poseLoading = false;
let poseReady = false;
let faceLoading = false;
let faceReady = false;
let animationFrame = 0;
let previousTime = performance.now();

const render = () => {
  const now = performance.now();
  const deltaTime = Math.min((now - previousTime) / 1000, 0.1);
  previousTime = now;
  camera.draw();
  const players = playerTracker.classify(handTracker.detectAndDraw(video, canvas));
  if (gameManager.getTrackingType() === 'pose' && !poseLoading && !poseReady) { poseLoading = true; status.textContent = 'Vücut takip modeli yükleniyor…'; void poseTracker.load().then(() => { poseReady = true; }).catch((e) => { status.textContent = e instanceof Error ? e.message : 'Pose modeli yüklenemedi.'; }).finally(() => { poseLoading = false; }); }
  const poses = gameManager.getTrackingType() === 'pose' ? poseTracker.detect(video) : [{ pose: null, detected: false }, { pose: null, detected: false }];
  players[0].pose = poses[0]; players[1].pose = poses[1];
  if (gameManager.getTrackingType() === 'face' && !faceLoading && !faceReady) { faceLoading = true; status.textContent = 'Yüz takip modeli yükleniyor…'; void faceTracker.load().then(() => { faceReady = true; }).catch((e) => { status.textContent = e instanceof Error ? e.message : 'Yüz modeli yüklenemedi.'; }).finally(() => { faceLoading = false; }); }
  const faces = gameManager.getTrackingType() === 'face' ? faceTracker.detect(video) : [{ face: null, blend: {}, detected: false }, { face: null, blend: {}, detected: false }];
  players[0].face = faces[0]; players[1].face = faces[1];
  playerTracker.drawRegions(canvas);
  gameManager.update(deltaTime, players, canvas.width, canvas.height);
  if (gameManager.getState() === 'CALIBRATION') {
    calibration.hidden = false;
    if (!players[0].detected && !players[1].detected) calibrationStatus.textContent = 'İki el de görünür olmalı.';
    else if (!players[0].detected) calibrationStatus.textContent = 'Oyuncu 1 için sol tarafta bir el gösterin.';
    else if (!players[1].detected) calibrationStatus.textContent = 'Oyuncu 2 için sağ tarafta bir el gösterin.';
  } else calibration.hidden = true;
  const context = canvas.getContext('2d');
  if (context) gameManager.draw(context);
  if (context && gameManager.getTrackingType() === 'pose') poseTracker.draw(context, poses);
  if (context && gameManager.getTrackingType() === 'face') faceTracker.draw(context, faces);
  playerTracker.drawLandmarks(canvas, players);
  animationFrame = requestAnimationFrame(render);
};

startButton.addEventListener('click', async () => {
  startButton.disabled = true;
  status.textContent = 'Kamera izni bekleniyor…';
  try {
    await camera.start();
    status.textContent = 'El takip modeli yükleniyor…';
    await handTracker.load();
    intro.hidden = true; game.hidden = false; gameManager.enterCalibration(); camera.resize();
    previousTime = performance.now(); cancelAnimationFrame(animationFrame); render();
  } catch (error) {
    status.textContent = error instanceof Object && 'message' in error ? String(error.message) : 'Beklenmeyen bir hata oluştu.';
    startButton.disabled = false;
  }
});

window.addEventListener('resize', () => camera.resize());
window.addEventListener('orientationchange', () => camera.resize());
window.addEventListener('beforeunload', () => { cancelAnimationFrame(animationFrame); handTracker.close(); poseTracker.close(); faceTracker.close(); camera.stop(); });
