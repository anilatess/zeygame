import type { MiniGame, PlayersTracking, NormalizedLandmark } from '../types';
export class SquatRace implements MiniGame {
  readonly name = 'Çömelme Yarışı';
  readonly description = 'Çömelip kalkarak puan topla.';
  readonly tracking = 'pose' as const;
  private scores: [number, number] = [0, 0];
  private down = [false, false];
  start(): void {
    this.scores = [0, 0];
    this.down = [false, false];
  }
  update(_: number, players: PlayersTracking): void {
    players.forEach((p, i) => {
      const pose = p.pose?.pose;
      if (!pose) return;
      const left = this.angle(pose[23], pose[25], pose[27]),
        right = this.angle(pose[24], pose[26], pose[28]);
      const knee = Math.min(left, right);
      if (knee < 110) this.down[i] = true;
      if (this.down[i] && knee > 160) {
        this.scores[i]++;
        this.down[i] = false;
      }
    });
  }
  draw(): void {}
  getScores(): [number, number] {
    return [...this.scores];
  }
  private angle(a: NormalizedLandmark, b: NormalizedLandmark, c: NormalizedLandmark): number {
    const ab = Math.atan2(a.y - b.y, a.x - b.x),
      cb = Math.atan2(c.y - b.y, c.x - b.x);
    let d = Math.abs(((ab - cb) * 180) / Math.PI);
    return d > 180 ? 360 - d : d;
  }
}
