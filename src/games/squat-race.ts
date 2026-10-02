import type { MiniGame, PlayersTracking, NormalizedLandmark } from '../types';

const MIN_LANDMARK_CONFIDENCE = 0.55;
const REQUIRED_LANDMARKS = [23, 24, 25, 26, 27, 28] as const;
type SquatPhase = 'awaiting-standing' | 'standing' | 'down';

export class SquatRace implements MiniGame {
  readonly name = 'Çömelme Yarışı';
  readonly description = 'Çömelip kalkarak puan topla.';
  readonly tracking = 'pose' as const;
  private scores: [number, number] = [0, 0];
  private phases: [SquatPhase, SquatPhase] = ['awaiting-standing', 'awaiting-standing'];
  start(): void {
    this.scores = [0, 0];
    this.phases = ['awaiting-standing', 'awaiting-standing'];
  }
  update(_: number, players: PlayersTracking): void {
    players.forEach((p, i) => {
      const pose = p.pose?.pose;
      if (
        !p.pose?.detected ||
        !pose ||
        !REQUIRED_LANDMARKS.every((index) => this.isReliable(pose[index]))
      ) {
        this.phases[i] = 'awaiting-standing';
        return;
      }
      const left = this.angle(pose[23], pose[25], pose[27]),
        right = this.angle(pose[24], pose[26], pose[28]);
      const knee = Math.min(left, right);
      if (knee > 160) {
        if (this.phases[i] === 'down') this.scores[i]++;
        this.phases[i] = 'standing';
      } else if (knee < 110 && this.phases[i] === 'standing') {
        this.phases[i] = 'down';
      }
    });
  }
  draw(): void {}
  getScores(): [number, number] {
    return [...this.scores];
  }
  private isReliable(point: NormalizedLandmark | undefined): boolean {
    if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) return false;
    const confidence = [point.visibility, point.presence].filter((value) => value !== undefined);
    // An absent optional field is allowed, but absent confidence is not evidence of reliability.
    return (
      confidence.length > 0 &&
      confidence.every(
        (value) => Number.isFinite(value) && value >= MIN_LANDMARK_CONFIDENCE && value <= 1,
      )
    );
  }
  private angle(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark): number {
    const ab = Math.atan2(a.y - b.y, a.x - b.x),
      cb = Math.atan2(c.y - b.y, c.x - b.x);
    let d = Math.abs(((ab - cb) * 180) / Math.PI);
    return d > 180 ? 360 - d : d;
  }
}
