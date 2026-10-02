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
import { FruitSlice } from './games/fruit-slice';
import { JumpRace } from './games/jump-race';
import { DanceMimic } from './games/dance-mimic';
import { FaceMimic } from './games/face-mimic';
import { MouthCatch } from './games/mouth-catch';
import { audio } from './audio';
import type { PlayerFace, PlayerPose, PlayersTracking } from './types';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Uygulama kökü bulunamadı.');
app.innerHTML = `<section class="app"><div class="card menu-card"><div class="eyebrow">İKİ KİŞİLİK KAMERA PARTİSİ</div><h1>Hazır mısınız?</h1><p>Hareketlerinizi kullanarak üç mini oyunda yarışın.</p><p class="status" role="alert" aria-live="polite"></p><div class="menu-actions"><button data-action="start">Oyunu Başlat</button><button data-action="games">Oyunları Göster</button><button data-action="howto">Nasıl Oynanır?</button></div><div class="info-panel" hidden></div></div></section><section class="game" hidden><video autoplay muted playsinline></video><canvas></canvas><div class="camera-message" hidden></div><div class="model-message" hidden><p role="status" aria-live="polite"></p><button data-action="retry" hidden>Tekrar Dene</button><button data-action="home">Ana Menüye Dön</button></div><div class="calibration" hidden><div class="calibration-card"><div class="eyebrow">Kalibrasyon</div><h2>Oyuncular yerleşsin</h2><p>Oyuncu 1 sol tarafta durmalı</p><p>Oyuncu 2 sağ tarafta durmalı</p><p>İki oyuncunun elleri algılanmalı</p><p class="calibration-status"></p></div></div><div class="final-actions" hidden><button data-action="replay">Tekrar Oyna</button><button data-action="home">Ana Menüye Dön</button></div></section>`;
app.innerHTML +=
  '<div class="update-notice" role="status" aria-live="polite" hidden><span>Yeni sürüm hazır — Yenile</span><button data-action="update">Yenile</button></div>';

const q = <T extends Element>(s: string) => app.querySelector<T>(s)!;
const intro = q<HTMLElement>('.app'),
  game = q<HTMLElement>('.game'),
  status = q<HTMLParagraphElement>('.status'),
  info = q<HTMLElement>('.info-panel');
const video = q<HTMLVideoElement>('video'),
  canvas = q<HTMLCanvasElement>('canvas'),
  calibration = q<HTMLElement>('.calibration'),
  calibrationStatus = q<HTMLParagraphElement>('.calibration-status');
const cameraMessage = q<HTMLElement>('.camera-message'),
  finalActions = q<HTMLElement>('.final-actions');
const camera = new CameraController(video, canvas),
  handTracker = new HandTracker(),
  playerTracker = new PlayerTracker(),
  poseTracker = new PoseTracker(),
  faceTracker = new FaceTracker();
const manager = new GameManager([
  new IceBreaker(),
  new SquatRace(),
  new MouthOpenRace(),
  new FruitSlice(),
  new JumpRace(),
  new DanceMimic(),
  new FaceMimic(),
  new MouthCatch(),
]);
const trackers = { hands: handTracker, pose: poseTracker, face: faceTracker };
const modelMessage = q<HTMLElement>('.model-message');
const modelStatus = q<HTMLElement>('.model-message p');
const retryButton = q<HTMLButtonElement>('[data-action="retry"]');
const updateNotice = q<HTMLElement>('.update-notice');
let waitingWorker: ServiceWorker | null = null;
let updateRequested = false;
let updateReloaded = false;
let frame = 0,
  previous = performance.now(),
  session = 0;
let previousTrackingType: ReturnType<GameManager['getTrackingType']> | null = null;

function requiredTracker() {
  return trackers[manager.getState() === 'CALIBRATION' ? 'hands' : manager.getTrackingType()];
}

function emptyPose(): PlayerPose {
  return { pose: null, detected: false };
}

function emptyFace(): PlayerFace {
  return { face: null, blend: {}, detected: false };
}

function emptyPlayers(): PlayersTracking {
  return [
    { hands: [], pose: null, face: emptyFace(), detected: false },
    { hands: [], pose: null, face: emptyFace(), detected: false },
  ];
}

function clearDetectionsExcept(type: ReturnType<GameManager['getTrackingType']> | null): void {
  if (type !== 'hands') handTracker.clearDetections();
  if (type !== 'pose') poseTracker.clearDetections();
  if (type !== 'face') faceTracker.clearDetections();
}

function stopSession(): void {
  session++;
  cancelAnimationFrame(frame);
  audio.stopAll();
  camera.stop();
  handTracker.close();
  poseTracker.close();
  faceTracker.close();
  previousTrackingType = null;
  manager.reset();
  modelMessage.hidden = true;
}

function showInfo(kind: 'games' | 'howto'): void {
  info.hidden = false;
  info.innerHTML =
    kind === 'games'
      ? `<h2>Mini oyunlar</h2>${manager
          .getGames()
          .map((miniGame) => `<p><b>${miniGame.name}:</b> ${miniGame.description}</p>`)
          .join('')}`
      : '<h2>Nasıl oynanır?</h2><p>Oyuncu 1 solda, Oyuncu 2 sağda durmalı.</p><p>Telefon veya laptop sabit konumda olmalı ve iyi ışık kullanılmalı.</p><p>Tüm vücut oyunlarında kameradan biraz uzakta durun.</p>';
}
function setLoading(text: string): void {
  status.textContent = `⏳ ${text}`;
}

