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

const app = document.querySelector<HTMLDivElement>('#app'); if (!app) throw new Error('Uygulama kökü bulunamadı.');
app.innerHTML = `<section class="app"><div class="card menu-card"><div class="eyebrow">İKİ KİŞİLİK KAMERA PARTİSİ</div><h1>Hazır mısınız?</h1><p>Hareketlerinizi kullanarak üç mini oyunda yarışın.</p><p class="status" role="alert" aria-live="polite"></p><div class="menu-actions"><button data-action="start">Oyunu Başlat</button><button data-action="games">Oyunları Göster</button><button data-action="howto">Nasıl Oynanır?</button></div><div class="info-panel" hidden></div></div></section><section class="game" hidden><video autoplay muted playsinline></video><canvas></canvas><div class="camera-message" hidden></div><div class="calibration" hidden><div class="calibration-card"><div class="eyebrow">Kalibrasyon</div><h2>Oyuncular yerleşsin</h2><p>Oyuncu 1 sol tarafta durmalı</p><p>Oyuncu 2 sağ tarafta durmalı</p><p>İki oyuncunun elleri algılanmalı</p><p class="calibration-status"></p></div></div><div class="final-actions" hidden><button data-action="replay">Tekrar Oyna</button><button data-action="home">Ana Menüye Dön</button></div></section>`;

const q = <T extends Element>(s: string) => app.querySelector<T>(s)!;
const intro = q<HTMLElement>('.app'), game = q<HTMLElement>('.game'), status = q<HTMLParagraphElement>('.status'), info = q<HTMLElement>('.info-panel');
const video = q<HTMLVideoElement>('video'), canvas = q<HTMLCanvasElement>('canvas'), calibration = q<HTMLElement>('.calibration'), calibrationStatus = q<HTMLParagraphElement>('.calibration-status');
const cameraMessage = q<HTMLElement>('.camera-message'), finalActions = q<HTMLElement>('.final-actions');
const camera = new CameraController(video, canvas), handTracker = new HandTracker(), playerTracker = new PlayerTracker(), poseTracker = new PoseTracker(), faceTracker = new FaceTracker();
const manager = new GameManager([new IceBreaker(), new SquatRace(), new MouthOpenRace(), new FruitSlice(), new JumpRace(), new DanceMimic(), new FaceMimic(), new MouthCatch()]);
let poseReady = false, poseLoading = false, poseFailed = false, faceReady = false, faceLoading = false, faceFailed = false, frame = 0, previous = performance.now();

function showInfo(kind: 'games' | 'howto'): void { info.hidden = false; info.innerHTML = kind === 'games' ? `<h2>Mini oyunlar</h2>${manager.getGames().map((miniGame) => `<p><b>${miniGame.name}:</b> ${miniGame.description}</p>`).join('')}` : '<h2>Nasıl oynanır?</h2><p>Oyuncu 1 solda, Oyuncu 2 sağda durmalı.</p><p>Telefon veya laptop sabit konumda olmalı ve iyi ışık kullanılmalı.</p><p>Tüm vücut oyunlarında kameradan biraz uzakta durun.</p>'; }
function setLoading(text: string): void { status.textContent = `⏳ ${text}`; }

const render = () => {
  const now = performance.now(), dt = Math.min((now - previous) / 1000, 0.1); previous = now; camera.draw();
  if (!camera.isReady()) { cameraMessage.hidden = false; cameraMessage.textContent = 'Kamera görüntüsü hazırlanıyor…'; frame = requestAnimationFrame(render); return; }
  cameraMessage.hidden = true;
  const players = playerTracker.classify(handTracker.detectAndDraw(video, canvas));
  const type = manager.getTrackingType();
  if (type === 'pose' && !poseReady && !poseLoading) { poseLoading = true; setLoading('Vücut modeli yükleniyor…'); void poseTracker.load().then(() => { poseReady = true; }).catch(e => { status.textContent = e instanceof Error ? e.message : 'Vücut modeli yüklenemedi.'; }).finally(() => { poseLoading = false; }); }
  if (type === 'face' && !faceReady && !faceLoading) { faceLoading = true; setLoading('Yüz modeli yükleniyor…'); void faceTracker.load().then(() => { faceReady = true; }).catch(e => { status.textContent = e instanceof Error ? e.message : 'Yüz modeli yüklenemedi.'; }).finally(() => { faceLoading = false; }); }
  const poses = type === 'pose' ? poseTracker.detect(video) : [{ pose: null, detected: false }, { pose: null, detected: false }]; players[0].pose = poses[0]; players[1].pose = poses[1];
  const faces = type === 'face' ? faceTracker.detect(video) : [{ face: null, blend: {}, detected: false }, { face: null, blend: {}, detected: false }]; players[0].face = faces[0]; players[1].face = faces[1];
  playerTracker.drawRegions(canvas); manager.update(dt, players, canvas.width, canvas.height);
  if (manager.getState() === 'CALIBRATION') { calibration.hidden = false; calibrationStatus.textContent = !players[0].detected && !players[1].detected ? 'İki el de görünür olmalı.' : !players[0].detected ? 'Oyuncu 1 için sol tarafta el gösterin.' : !players[1].detected ? 'Oyuncu 2 için sağ tarafta el gösterin.' : ''; } else calibration.hidden = true;
  const context = canvas.getContext('2d'); if (context) { manager.draw(context); if (type === 'pose') poseTracker.draw(context, poses); if (type === 'face') faceTracker.draw(context, faces); }
  playerTracker.drawLandmarks(canvas, players, video.videoWidth, video.videoHeight); finalActions.hidden = manager.getState() !== 'FINAL';
  frame = requestAnimationFrame(render);
};

app.querySelectorAll<HTMLButtonElement>('button').forEach((button) => button.addEventListener('click', async () => {
  const action = button.dataset.action; if (action === 'games' || action === 'howto') return showInfo(action);
  if (action === 'home') { cancelAnimationFrame(frame); camera.stop(); handTracker.close(); poseTracker.close(); faceTracker.close(); poseReady = false; faceReady = false; manager.reset(); finalActions.hidden = true; game.hidden = true; intro.hidden = false; q<HTMLButtonElement>('[data-action="start"]').disabled = false; return; }
  if (action === 'replay') { manager.reset(); finalActions.hidden = true; manager.enterCalibration(); previous = performance.now(); return; }
  if (action !== 'start') return;
  button.disabled = true; audio.unlock(); setLoading('Kamera izni bekleniyor…');
  try { await camera.start(); setLoading('El takip modeli yükleniyor…'); await handTracker.load(); intro.hidden = true; game.hidden = false; manager.reset(); manager.enterCalibration(); camera.resize(); previous = performance.now(); cancelAnimationFrame(frame); render(); }
  catch (e) { status.textContent = e instanceof Object && 'message' in e ? String(e.message) : 'Kamera başlatılamadı. İzinleri kontrol edin.'; button.disabled = false; }
}));
window.addEventListener('resize', () => camera.resize()); window.addEventListener('orientationchange', () => camera.resize());
window.addEventListener('beforeunload', () => { cancelAnimationFrame(frame); handTracker.close(); poseTracker.close(); faceTracker.close(); camera.stop(); });
if ('serviceWorker' in navigator) window.addEventListener('load', () => { void navigator.serviceWorker.register('./sw.js'); });
