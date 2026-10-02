import { ModelLifecycle, type ModelLoader } from './model-lifecycle';
import type { HandLandmark } from './types';

const TASKS_VISION_CDN =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
const WASM_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const HAND_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

interface HandLandmarkerResult {
  landmarks: HandLandmark[][];
}

interface HandLandmarkerInstance {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): HandLandmarkerResult;
  close(): void;
}

interface VisionModule {
  FilesetResolver: { forVisionTasks(wasmPath: string): Promise<unknown> };
  HandLandmarker: {
    createFromOptions(vision: unknown, options: unknown): Promise<HandLandmarkerInstance>;
  };
}

export class HandTracker extends ModelLifecycle<HandLandmarkerInstance> {
  constructor(loader: ModelLoader<HandLandmarkerInstance> = HandTracker.createModel) {
    super(
      loader,
      'El takip modeli yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.',
    );
  }
  private lastVideoTime = -1;
  private lastLandmarks: HandLandmark[][] = [];

  private static async createModel(): Promise<HandLandmarkerInstance> {
    try {
      // The CDN module is intentionally loaded only after the user starts the game.
      // @ts-ignore MediaPipe is loaded from a pinned CDN URL at runtime.
      const vision = (await import(/* @vite-ignore */ TASKS_VISION_CDN)) as VisionModule;
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_CDN);
      return await vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL_URL },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch {
      throw new Error(
        'El takip modeli yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.',
      );
    }
  }

  detect(video: HTMLVideoElement): HandLandmark[][] {
    if (!this.model || !video.videoWidth) return this.lastLandmarks;
    if (video.currentTime === this.lastVideoTime) return this.lastLandmarks;
    this.lastVideoTime = video.currentTime;

    const result = this.model.detectForVideo(video, performance.now());
    this.lastLandmarks = result.landmarks ?? [];
    return this.lastLandmarks;
  }

  close(): void {
    super.close();
    this.lastVideoTime = -1;
    this.lastLandmarks = [];
  }
}
