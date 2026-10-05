import { drawInstruction, drawSimilarity, canvasTheme } from '../canvas-ui';
import type { MiniGame, NormalizedLandmark, PlayersTracking } from '../types';
import type { VideoRect } from '../coordinate-mapper';
import { audio } from '../audio';

type AngleRange = readonly [number, number];
type DanceTarget = {
  name: string;
  instruction: string;
  arms: readonly [number, number];
  bentLegs: boolean;
};
const ROUND_SECONDS = 6;
const ROUND_COUNT = 4;
const POINTS_PER_ROUND = 10;
const MIN_CONFIDENCE = 0.55;
const MIN_SEGMENT_LENGTH = 1e-9;
const ARM_TOLERANCE = 15;
const ARM_FALLOFF = 30;
const STRAIGHT_RANGE: AngleRange = [160, 180];
const BENT_RANGE: AngleRange = [70, 110];
const JOINT_FALLOFF = 30;
const JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28] as const;
const LINKS = [
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  [11, 13],
  [13, 15],
  [12, 14],
  [14, 16],
  [23, 25],
  [25, 27],
  [24, 26],
  [26, 28],
] as const;
export const DANCE_TARGETS: readonly DanceTarget[] = [
  {
    name: 'T pozu',
    instruction: 'İki kolunu yana uzat; dik dur.',
    arms: [90, 90],
    bentLegs: false,
  },
  {
    name: 'Eller yukarı',
    instruction: 'İki kolunu yukarı uzat; dik dur.',
    arms: [180, 180],
    bentLegs: false,
  },
  {
    name: 'Çömelmiş poz',
    instruction: 'İki kolunu yana uzat; kalça ve dizlerini bük.',
    arms: [90, 90],
    bentLegs: true,
  },
  {
    name: 'Tek kol yukarı (sol)',
    instruction: 'Sol kolunu yukarı, sağ kolunu yana uzat; dik dur.',
    arms: [180, 90],
    bentLegs: false,
  },
];

export function scoreDanceAngle(value: number, range: AngleRange, falloff: number): number {
  if (
    !Number.isFinite(value) ||
    value < 0 ||
    value > 180 ||
    !range.every(Number.isFinite) ||
    range[0] < 0 ||
    range[1] > 180 ||
    range[0] > range[1] ||
    !Number.isFinite(falloff) ||
    falloff <= 0
  )
    return 0;
  const distance = Math.max(range[0] - value, value - range[1], 0);
  return Math.max(0, Math.min(1, 1 - distance / falloff));
}

function reliable(point: NormalizedLandmark | undefined): boolean {
  if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) return false;
  const confidence = [point.visibility, point.presence].filter((value) => value !== undefined);
  return (
    confidence.length > 0 &&
    confidence.every((value) => Number.isFinite(value) && value >= MIN_CONFIDENCE && value <= 1)
  );
}

function angle(
  a: NormalizedLandmark,
  b: NormalizedLandmark,
  c: NormalizedLandmark,
  aspect: number,
): number {
  const ax = (a.x - b.x) * aspect,
    ay = a.y - b.y;
  const cx = (c.x - b.x) * aspect,
    cy = c.y - b.y;
  if (
    ![ax, ay, cx, cy].every(Number.isFinite) ||
    Math.hypot(ax, ay) <= MIN_SEGMENT_LENGTH ||
    Math.hypot(cx, cy) <= MIN_SEGMENT_LENGTH
  )
    return NaN;
  const difference = Math.abs(((Math.atan2(ay, ax) - Math.atan2(cy, cx)) * 180) / Math.PI);
  return difference > 180 ? 360 - difference : difference;
}

export function scoreDancePose(
  pose: NormalizedLandmark[],
  targetIndex: number,
  rect: VideoRect,
): { score: number; reliable: boolean } {
  const invalid = { score: 0, reliable: false };
  const target = DANCE_TARGETS[targetIndex];
  if (
    !target ||
    !rect ||
    !Number.isFinite(rect.drawWidth) ||
    !Number.isFinite(rect.drawHeight) ||
    rect.drawWidth <= 0 ||
    rect.drawHeight <= 0 ||
    !JOINTS.every((index) => reliable(pose[index]))
  )
    return invalid;
  // Cover scaling is uniform: this ratio equals source video width / height,
  // regardless of Canvas size or crop offsets. Restore pixel-space geometry.
  const aspect = rect.drawWidth / rect.drawHeight;
  const features = [
    angle(pose[23], pose[11], pose[13], aspect),
    angle(pose[24], pose[12], pose[14], aspect),
    angle(pose[11], pose[13], pose[15], aspect),
    angle(pose[12], pose[14], pose[16], aspect),
    angle(pose[11], pose[23], pose[25], aspect),
    angle(pose[12], pose[24], pose[26], aspect),
    angle(pose[23], pose[25], pose[27], aspect),
    angle(pose[24], pose[26], pose[28], aspect),
  ];
  if (!features.every(Number.isFinite)) return invalid;
  const legRange = target.bentLegs ? BENT_RANGE : STRAIGHT_RANGE;
  const scores = features.map((value, index) => {
    if (index < 2) {
      const center = target.arms[index];
      return scoreDanceAngle(
        value,
        [Math.max(0, center - ARM_TOLERANCE), Math.min(180, center + ARM_TOLERANCE)],
        ARM_FALLOFF,
      );
    }
    return scoreDanceAngle(value, index < 4 ? STRAIGHT_RANGE : legRange, JOINT_FALLOFF);
  });
  // Every shoulder, elbow, hip and knee is mandatory; correct joints cannot
  // compensate for a clearly wrong arm or leg.
  return { score: Math.min(...scores), reliable: true };
}

