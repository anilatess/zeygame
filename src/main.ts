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
app.innerHTML = `<section class="app"><div class="menu-card"><header class="menu-top"><span class="eyebrow">İKİ KİŞİLİK KAMERA PARTİSİ</span><span class="game-count"></span></header><div class="menu-home"><div class="hero-copy"><h1>Zey<span>Game</span><i aria-hidden="true">✦</i></h1><h2>Kamera açık, <br>rekabet başlasın!</h2><p>Yan yana gelin, hareketlerinizle yarışın.</p><div class="menu-actions"><button class="primary" data-action="start">Partiyi Başlat ↗</button><button data-action="games">Oyunları Keşfet</button><button data-action="howto">Nasıl Oynanır?</button></div><p class="status" role="alert" aria-live="polite"></p></div><div class="party-art"><div class="art-caption">AYNI KAMERA. İKİ RAKİP.</div><div class="players"><div class="player blue"><div class="avatar" aria-hidden="true"><span></span></div><strong>Oyuncu 1</strong><small>Sol tarafta</small></div><span class="versus" aria-hidden="true">VS</span><div class="player pink"><div class="avatar" aria-hidden="true"><span></span></div><strong>Oyuncu 2</strong><small>Sağ tarafta</small></div></div><div class="art-footer">✦ Hareket sende, parti burada!</div></div></div><section class="info-panel" hidden aria-labelledby="info-title"><button data-action="back">← Ana Menü</button><div class="info-content"></div></section><footer class="menu-footer">2 oyuncu <span>•</span> 1 kamera <span>•</span> Bol rekabet</footer></div></section><section class="game" hidden><video autoplay muted playsinline></video><canvas></canvas><div class="camera-message" hidden></div><div class="model-message" hidden><p role="status" aria-live="polite"></p><button data-action="retry" hidden>Tekrar Dene</button><button data-action="home">Ana Menüye Dön</button></div><div class="calibration" hidden><div class="calibration-card"><div class="eyebrow">Kalibrasyon</div><h2>Oyuncular yerleşsin</h2><p>Oyuncu 1 sol tarafta durmalı</p><p>Oyuncu 2 sağ tarafta durmalı</p><p>İki oyuncunun elleri algılanmalı</p><p class="calibration-status"></p></div></div><div class="final-actions" hidden><button data-action="replay">Tekrar Oyna</button><button data-action="home">Ana Menüye Dön</button></div></section>`;
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
q<HTMLElement>('.game-count').textContent = `${manager.getGames().length} mini oyun`;
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

let infoTrigger: 'games' | 'howto' = 'games';
const illustrations: Record<string, string> = {
  'Buz Kırma':
    '<path d="m32 20 28-10 28 18-28 12Z M32 20v42l28 22 28-16V28 M60 40v44 M48 28l8 16-10 12 12 12"/>',
  'Meyve Kesme':
    '<path d="M61 28q-8-18 13-20 M62 28q-27-13-35 17t26 37q7-5 14 0 31-9 25-37T62 28Z M16 78l82-60"/>',
  'Çömelme Yarışı':
    '<circle cx="58" cy="22" r="10"/><path d="m55 36-18 18 24 8-15 22 M55 36l16 22 18-5 M61 62l18 20 M18 88h78"/>',
  'Zıplama Yarışı':
    '<circle cx="60" cy="20" r="10"/><path d="M60 34v24 M60 39 34 24 M60 39l25-17 M60 58 39 75 M60 58l24 14 M25 93l5-9 M60 96v-12 M94 93l-5-9"/>',
  'Dans Taklidi':
    '<circle cx="60" cy="20" r="10"/><path d="m60 34-7 26 24 23 M56 46 30 36 20 17 M56 46l26-12 15 9 M53 60 35 83 M93 15v13 M93 15l10-3"/>',
  'Ağız Açma Yarışı':
    '<rect x="28" y="12" width="64" height="80" rx="28"/><path d="M43 36h3 M74 36h3"/><ellipse cx="60" cy="65" rx="13" ry="18"/>',
  'Surat Taklidi':
    '<rect x="23" y="15" width="74" height="76" rx="30"/><path d="m37 38 12-5 M72 33l12 5 M38 49h9 M73 49h9 M42 64q18 24 36 0"/>',
  'Ağızla Yakala':
    '<path d="M25 61q35-30 70 0-35 49-70 0Z M39 62h42 M60 40V23 M50 32l10 10 10-10"/><circle cx="60" cy="12" r="7"/>',
};
function illustration(name: string): string {
  return (
    '<svg viewBox="0 0 120 104" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (illustrations[name] ?? '') +
    '</svg>'
  );
}
function closeInfo(): void {
  info.hidden = true;
  q<HTMLElement>('.menu-home').hidden = false;
  q<HTMLButtonElement>('[data-action="' + infoTrigger + '"]').focus();
}
function showInfo(kind: 'games' | 'howto'): void {
  infoTrigger = kind;
  q<HTMLElement>('.menu-home').hidden = true;
  info.hidden = false;
  const labels = { hands: 'El hareketleri', pose: 'Vücut hareketleri', face: 'Yüz ifadeleri' };
  const content = q<HTMLElement>('.info-content');
  if (kind === 'games') {
    content.innerHTML =
      '<div class="section-heading"><div class="eyebrow">PARTİDE NELER VAR?</div><h2 id="info-title" tabindex="-1">Oyunları Keşfet</h2><p>Her tur yeni bir meydan okuma. Hepsi aynı partide!</p></div><div class="game-grid">' +
      manager
        .getGames()
        .map(
          (miniGame) =>
            '<article class="game-card ' +
            miniGame.tracking +
            '"><div class="game-illustration">' +
            illustration(miniGame.name) +
            '</div><span class="tracking-label">' +
            labels[miniGame.needs ?? miniGame.tracking] +
            '</span><h3>' +
            miniGame.name +
            '</h3><p>' +
            miniGame.description.split(/(?<=\.)\s/)[0] +
            '</p></article>',
        )
        .join('') +
      '</div>';
  } else {
    content.innerHTML =
      '<div class="section-heading"><div class="eyebrow">HAZIR, YERLEŞ, OYNA!</div><h2 id="info-title" tabindex="-1">Nasıl Oynanır?</h2><p>Üç küçük adım, kocaman bir parti.</p></div><div class="steps"><article><span class="step-number">01</span><svg viewBox="0 0 120 104" aria-hidden="true"><rect x="32" y="10" width="56" height="68" rx="8"/><path d="M60 78v16 M36 94h48 M48 20h24"/></svg><h3>Cihazı sabitle.</h3></article><article><span class="step-number">02</span>' +
      illustration('Surat Taklidi') +
      '<h3>İki kişi kameraya yerleş.</h3><p><span class="blue-text">Oyuncu 1 solda</span><br><span class="pink-text">Oyuncu 2 sağda</span></p></article><article><span class="step-number">03</span>' +
      illustration('Dans Taklidi') +
      '<h3>Hareket et, puanları topla.</h3></article></div><div class="tips"><p>☀ İyi aydınlatılmış bir ortam kullan.</p><p>↔ Vücut oyunları için çevrende yeterli hareket alanı bırak.</p></div>';
  }
  q<HTMLElement>('#info-title').focus();
}
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !info.hidden && !intro.hidden) closeInfo();
});
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
    if (action === 'back') return closeInfo();
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
    if (action !== 'start' || button.disabled) return;
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
