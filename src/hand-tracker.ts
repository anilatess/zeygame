import type { HandLandmark, HandTrackingError } from './types';

const TASKS_VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const HAND_MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20], [0, 17],
];

interface HandLandmarkerResult {
  landmarks: HandLandmark[][];
}

interface HandLandmarkerInstance {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): HandLandmarkerResult;
  close(): void;
}

interface VisionModule {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  HandLandmarker: { createFromOptions(vision: unknown, options: unknown): Promise<HandLandmarkerInstance> };
}

export class HandTracker {
  private landmarker: HandLandmarkerInstance | null = null;
  private lastVideoTime = -1;
  private lastLandmarks: HandLandmark[][] = [];

  async load(): Promise<void> {
    try {
      // The CDN module is intentionally loaded only after the user starts the game.
      // @ts-ignore MediaPipe is loaded from a pinned CDN URL at runtime.
      const vision = await import(/* @vite-ignore */ TASKS_VISION_CDN) as VisionModule;
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_CDN);
      this.landmarker = await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL_URL },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch {
      throw this.createError('model', 'El takip modeli yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.');
    }
  }

  detectAndDraw(video: HTMLVideoElement, canvas: HTMLCanvasElement): HandLandmark[][] {
    if (!this.landmarker || !video.videoWidth) return this.lastLandmarks;
    if (video.currentTime === this.lastVideoTime) return this.lastLandmarks;
    this.lastVideoTime = video.currentTime;

    const result = this.landmarker.detectForVideo(video, performance.now());
    this.lastLandmarks = result.landmarks ?? [];
    const context = canvas.getContext('2d');
    if (!context) return this.lastLandmarks;
    const { drawWidth, drawHeight, offsetX, offsetY } = this.getVideoRect(video, canvas);
    context.save();
    context.lineWidth = Math.max(2, canvas.width / 360);
    context.lineCap = 'round';
    context.strokeStyle = '#a5f3fc';
    context.fillStyle = '#fef08a';

    for (const hand of result.landmarks ?? []) {
      for (const [from, to] of CONNECTIONS) {
        const start = this.toCanvasPoint(hand[from], drawWidth, drawHeight, offsetX, offsetY);
        const end = this.toCanvasPoint(hand[to], drawWidth, drawHeight, offsetX, offsetY);
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
      }
      for (const landmark of hand) {
        const point = this.toCanvasPoint(landmark, drawWidth, drawHeight, offsetX, offsetY);
        context.beginPath();
        context.arc(point.x, point.y, Math.max(3, canvas.width / 180), 0, Math.PI * 2);
        context.fill();
      }
    }
    context.restore();
    return this.lastLandmarks;
  }

  close(): void {
    this.landmarker?.close();
    this.landmarker = null;
    this.lastVideoTime = -1;
    this.lastLandmarks = [];
  }

  private getVideoRect(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
    const scale = Math.max(canvas.width / video.videoWidth, canvas.height / video.videoHeight);
    const drawWidth = video.videoWidth * scale;
    const drawHeight = video.videoHeight * scale;
    return { drawWidth, drawHeight, offsetX: (canvas.width - drawWidth) / 2, offsetY: (canvas.height - drawHeight) / 2 };
  }

  private toCanvasPoint(landmark: HandLandmark, drawWidth: number, drawHeight: number, offsetX: number, offsetY: number) {
    return { x: offsetX + (1 - landmark.x) * drawWidth, y: offsetY + landmark.y * drawHeight };
  }

  private createError(status: HandTrackingError['status'], message: string): HandTrackingError {
    return { status, message };
  }
}
