import type { NormalizedLandmark, PlayerFace } from './types';
const URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/vision_bundle.mjs';
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';
interface FaceResult { faceLandmarks: NormalizedLandmark[][]; faceBlendshapes: { categories: { categoryName: string; score: number }[] }[]; }
interface FaceModel { detectForVideo(v: HTMLVideoElement, t: number): FaceResult; close(): void; }
interface Vision { FilesetResolver: { forVisionTasks(p: string): Promise<unknown> }; FaceLandmarker: { createFromOptions(v: unknown, o: unknown): Promise<FaceModel> }; }
export class FaceTracker {
  private model: FaceModel | null = null; private last = -1; private faces: PlayerFace[] = [this.empty(), this.empty()];
  async load(): Promise<void> { try { // @ts-ignore CDN runtime module
    const vision = await import(/* @vite-ignore */ URL) as Vision; const fileset = await vision.FilesetResolver.forVisionTasks(WASM);
    this.model = await vision.FaceLandmarker.createFromOptions(fileset, { baseOptions: { modelAssetPath: MODEL }, runningMode: 'VIDEO', numFaces: 2, outputFaceBlendshapes: true, minFaceDetectionConfidence: 0.5, minFacePresenceConfidence: 0.5, minTrackingConfidence: 0.5 });
  } catch { throw new Error('Yüz takip modeli yüklenemedi. İnternet bağlantınızı kontrol edin.'); } }
  detect(video: HTMLVideoElement): PlayerFace[] { if (!this.model || !video.videoWidth || video.currentTime === this.last) return this.faces; this.last = video.currentTime; const result = this.model.detectForVideo(video, performance.now()); this.faces = [this.empty(), this.empty()]; (result.faceLandmarks ?? []).forEach((face, i) => { const center = face[1] ?? face[0]; const player = (1 - center.x) < 0.5 ? 0 : 1; const blend: Record<string, number> = {}; for (const c of result.faceBlendshapes?.[i]?.categories ?? []) blend[c.categoryName] = c.score; this.faces[player] = { face, blend, detected: true }; }); return this.faces; }
  draw(context: CanvasRenderingContext2D, faces: PlayerFace[]): void { faces.forEach((f, i) => { if (!f.face) return; context.fillStyle = i ? '#f472b6' : '#60a5fa'; for (const p of f.face.filter((_, n) => n % 8 === 0)) { context.beginPath(); context.arc((1 - p.x) * context.canvas.width, p.y * context.canvas.height, 3, 0, Math.PI * 2); context.fill(); } }); }
  close(): void { this.model?.close(); this.model = null; }
  private empty(): PlayerFace { return { face: null, blend: {}, detected: false }; }
}
