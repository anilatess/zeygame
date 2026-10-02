import './styles.css';
import { GameUI, gameUiMarkup } from './game-ui';
import { CameraController } from './camera';
import { HandTracker } from './hand-tracker';
import { PlayerTracker, toSoloPlayers } from './player-tracker';
import { GameManager } from './game-manager';
import { createGames } from './games';
import { PoseTracker } from './pose-tracker';
import { FaceTracker } from './face-tracker';
import { audio } from './audio';
import type { PlayerFace, PlayerPose, PlayersTracking } from './types';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Uygulama kökü bulunamadı.');
app.innerHTML = `<section class="app"><div class="menu-card"><header class="menu-top"><span class="eyebrow">İKİ KİŞİLİK KAMERA PARTİSİ</span><span class="game-count"></span></header><div class="menu-home"><div class="hero-copy"><h1>Zey<span>Game</span><i aria-hidden="true">✦</i></h1><h2>Kamera açık, <br>rekabet başlasın!</h2><p>Yan yana gelin, hareketlerinizle yarışın.</p><div class="menu-actions"><button class="primary" data-action="start">Partiyi Başlat ↗</button><button data-action="select">Oyun Seç</button><button data-action="solo-test">Tek Kişilik Test</button><button data-action="games">Oyunları Keşfet</button><button data-action="howto">Nasıl Oynanır?</button></div><p class="status" role="alert" aria-live="polite"></p></div><div class="party-art"><div class="art-caption">AYNI KAMERA. İKİ RAKİP.</div><div class="players"><div class="player blue"><div class="avatar" aria-hidden="true"><span></span></div><strong>Oyuncu 1</strong><small>Sol tarafta</small></div><span class="versus" aria-hidden="true">VS</span><div class="player pink"><div class="avatar" aria-hidden="true"><span></span></div><strong>Oyuncu 2</strong><small>Sağ tarafta</small></div></div><div class="art-footer">✦ Hareket sende, parti burada!</div></div></div><section class="info-panel" hidden aria-labelledby="info-title"><button data-action="back">← Ana Menü</button><div class="info-content"></div></section><footer class="menu-footer">2 oyuncu <span>•</span> 1 kamera <span>•</span> Bol rekabet</footer></div></section><section class="game" tabindex="-1" hidden><video autoplay muted playsinline></video><canvas></canvas><div class="camera-message" hidden></div><div class="model-message" hidden><p role="status" aria-live="polite"></p><button data-action="retry" hidden>Tekrar Dene</button><button data-action="home">Ana Menüye Dön</button></div>${gameUiMarkup}<aside class="debug-panel" hidden aria-label="Solo test debug bilgileri"><strong>SOLO TEST</strong><span data-debug="game"></span><span data-debug="player"></span><span data-debug="model"></span><span data-debug="fps"></span><span data-debug="score"></span><span data-debug="state"></span><span data-debug="camera"></span></aside></section>`;
app.innerHTML +=
  '<div class="update-notice" role="status" aria-live="polite" hidden><span>Yeni sürüm hazır — Yenile</span><button data-action="update">Yenile</button></div>';

const q = <T extends Element>(s: string) => app.querySelector<T>(s)!;
const intro = q<HTMLElement>('.app'),
  game = q<HTMLElement>('.game'),
  status = q<HTMLParagraphElement>('.status'),
  info = q<HTMLElement>('.info-panel');
const video = q<HTMLVideoElement>('video'),
  canvas = q<HTMLCanvasElement>('canvas');

const cameraMessage = q<HTMLElement>('.camera-message'),
  finalActions = q<HTMLElement>('.final-actions');
const gameUI = new GameUI(app);
const camera = new CameraController(video, canvas),
  handTracker = new HandTracker(),
  playerTracker = new PlayerTracker(),
  poseTracker = new PoseTracker(),
  faceTracker = new FaceTracker();
const manager = new GameManager(createGames());
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
let fps = 0;
let previousTrackingType: ReturnType<GameManager['getTrackingType']> | null = null;

function requiredTracker() {
  return trackers[manager.getTrackingType()];
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
  starting = false;
  cancelAnimationFrame(frame);
  audio.stopAll();
  camera.stop();
  handTracker.close();
  poseTracker.close();
  faceTracker.close();
  previousTrackingType = null;
  manager.reset();
  gameUI.reset();
  modelMessage.hidden = true;
}