export function danceTargetLandmarks(targetIndex: number): NormalizedLandmark[] {
  const target = DANCE_TARGETS[targetIndex];
  const pose: NormalizedLandmark[] = [];
  if (!target) return pose;
  const point = (x: number, y: number): NormalizedLandmark => ({ x, y, z: 0, visibility: 1 });
  for (const [side, shoulder, elbow, wrist, hip, knee, ankle, arm] of [
    [1, 11, 13, 15, 23, 25, 27, target.arms[0]],
    [-1, 12, 14, 16, 24, 26, 28, target.arms[1]],
  ]) {
    pose[shoulder] = point(side * 0.2, 0);
    const radians = (arm * Math.PI) / 180;
    pose[elbow] = point(side * (0.2 + Math.sin(radians) * 0.35), Math.cos(radians) * 0.35);
    pose[wrist] = point(side * (0.2 + Math.sin(radians) * 0.7), Math.cos(radians) * 0.7);
    pose[hip] = point(side * 0.2, 0.6);
    pose[knee] = point(side * (target.bentLegs ? 0.55 : 0.2), target.bentLegs ? 0.6 : 0.95);
    pose[ankle] = point(pose[knee].x, target.bentLegs ? 0.95 : 1.3);
  }
  return pose;
}

export class DanceMimic implements MiniGame {
  readonly id = 'dance-mimic' as const;
  readonly name = 'Dans Taklidi';
  readonly description = DANCE_TARGETS.map(
    (target) => `${target.name}: ${target.instruction}`,
  ).join(' ');
  readonly tracking = 'pose' as const;
  readonly needs = 'pose' as const;
  readonly calibrationLandmarks = JOINTS;
  readonly calibrationInstruction = 'İki tarafta omuz, kol, kalça ve bacaklar görünür olsun.';
  readonly duration = ROUND_SECONDS * ROUND_COUNT;
  private width = 0;
  private height = 0;
  private elapsed = 0;
  private round = 0;
  private best: [number, number] = [0, 0];
  private scores: [number, number] = [0, 0];
  start(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.elapsed = 0;
    this.round = 0;
    this.scores = [0, 0];
    this.best = [0, 0];
  }
  update(dt: number, players: PlayersTracking, rect: VideoRect): void {
    if (this.elapsed >= this.duration || !Number.isFinite(dt) || dt < 0) return;
    // The current frame belongs to the round active at the start of this update.
    players.forEach((player, i) => {
      if (!player.pose?.detected || !player.pose.pose) return;
      const result = scoreDancePose(player.pose.pose, this.round, rect);
      if (result.reliable) this.best[i] = Math.max(this.best[i], result.score);
    });
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    while (this.elapsed >= (this.round + 1) * ROUND_SECONDS && this.round < ROUND_COUNT) {
      this.scores[0] += Math.round(this.best[0] * POINTS_PER_ROUND);
      this.scores[1] += Math.round(this.best[1] * POINTS_PER_ROUND);
      this.best = [0, 0];
      this.round++;
      if (this.round < ROUND_COUNT) audio.tone(650, 0.08, 0.03, { fadeOut: false });
    }
  }
  draw(context: CanvasRenderingContext2D): void {
    const targetIndex = Math.min(this.round, ROUND_COUNT - 1);
    const target = DANCE_TARGETS[targetIndex];
    context.save();
    const layout = drawInstruction(
      context,
      this.width,
      this.height,
      target.name,
      target.instruction,
      `Tur süresi: ${Math.max(0, Math.ceil(ROUND_SECONDS - (this.elapsed % ROUND_SECONDS)))} sn`,
    );
    context.textAlign = 'center';
    const skeleton = danceTargetLandmarks(targetIndex);
    const minY = Math.min(...JOINTS.map((joint) => skeleton[joint].y));
    const maxY = Math.max(...JOINTS.map((joint) => skeleton[joint].y));
    const ceiling = layout.instructionBottom + 8 * layout.ratio;
    const floor = layout.bottom - 60 * layout.ratio;
    const scale = Math.min(
      this.width * 0.16,
      this.height * 0.21,
      (floor - ceiling) / (maxY - minY),
    );
    const targetY = Math.max(
      ceiling - minY * scale,
      Math.min(this.height * 0.43, floor - maxY * scale),
    );
    context.strokeStyle = canvasTheme().yellow;
    context.lineWidth = Math.max(2, this.width / 360);
    for (const [a, b] of LINKS) {
      context.beginPath();
      // Mirror the reference like the live camera: anatomical left is screen left.
      context.moveTo(this.width / 2 - skeleton[a].x * scale, targetY + skeleton[a].y * scale);
      context.lineTo(this.width / 2 - skeleton[b].x * scale, targetY + skeleton[b].y * scale);
      context.stroke();
    }
    drawSimilarity(context, this.width, this.height, this.best);
    context.restore();
  }
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }
  getScores(): [number, number] {
    return [...this.scores];
  }
}
