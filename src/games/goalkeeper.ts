import { audio } from '../audio';
import { toCanvasPoint, type VideoRect } from '../coordinate-mapper';
import type { GameStartContext, MiniGame, PlayersTracking } from '../types';

type Ball = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  owner: 0 | 1;
  saved: boolean;
};

export class Goalkeeper implements MiniGame {
  readonly id = 'goalkeeper' as const;
  readonly name = 'Sanal Kaleci';
  readonly description = 'Kaleye gelen topları iki elinle kurtar.';
  readonly tracking = 'hands' as const;
  readonly duration = 25;
  private width = 0;
  private height = 0;
  private balls: Ball[] = [];
  private scores: [number, number] = [0, 0];
  private spawnTimer = 0;
  private solo = false;
  private localOwner: 0 | 1 = 0;
  private random = Math.random;

  start(width: number, height: number, context?: GameStartContext): void {
    this.width = width;
    this.height = height;
    this.balls = [];
    this.scores = [0, 0];
    this.spawnTimer = 0;
    this.solo = context?.activePlayers === 1;
    this.localOwner = context?.mode === 'online' && context.localPlayerSlot === 2 ? 1 : 0;
    this.random = context?.random ?? Math.random;
  }

  update(dt: number, players: PlayersTracking, rect: VideoRect): void {
    this.spawnTimer += dt;
    if (this.spawnTimer >= 1.25) {
      this.spawnTimer -= 1.25;
      this.spawn(this.solo ? this.localOwner : this.random() < 0.5 ? 0 : 1);
    }
    for (const ball of this.balls) {
      ball.x += ball.vx * dt;
      ball.y += ball.vy * dt;
      const blocked = players[ball.owner].hands.some((hand) => {
        const palm = hand[9] ?? hand[0];
        if (!palm) return false;
        const point = toCanvasPoint(palm, rect);
        return Math.hypot(point.x - ball.x, point.y - ball.y) <= ball.radius * 2.2;
      });
      if (blocked && !ball.saved) {
        ball.saved = true;
        this.scores[ball.owner] += 1;
        audio.tone(520, 0.08, 0.035, { fadeOut: false });
      }
    }
    this.balls = this.balls.filter((ball) => !ball.saved && ball.y < this.height + ball.radius);
  }

  draw(context: CanvasRenderingContext2D): void {
    context.save();
    context.strokeStyle = '#ffffffaa';
    context.lineWidth = 4;
    context.strokeRect(this.width * 0.08, this.height * 0.55, this.width * 0.84, this.height * 0.4);
    for (const ball of this.balls) {
      context.fillStyle = '#fff';
      context.strokeStyle = '#28233d';
      context.beginPath();
      context.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      context.fillStyle = '#28233d';
      context.beginPath();
      context.arc(ball.x, ball.y, ball.radius * 0.35, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  resize(width: number, height: number): void {
    if (!this.width || !this.height) return;
    const sx = width / this.width;
    const sy = height / this.height;
    for (const ball of this.balls) {
      ball.x *= sx;
      ball.y *= sy;
      ball.vx *= sx;
      ball.vy *= sy;
      ball.radius *= Math.min(sx, sy);
    }
    this.width = width;
    this.height = height;
  }

  getScores(): [number, number] {
    return [...this.scores];
  }

  private spawn(owner: 0 | 1): void {
    const left = this.solo ? 0.12 : owner === 0 ? 0.08 : 0.58;
    const right = this.solo ? 0.88 : owner === 0 ? 0.42 : 0.92;
    const targetX = this.width * (left + this.random() * (right - left));
    const startX = this.width * (left + this.random() * (right - left));
    const travelTime = 1.7;
    this.balls.push({
      owner,
      x: startX,
      y: -30,
      vx: (targetX - startX) / travelTime,
      vy: (this.height * 0.88) / travelTime,
      radius: Math.max(15, Math.min(this.width, this.height) * 0.038),
      saved: false,
    });
  }
}
