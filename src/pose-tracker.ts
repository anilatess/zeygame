import type { NormalizedLandmark, PlayerPose } from './types';
import { toCanvasPoint, type VideoRect } from './coordinate-mapper';

const URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const LINKS: ReadonlyArray<readonly [number, number]> = [
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
];
interface PoseResult {
  landmarks: NormalizedLandmark[][];
}
interface PoseInstance {
  detectForVideo(v: HTMLVideoElement, t: number): PoseResult;
  close(): void;
}
interface Vision {
  FilesetResolver: { forVisionTasks(p: string): Promise<unknown> };
  PoseLandmarker: { createFromOptions(v: unknown, o: unknown): Promise<PoseInstance> };
}

export class PoseTracker {
  private model: PoseInstance | null = null;
  private last = -1;
  private poses: PlayerPose[] = [
    { pose: null, detected: false },
    { pose: null, detected: false },
  ];
  async load(): Promise<void> {
    try {
      // @ts-ignore CDN runtime module
      const vision = (await import(/* @vite-ignore */ URL)) as Vision;
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
      this.model = await vision.PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL },
        runningMode: 'VIDEO',
        numPoses: 2,
        minPoseDetectionConfidence: 0.5,
        minPosePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
    } catch {
      throw new Error('Vücut takip modeli yüklenemedi. İnternet bağlantınızı kontrol edin.');
    }
  }
  detect(video: HTMLVideoElement): PlayerPose[] {
    if (!this.model || !video.videoWidth || video.currentTime === this.last) return this.poses;
    this.last = video.currentTime;
    const result = this.model.detectForVideo(video, performance.now());
    const previousPoses = this.poses;
    this.poses = [
      { pose: null, detected: false },
      { pose: null, detected: false },
    ];
    for (const raw of result.landmarks ?? []) {
      const center = raw[23] ?? raw[11];
      if (!center) continue;
      const index = 1 - center.x < 0.5 ? 0 : 1;
      if (this.poses[index].detected) continue;
      this.poses[index] = { pose: this.smooth(previousPoses[index].pose, raw), detected: true };
    }
    return this.poses;
  }
  draw(context: CanvasRenderingContext2D, poses: PlayerPose[], rect: VideoRect): void {
    poses.forEach((player, index) => {
      if (!player.pose) return;
      context.strokeStyle = index ? '#f472b6' : '#60a5fa';
      context.fillStyle = context.strokeStyle;
      context.lineWidth = Math.max(2, context.canvas.width / 400);
      for (const [a, b] of LINKS) {
        const start = toCanvasPoint(player.pose[a], rect);
        const end = toCanvasPoint(player.pose[b], rect);
        context.beginPath();
        context.moveTo(start.x, start.y);
        context.lineTo(end.x, end.y);
        context.stroke();
      }
      for (const landmark of player.pose) {
        const point = toCanvasPoint(landmark, rect);
        context.beginPath();
        context.arc(point.x, point.y, 4, 0, Math.PI * 2);
        context.fill();
      }
    });
  }
  close(): void {
    this.model?.close();
    this.model = null;
  }
  private smooth(
    previous: NormalizedLandmark[] | null,
    next: NormalizedLandmark[],
  ): NormalizedLandmark[] {
    if (!previous) return next;
    return next.map((l, i) => ({
      x: previous[i].x * 0.65 + l.x * 0.35,
      y: previous[i].y * 0.65 + l.y * 0.35,
      z: previous[i].z * 0.65 + l.z * 0.35,
    }));
  }
}
