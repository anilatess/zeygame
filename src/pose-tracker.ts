import type { NormalizedLandmark, PlayerPose } from './types';

const URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const LINKS: ReadonlyArray<readonly [number, number]> = [[11, 12], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [24, 26], [26, 28]];
interface PoseResult { landmarks: NormalizedLandmark[][]; }
interface PoseInstance { detectForVideo(v: HTMLVideoElement, t: number): PoseResult; close(): void; }
interface Vision { FilesetResolver: { forVisionTasks(p: string): Promise<unknown> }; PoseLandmarker: { createFromOptions(v: unknown, o: unknown): Promise<PoseInstance> }; }

export class PoseTracker {
  private model: PoseInstance | null = null; private last = -1; private poses: PlayerPose[] = [{ pose: null, detected: false }, { pose: null, detected: false }];
  async load(): Promise<void> {
    try { // @ts-ignore CDN runtime module
      const vision = await import(/* @vite-ignore */ URL) as Vision;
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
      this.model = await vision.PoseLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL }, runningMode: 'VIDEO', numPoses: 2, minPoseDetectionConfidence: 0.5, minPosePresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
    } catch { throw new Error('Vücut takip modeli yüklenemedi. İnternet bağlantınızı kontrol edin.'); }
  }
  detect(video: HTMLVideoElement): PlayerPose[] {
    if (!this.model || !video.videoWidth || video.currentTime === this.last) return this.poses;
    this.last = video.currentTime; const result = this.model.detectForVideo(video, performance.now());
    this.poses = [{ pose: null, detected: false }, { pose: null, detected: false }];
    for (const raw of result.landmarks ?? []) { const center = raw[23] ?? raw[11]; if (!center) continue; const index = (1 - center.x) < 0.5 ? 0 : 1; this.poses[index] = { pose: this.smooth(this.poses[index].pose, raw), detected: true }; }
    return this.poses;
  }
  draw(context: CanvasRenderingContext2D, poses: PlayerPose[]): void { poses.forEach((p, i) => { if (!p.pose) return; context.strokeStyle = i ? '#f472b6' : '#60a5fa'; context.fillStyle = context.strokeStyle; context.lineWidth = Math.max(2, context.canvas.width / 400); for (const [a, b] of LINKS) { const x = (1 - p.pose[a].x) * context.canvas.width, y = p.pose[a].y * context.canvas.height, x2 = (1 - p.pose[b].x) * context.canvas.width, y2 = p.pose[b].y * context.canvas.height; context.beginPath(); context.moveTo(x, y); context.lineTo(x2, y2); context.stroke(); } for (const l of p.pose) { context.beginPath(); context.arc((1 - l.x) * context.canvas.width, l.y * context.canvas.height, 4, 0, Math.PI * 2); context.fill(); } }); }
  close(): void { this.model?.close(); this.model = null; }
  private smooth(previous: NormalizedLandmark[] | null, next: NormalizedLandmark[]): NormalizedLandmark[] { if (!previous) return next; return next.map((l, i) => ({ x: previous[i].x * 0.65 + l.x * 0.35, y: previous[i].y * 0.65 + l.y * 0.35, z: previous[i].z * 0.65 + l.z * 0.35 })); }
}