let starting = false;
let infoTrigger: 'games' | 'howto' | 'select' | 'solo-test' = 'games';
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
  if (starting) stopSession();
  status.textContent = '';
  info.hidden = true;
  q<HTMLElement>('.menu-home').hidden = false;
  q<HTMLButtonElement>('[data-action="' + infoTrigger + '"]').focus();
}
function showInfo(kind: 'games' | 'howto' | 'select' | 'solo-test'): void {
  infoTrigger = kind;
  q<HTMLElement>('.menu-home').hidden = true;
  info.hidden = false;
  const labels =
    kind === 'select' || kind === 'solo-test'
      ? { hands: 'El', pose: 'Vücut', face: 'Yüz' }
      : { hands: 'El hareketleri', pose: 'Vücut hareketleri', face: 'Yüz ifadeleri' };
  const content = q<HTMLElement>('.info-content');
  if (kind === 'games' || kind === 'select' || kind === 'solo-test') {
    content.innerHTML =
      (kind === 'solo-test'
        ? '<div class="section-heading"><div class="eyebrow">GELİŞTİRİCİ MODU</div><h2 id="info-title" tabindex="-1">Tek Kişilik Test</h2><p>Bir mini oyun seç; kamera yalnızca seni Player 1 olarak izlesin.</p></div><p class="selection-status" role="alert" aria-live="polite"></p>'
        : kind === 'select'
        ? '<div class="section-heading"><div class="eyebrow">İKİ KİŞİ, TEK MEYDAN OKUMA</div><h2 id="info-title" tabindex="-1">Oyun Seç</h2><p>Bir oyun seçin, yan yana yarışın.</p></div><p class="selection-status" role="alert" aria-live="polite"></p>'
        : '<div class="section-heading"><div class="eyebrow">PARTİDE NELER VAR?</div><h2 id="info-title" tabindex="-1">Oyunları Keşfet</h2><p>Her tur yeni bir meydan okuma. Hepsi aynı partide!</p></div>') +
      '<div class="game-grid">' +
      manager
        .getGames()
        .map(
          (miniGame, index) =>
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
            '</p>' +
            (kind === 'select' || kind === 'solo-test'
              ? selectionButton(index, kind === 'solo-test')
              : '') +
            '</article>',
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
  content
    .querySelectorAll<HTMLButtonElement>('[data-action="play-selected"]')
    .forEach((button) =>
      button.addEventListener(
        'click',
        () =>
          void startSession(
            button,
            Number(button.dataset.gameIndex),
            button.dataset.solo === 'true',
          ),
      ),
    );
  q<HTMLElement>('#info-title').focus();
}
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !info.hidden && !intro.hidden) closeInfo();
});
function setLoading(text: string): void {
  status.textContent = `⏳ ${text}`;
  const selectionStatus = app!.querySelector<HTMLElement>('.selection-status');
  if (selectionStatus) selectionStatus.textContent = status.textContent;
}

function selectionButton(index: number, solo = false): string {
  const label = solo ? 'Solo Testi Başlat' : 'Bu Oyunu Oyna';
  return `<button data-action="play-selected" data-game-index="${index}" data-solo="${solo}" aria-label="${manager.getGames()[index].name} — ${label}">${label}</button>`;
}

async function startSession(
  button: HTMLButtonElement,
  selectedIndex?: number,
  solo = false,
): Promise<void> {
  if (starting || button.disabled || manager.getState() !== 'MENU') return;
  if (selectedIndex === undefined) manager.startParty();
  else if (solo) manager.startSoloTest(selectedIndex);
  else manager.startSingle(selectedIndex);
  starting = true;
  button.disabled = true;
  const currentSession = ++session;
  audio.unlock();
  setLoading('Kamera izni bekleniyor…');
  try {
    await camera.start();
    if (currentSession !== session) return;
    intro.hidden = true;
    game.hidden = false;
    game.classList?.toggle('solo-test', manager.isSoloTest());
    game.focus();
    manager.enterCalibration();
    camera.resize();
    previous = performance.now();
    cancelAnimationFrame(frame);
    render();
  } catch (error) {
    if (currentSession !== session) return;
    audio.stopAll();
    const message =
      error instanceof Object && 'message' in error
        ? String(error.message)
        : 'Kamera başlatılamadı. İzinleri kontrol edin.';
    status.textContent = message;
    const selectionStatus = app!.querySelector<HTMLElement>('.selection-status');
    if (selectionStatus) selectionStatus.textContent = message;
  } finally {
    button.disabled = false;
    if (currentSession === session) starting = false;
  }
}

