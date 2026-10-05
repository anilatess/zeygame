import { audio } from '../audio';
import type { MiniGame, NormalizedLandmark, PlayersTracking } from '../types';
import type { VideoRect } from '../coordinate-mapper';

type MotionState = { previous: NormalizedLandmark[] | null; accumulated: number };

export class FreezeDance implements MiniGame {
  readonly id = 'freeze-dance' as const;
  readonly name = 'Don–Hareket Et';
  readonly description = 'Yeşilde dans et, kırmızıda heykel gibi don.';
  readonly tracking = 'pose' as const;
  readonly needs = 'pose' as const;
  readonly duration = 27;
  readonly calibrationLandmarks = [0, 11, 12, 15, 16, 23, 24] as const;
  readonly calibrationInstruction = 'Başın, ellerin ve kalçaların görünür olsun.';
  private width = 0;
  private height = 0;
  private phase: 'move' | 'freeze' = 'move';
  private phaseTime = 0;
  private scores: [number, number] = [0, 0];
  private states: [MotionState, MotionState] = [this.state(), this.state()];

  start(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.phase = 'move';
    this.phaseTime = 0;
    this.scores = [0, 0];
    this.states = [this.state(), this.state()];
  }

  update(dt: number, players: PlayersTracking, _rect: VideoRect): void {
    this.phaseTime += dt;
    const limit = this.phase === 'move' ? 3 : 2;
    if (this.phaseTime >= limit) {
      this.phaseTime -= limit;
      this.phase = this.phase === 'move' ? 'freeze' : 'move';
      audio.tone(this.phase === 'move' ? 760 : 180, 0.14, 0.04, { fadeOut: false });
    }
    players.forEach((player, index) => {
      const pose = player.pose?.pose;
      if (!pose) {
        this.states[index].previous = null;
        return;
      }
      const motion = this.motion(this.states[index].previous, pose);
      this.states[index].previous = pose.map((point) => ({ ...point }));
      this.states[index].accumulated += dt;
      if (this.states[index].accumulated < 0.2) return;
      this.states[index].accumulated = 0;
      if (this.phase === 'move' && motion > 0.012) this.scores[index] += 1;
      if (this.phase === 'freeze' && motion > 0.025)
        this.scores[index] = Math.max(0, this.scores[index] - 1);
    });
  }

  draw(context: CanvasRenderingContext2D): void {
    const moving = this.phase === 'move';
    context.save();
    context.fillStyle = moving ? '#6bcb77dd' : '#ff5d68dd';
    context.strokeStyle = '#28233d';
    context.lineWidth = Math.max(4, this.width / 180);
    context.beginPath();
    context.arc(
      this.width / 2,
      this.height * 0.25,
      Math.min(this.width, this.height) * 0.11,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.stroke();
    context.fillStyle = '#28233d';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `900 ${Math.max(26, this.width / 18)}px system-ui`;
    context.fillText(moving ? 'HAREKET ET!' : 'DON!', this.width / 2, this.height * 0.25);
    context.restore();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  getScores(): [number, number] {
    return [...this.scores];
  }

  private state(): MotionState {
    return { previous: null, accumulated: 0 };
  }

  private motion(previous: NormalizedLandmark[] | null, pose: NormalizedLandmark[]): number {
    if (!previous) return 0;
    const tracked = [0, 11, 12, 15, 16, 23, 24];
    const values = tracked.flatMap((index) => {
      const before = previous[index];
      const now = pose[index];
      return before && now ? [Math.hypot(now.x - before.x, now.y - before.y)] : [];
    });
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  }
}