const render = () => {
  const now = performance.now(),
    dt = Math.min((now - previous) / 1000, 0.1);
  previous = now;
  const rect = camera.draw();
  if (!rect) {
    cameraMessage.hidden = false;
    cameraMessage.textContent = 'Kamera görüntüsü hazırlanıyor…';
    frame = requestAnimationFrame(render);
    return;
  }
  cameraMessage.hidden = true;
  const state = manager.getState();
  const type = manager.getTrackingType();
  const detectionType = state === 'CALIBRATION' ? 'hands' : type;
  const tracker = requiredTracker();
  const needsModel = ['CALIBRATION', 'COUNTDOWN', 'PLAYING'].includes(state);
  if (needsModel && tracker.state === 'idle') void tracker.load();
  const modelReady = tracker.state === 'ready';
  const activeDetectionType = needsModel && modelReady ? detectionType : null;
  if (activeDetectionType !== previousTrackingType) {
    clearDetectionsExcept(activeDetectionType);
    previousTrackingType = activeDetectionType;
  }
  modelMessage.hidden = !needsModel || modelReady;
  modelStatus.textContent =
    tracker.state === 'failed' ? tracker.errorMessage : 'Takip modeli yükleniyor…';
  retryButton.hidden = tracker.state !== 'failed';
  retryButton.disabled = tracker.state !== 'failed';
  const players =
    activeDetectionType === 'hands'
      ? playerTracker.classify(handTracker.detect(video))
      : emptyPlayers();
  const poses =
    activeDetectionType === 'pose' ? poseTracker.detect(video) : [emptyPose(), emptyPose()];
  players[0].pose = poses[0];
  players[1].pose = poses[1];
  const faces =
    activeDetectionType === 'face' ? faceTracker.detect(video) : [emptyFace(), emptyFace()];
  players[0].face = faces[0];
  players[1].face = faces[1];
  playerTracker.drawRegions(canvas);
  manager.update(dt, players, canvas.width, canvas.height, rect, modelReady);
  if (manager.getState() === 'CALIBRATION' && modelReady) {
    calibration.hidden = false;
    calibrationStatus.textContent =
      !players[0].detected && !players[1].detected
        ? 'İki el de görünür olmalı.'
        : !players[0].detected
          ? 'Oyuncu 1 için sol tarafta el gösterin.'
          : !players[1].detected
            ? 'Oyuncu 2 için sağ tarafta el gösterin.'
            : '';
  } else calibration.hidden = true;
  const context = canvas.getContext('2d');
  if (context) {
    manager.draw(context);
    if (activeDetectionType === 'pose') poseTracker.draw(context, poses, rect);
    if (activeDetectionType === 'face') faceTracker.draw(context, faces, rect);
  }
  playerTracker.drawLandmarks(canvas, players, rect);
  finalActions.hidden = manager.getState() !== 'FINAL';
  frame = requestAnimationFrame(render);
};

app.querySelectorAll<HTMLButtonElement>('button').forEach((button) =>
  button.addEventListener('click', async () => {
    const action = button.dataset.action;
    if (action === 'games' || action === 'howto') return showInfo(action);
    if (action === 'update' && waitingWorker) {
      updateRequested = true;
      waitingWorker.postMessage({ type: 'ZEYGAME_ACTIVATE_UPDATE' });
      return;
    }
    if (action === 'home') {
      stopSession();
      finalActions.hidden = true;
      game.hidden = true;
      intro.hidden = false;
      q<HTMLButtonElement>('[data-action="start"]').disabled = false;
      return;
    }
    if (action === 'retry') {
      const tracker = requiredTracker();
      if (tracker.state === 'failed') {
        retryButton.disabled = true;
        void tracker.retry();
      }
      return;
    }
    if (action === 'replay') {
      audio.stopAll();
      audio.unlock();
      manager.reset();
      finalActions.hidden = true;
      manager.enterCalibration();
      previous = performance.now();
      return;
    }
    if (action !== 'start') return;
    button.disabled = true;
    const currentSession = ++session;
    audio.unlock();
    setLoading('Kamera izni bekleniyor…');
    try {
      await camera.start();
      if (currentSession !== session) return;
      intro.hidden = true;
      game.hidden = false;
      manager.reset();
      manager.enterCalibration();
      camera.resize();
      previous = performance.now();
      cancelAnimationFrame(frame);
      render();
    } catch (e) {
      if (currentSession !== session) return;
      status.textContent =
        e instanceof Object && 'message' in e
          ? String(e.message)
          : 'Kamera başlatılamadı. İzinleri kontrol edin.';
      button.disabled = false;
    }
  }),
);
window.addEventListener('resize', () => camera.resize());
window.addEventListener('orientationchange', () => camera.resize());
window.addEventListener('beforeunload', stopSession);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateRequested || updateReloaded) return;
    updateReloaded = true;
    window.location.reload();
  });
}

function showUpdate(worker: ServiceWorker): void {
  waitingWorker = worker;
  updateNotice.hidden = false;
}

function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);
  const workerUrl = new URL('sw.js', baseUrl);
  void navigator.serviceWorker
    .register(workerUrl, { scope: baseUrl.pathname })
    .then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        showUpdate(registration.waiting);
      }
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (
            installing.state === 'installed' &&
            registration.waiting &&
            navigator.serviceWorker.controller
          ) {
            showUpdate(registration.waiting);
          }
        });
      });
    })
    .catch(() => {
      /* Service worker is optional; the online application remains usable. */
    });
}

window.addEventListener('load', registerServiceWorker);