const render = () => {
  const now = performance.now(),
    dt = Math.min((now - previous) / 1000, 0.1);
  fps = fps ? fps * 0.9 + (dt > 0 ? 1 / dt : 0) * 0.1 : dt > 0 ? 1 / dt : 0;
  previous = now;
  const rect = camera.draw();
  if (!rect) {
    gameUI.reset();
    cameraMessage.hidden = false;
    cameraMessage.textContent = 'Kamera görüntüsü hazırlanıyor…';
    frame = requestAnimationFrame(render);
    return;
  }
  cameraMessage.hidden = true;
  const state = manager.getState();
  const type = manager.getTrackingType();
  const detectionType = type;
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
  let players =
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
  if (manager.isSoloTest()) players = toSoloPlayers(players);
  if (!manager.isSoloTest()) playerTracker.drawRegions(canvas);
  manager.update(dt, players, canvas.width, canvas.height, rect, modelReady);
  gameUI.render(
    manager,
    players,
    requiredTracker().state === 'ready',
    manager.getCalibrationReadiness(players, canvas.width, canvas.height, rect),
  );
  const context = canvas.getContext('2d');
  if (context) {
    if (activeDetectionType === 'pose') poseTracker.draw(context, poses, rect);
    if (activeDetectionType === 'face') faceTracker.draw(context, faces, rect);
  }
  playerTracker.drawLandmarks(canvas, players, rect);
  if (context && (!needsModel || modelReady)) manager.draw(context);
  renderDebug(players, modelReady);
  finalActions.hidden = manager.getState() !== 'FINAL';
  frame = requestAnimationFrame(render);
};

app.querySelectorAll<HTMLButtonElement>('button').forEach((button) =>
  button.addEventListener('click', async () => {
    const action = button.dataset.action;
    if (action === 'back') return closeInfo();
    if (action === 'games' || action === 'howto' || action === 'select' || action === 'solo-test')
      return showInfo(action);
    if (action === 'update' && waitingWorker) {
      updateRequested = true;
      waitingWorker.postMessage({ type: 'ZEYGAME_ACTIVATE_UPDATE' });
      return;
    }
    if (action === 'home' || action === 'choose-another') {
      const selectedIndex = manager.getGames().indexOf(manager.getCurrentGame());
      stopSession();
      finalActions.hidden = true;
      game.hidden = true;
      intro.hidden = false;
      q<HTMLButtonElement>('[data-action="start"]').disabled = false;
      info.hidden = true;
      q<HTMLElement>('.menu-home').hidden = false;
      status.textContent = '';
      if (action === 'choose-another') {
        showInfo(manager.getSession().mode === 'solo-test' ? 'solo-test' : 'select');
        q<HTMLButtonElement>('[data-game-index="' + selectedIndex + '"]').focus();
      } else q<HTMLButtonElement>('[data-action="start"]').focus();
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
      gameUI.reset();
      game.focus();
      previous = performance.now();
      return;
    }
    if (action === 'start') await startSession(button);
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

function renderDebug(players: PlayersTracking, modelReady: boolean): void {
  const panel = q<HTMLElement>('.debug-panel');
  panel.hidden = !manager.isSoloTest();
  if (panel.hidden) return;
  const labels = {
    hands: 'MediaPipe Hand Landmarker',
    pose: 'MediaPipe Pose Landmarker Lite',
    face: 'MediaPipe Face Landmarker',
  };
  const set = (key: string, value: string) => {
    q<HTMLElement>(`[data-debug="${key}"]`).textContent = value;
  };
  const detected =
    players[0].detected || players[0].pose?.detected || players[0].face.detected;
  set('game', `Oyun: ${manager.getGameName()}`);
  set('player', `Player 1: ${detected ? 'detected' : 'not detected'}`);
  set(
    'model',
    `Model: ${labels[manager.getTrackingType()]} (${modelReady ? 'ready' : requiredTracker().state})`,
  );
  set('fps', `FPS: ${Math.round(fps)}`);
  set('score', `Skor: ${manager.getLiveScores()[0]}`);
  set('state', `State: ${manager.getState()}`);
  set('camera', `Kamera: ${camera.isReady?.() ?? true ? 'active' : 'waiting'}`);
}
