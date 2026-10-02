import type { CameraError } from './types';
import { getCoverRect, type VideoRect } from './coordinate-mapper';

export class CameraController {
  private stream: MediaStream | null = null;
  private generation = 0;
  private cancelMetadata: (() => void) | null = null;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly canvas: HTMLCanvasElement,
  ) {}

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw this.createError('error', 'Tarayıcınız kamera erişimini desteklemiyor.');
    }

    this.stop();
    const generation = this.generation;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
        audio: false,
      });
      if (generation !== this.generation) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream = stream;
      this.video.srcObject = this.stream;
      this.video.muted = true;
      this.video.playsInline = true;
      await new Promise<void>((resolve) => {
        if (this.video.readyState >= HTMLMediaElement.HAVE_METADATA) resolve();
        else {
          const done = () => {
            this.video.removeEventListener('loadedmetadata', done);
            if (this.cancelMetadata === done) this.cancelMetadata = null;
            resolve();
          };
          this.cancelMetadata = done;
          this.video.addEventListener('loadedmetadata', done, { once: true });
        }
      });
      if (generation !== this.generation) return;
      await this.video.play();
    } catch (error) {
      if (generation !== this.generation) return;
      this.stop();
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        throw this.createError(
          'denied',
          'Kamera izni reddedildi. Oyunu oynayabilmek için tarayıcı ayarlarından kamera izni verin.',
        );
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        throw this.createError('missing', 'Bu cihazda kullanılabilir bir kamera bulunamadı.');
      }
      throw this.createError(
        'error',
        'Kamera başlatılamadı. Lütfen bağlantınızı ve tarayıcı izinlerini kontrol edin.',
      );
    }
  }

  draw(): VideoRect | null {
    const context = this.canvas.getContext('2d');
    if (!context) return null;
    if (!this.isReady() || !this.canvas.width || !this.canvas.height) {
      context.clearRect(0, 0, this.canvas.width, this.canvas.height);
      return null;
    }
    const { width, height } = this.canvas;
    const rect = getCoverRect(this.video.videoWidth, this.video.videoHeight, width, height);
    const { drawWidth, drawHeight, offsetX, offsetY } = rect;
    context.save();
    context.clearRect(0, 0, width, height);
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(this.video, offsetX, offsetY, drawWidth, drawHeight);
    context.restore();
    return rect;
  }

  isReady(): boolean {
    return (
      this.video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      this.video.videoWidth > 0 &&
      this.video.videoHeight > 0 &&
      Boolean(this.video.srcObject)
    );
  }

  resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(this.canvas.clientWidth * ratio);
    this.canvas.height = Math.floor(this.canvas.clientHeight * ratio);
    // The next render frame computes a fresh rect for every consumer.
  }

  stop(): void {
    this.generation++;
    this.cancelMetadata?.();
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  private createError(status: CameraError['status'], message: string): CameraError {
    return { status, message };
  }
}
