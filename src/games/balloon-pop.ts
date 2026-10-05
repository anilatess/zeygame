import { audio } from '../audio';
import { toCanvasPoint, type VideoRect } from '../coordinate-mapper';
import type { GameStartContext, MiniGame, PlayersTracking } from '../types';

type Balloon = { x: number; y: number; radius: number; speed: number; owner: 0 | 1; color: string };

export class BalloonPop implements MiniGame {
  readonly id = 'balloon-pop' as const;
  readonly name = 'Balon Patlatma';
  readonly description = 'Yükselen balonları ellerinle yakala ve patlat.';
  readonly tracking = 'hands' as const;
  readonly duration = 24;
  private width = 0;
  private height = 0;
  private balloons: Balloon[] = [];
  private scores: [number, number] = [0, 0];
  private spawnTimer = 0;
  private solo = false;
  private localOwner: 0 | 1 = 0;
  private random = Math.random;

  start(width: number, height: number, context?: GameStartContext): void {
    this.width = width;
    this.height = height;
    this.balloons = [];
    this.scores = [0, 0];
    this.spawnTimer = 0;
    this.solo = context?.activePlayers === 1;
    this.localOwner = context?.mode === 'online' && context.localPlayerSlot === 2 ? 1 : 0;
    this.random = context?.random ?? Math.random;
  }

  update(dt: number, players: PlayersTracking, rect: VideoRect): void {
    this.spawnTimer += dt;
    while (this.spawnTimer >= 0.65) {
      this.spawnTimer -= 0.65;
      this.spawn(this.solo ? this.localOwner : this.random() < 0.5 ? 0 : 1);
    }
    for (const balloon of this.balloons) balloon.y -= balloon.speed * dt;
    for (const balloon of this.balloons) {
      const hit = players[balloon.owner].hands.some((hand) => {
        const palm = hand[9] ?? hand[8];
        if (!palm) return false;
        const point = toCanvasPoint(palm, rect);
        return Math.hypot(point.x - balloon.x, point.y - balloon.y) <= balloon.radius * 1.25;
      });
      if (!hit) continue;
      balloon.y = -this.height;
      this.scores[balloon.owner] += 1;
      audio.tone(760, 0.06, 0.03, { fadeOut: false });
    }
    this.balloons = this.balloons.filter((balloon) => balloon.y + balloon.radius > 0);
  }

  draw(context: CanvasRenderingContext2D): void {
    context.save();
    for (const balloon of this.balloons) {
      context.strokeStyle = '#ffffffcc';
      context.fillStyle = balloon.color;
      context.lineWidth = 3;
      context.beginPath();
      context.ellipse(
        balloon.x,
        balloon.y,
        balloon.radius * 0.8,
        balloon.radius,
        0,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.stroke();
      context.beginPath();
      context.moveTo(balloon.x, balloon.y + balloon.radius);
      context.quadraticCurveTo(
        balloon.x + balloon.radius * 0.4,
        balloon.y + balloon.radius * 1.6,
        balloon.x,
        balloon.y + balloon.radius * 2,
      );
      context.stroke();
    }
    context.restore();
  }

  resize(width: number, height: number): void {
    if (!this.width || !this.height) return;
    const sx = width / this.width;
    const sy = height / this.height;
    for (const balloon of this.balloons) {
      balloon.x *= sx;
      balloon.y *= sy;
      balloon.radius *= Math.min(sx, sy);
      balloon.speed *= sy;
    }
    this.width = width;
    this.height = height;
  }

  getScores(): [number, number] {
    return [...this.scores];
  }

  private spawn(owner: 0 | 1): void {
    const left = this.solo ? 0.1 : owner === 0 ? 0.08 : 0.58;
    const right = this.solo ? 0.9 : owner === 0 ? 0.42 : 0.92;
    const radius = Math.max(20, Math.min(this.width, this.height) * 0.055);
    const colors = ['#ff6b6b', '#ffd93d', '#6bcb77', '#6bcBef', '#b983ff'];
    this.balloons.push({
      owner,
      radius,
      x: this.width * (left + this.random() * (right - left)),
      y: this.height + radius,
      speed: this.height * (0.24 + this.random() * 0.14),
      color: colors[Math.floor(this.random() * colors.length)],
    });
  }
}
