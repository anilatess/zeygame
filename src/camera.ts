import type { CameraError } from './types';

export class CameraController {
  private stream: MediaStream | null = null;

  constructor(
    private readonly video: HTMLVideoElement,
    private readonly canvas: HTMLCanvasElement,
  ) {}

  async start(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw this.createError('error', 'Tarayıcınız kamera erişimini desteklemiyor.');
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      this.video.srcObject = this.stream;
      this.video.muted = true;
      this.video.playsInline = true;
      await this.video.play();
    } catch (error) {
      this.stop();
      const name = error instanceof DOMException ? error.name : '';
      if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
        throw this.createError('denied', 'Kamera izni reddedildi. Oyunu oynayabilmek için tarayıcı ayarlarından kamera izni verin.');
      }
      if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
        throw this.createError('missing', 'Bu cihazda kullanılabilir bir kamera bulunamadı.');
      }
      throw this.createError('error', 'Kamera başlatılamadı. Lütfen bağlantınızı ve tarayıcı izinlerini kontrol edin.');
    }
  }

  draw(): void {
    if (!this.video.videoWidth || !this.video.videoHeight) return;
    const context = this.canvas.getContext('2d');
    if (!context) return;
    const { width, height } = this.canvas;
    const scale = Math.max(width / this.video.videoWidth, height / this.video.videoHeight);
    const drawWidth = this.video.videoWidth * scale;
    const drawHeight = this.video.videoHeight * scale;
    context.save();
    context.clearRect(0, 0, width, height);
    context.translate(width, 0);
    context.scale(-1, 1);
    context.drawImage(this.video, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
    context.restore();
  }

  resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.floor(this.canvas.clientWidth * ratio);
    this.canvas.height = Math.floor(this.canvas.clientHeight * ratio);
    this.draw();
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  private createError(status: CameraError['status'], message: string): CameraError {
    return { status, message };
  }
}
