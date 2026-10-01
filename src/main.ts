import './styles.css';
import { CameraController } from './camera';
import { HandTracker } from './hand-tracker';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Uygulama kökü bulunamadı.');

app.innerHTML = `
  <section class="app" aria-label="Kamera partisi başlangıç ekranı">
    <div class="card">
      <div class="eyebrow">İki kişilik kamera kontrollü parti oyunu</div>
      <h1>Hazır mısınız?</h1>
      <p>Hareketlerinizi kameraya gösterin, arkadaşınızla birlikte eğlenceli mücadeleye başlayın.</p>
      <p class="status" role="alert" aria-live="polite"></p>
      <button type="button">Oyunu Başlat</button>
    </div>
  </section>
  <section class="game" hidden aria-label="Oyun alanı">
    <video autoplay muted playsinline></video>
    <canvas></canvas>
  </section>
`;

const startButton = app.querySelector<HTMLButtonElement>('button')!;
const status = app.querySelector<HTMLParagraphElement>('.status')!;
const intro = app.querySelector<HTMLElement>('.app')!;
const game = app.querySelector<HTMLElement>('.game')!;
const video = app.querySelector<HTMLVideoElement>('video')!;
const canvas = app.querySelector<HTMLCanvasElement>('canvas')!;
const camera = new CameraController(video, canvas);
const handTracker = new HandTracker();
let animationFrame = 0;

const render = () => {
  camera.draw();
  handTracker.detectAndDraw(video, canvas);
  animationFrame = requestAnimationFrame(render);
};

startButton.addEventListener('click', async () => {
  startButton.disabled = true;
  status.textContent = 'Kamera izni bekleniyor…';
  try {
    await camera.start();
    status.textContent = 'El takip modeli yükleniyor…';
    await handTracker.load();
    intro.hidden = true;
    game.hidden = false;
    camera.resize();
    cancelAnimationFrame(animationFrame);
    render();
  } catch (error) {
    status.textContent = error instanceof Object && 'message' in error ? String(error.message) : 'Beklenmeyen bir hata oluştu.';
    startButton.disabled = false;
  }
});

window.addEventListener('resize', () => camera.resize());
window.addEventListener('orientationchange', () => camera.resize());
window.addEventListener('beforeunload', () => { cancelAnimationFrame(animationFrame); handTracker.close(); camera.stop(); });
