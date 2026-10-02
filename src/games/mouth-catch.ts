import { toCanvasPoint, type VideoRect } from '../coordinate-mapper';
import type { GameStartContext, MiniGame, PlayersTracking } from '../types';
import { audio } from '../audio';

type Food = {
  x: number;
  y: number;
  size: number;
  speed: number;
  color: string;
  shape: 'circle' | 'diamond' | 'oval';
  kind: 'normal' | 'gold' | 'bomb';
  owner: 0 | 1;
  caught: boolean;
};
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
const COLORS = ['#60a5fa', '#f472b6'] as const;

export class MouthCatch implements MiniGame {
  readonly name = 'Ağızla Yakala';
  readonly description = 'Ağzını açarak yiyecekleri yakala.';
  readonly tracking = 'face' as const;
  readonly needs = 'face' as const;
  private width = 0;
  private height = 0;
  private foods: Food[] = [];
  private particles: Particle[] = [];
  private scores: [number, number] = [0, 0];
  private spawn = 0;
  private solo = false;
  start(width: number, height: number, context?: GameStartContext): void {
    this.width = width;
    this.height = height;
    this.foods = [];
    this.particles = [];
    this.scores = [0, 0];
    this.spawn = 0;
    this.solo = context?.activePlayers === 1;
  }
  update(dt: number, players: PlayersTracking, rect: VideoRect): void {
    this.spawn += dt;
    if (this.spawn > 0.65) {
      this.spawn = 0;
      this.addFood(this.solo ? 0 : Math.random() < 0.5 ? 0 : 1);
    }
    for (const food of this.foods) food.y += food.speed * dt;
    for (const particle of this.particles) {
      particle.life -= dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
    }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    this.foods = this.foods.filter((food) => !food.caught && food.y < this.height + food.size);
    players.forEach((player, index) => {
      const face = player.face;
      if (!face.detected || !face.face || (face.blend.jawOpen ?? 0) < 0.6) return;
      const nose = face.face[1] ?? face.face[0];
      if (!nose) return;
      const nosePoint = toCanvasPoint(nose, rect);
      const mouthX = nosePoint.x;
      // Preserve the existing approximation: 7% of the current Canvas height below the nose.
      const canvasHeight = rect.drawHeight + 2 * rect.offsetY;
      const mouthY = nosePoint.y + canvasHeight * 0.07;
      const tolerance = Math.max(28, this.width * 0.045);
      const food = this.foods.find(
        (item) =>
          item.owner === index &&
          Math.abs(item.x - mouthX) < item.size + tolerance &&
          Math.abs(item.y - mouthY) < item.size + tolerance,
      );
      if (!food) return;
      food.caught = true;
      this.burst(food.x, food.y, food.kind === 'bomb' ? '#f87171' : food.color);
      if (food.kind === 'bomb') {
        this.scores[index] = Math.max(0, this.scores[index] - 2);
        audio.tone(130, 0.2, 0.03, { fadeOut: false });
      } else if (food.kind === 'gold') {
        this.scores[index] += 2;
        audio.tone(820, 0.12, 0.03, { fadeOut: false });
      } else {
        this.scores[index] += 1;
        audio.tone(560, 0.08, 0.03, { fadeOut: false });
      }
    });
  }
  draw(context: CanvasRenderingContext2D): void {
    context.save();
    for (const food of this.foods) {
      context.save();
      context.translate(food.x, food.y);
      context.fillStyle =
        food.kind === 'bomb' ? '#111827' : food.kind === 'gold' ? '#facc15' : food.color;
      context.strokeStyle = food.kind === 'bomb' ? '#f87171' : '#ffffffcc';
      context.lineWidth = 3;
      context.beginPath();
      if (food.shape === 'diamond') {
        context.moveTo(0, -food.size);
        context.lineTo(food.size, 0);
        context.lineTo(0, food.size);
        context.lineTo(-food.size, 0);
      } else if (food.shape === 'oval')
        context.ellipse(0, 0, food.size * 0.7, food.size, 0, 0, Math.PI * 2);
      else context.arc(0, 0, food.size, 0, Math.PI * 2);
      context.fill();
      context.stroke();
      if (food.kind === 'bomb') {
        context.moveTo(-food.size * 0.5, -food.size * 0.5);
        context.lineTo(food.size * 0.5, food.size * 0.5);
        context.moveTo(food.size * 0.5, -food.size * 0.5);
        context.lineTo(-food.size * 0.5, food.size * 0.5);
        context.stroke();
      }
      context.restore();
    }
    for (const particle of this.particles) {
      context.globalAlpha = Math.max(0, particle.life * 4);
      context.fillStyle = particle.color;
      context.beginPath();
      context.arc(particle.x, particle.y, 4, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.restore();
  }
  getScores(): [number, number] {
    return [...this.scores];
  }
  private addFood(owner: 0 | 1): void {
    const size = Math.max(17, Math.min(this.width, this.height) * 0.04);
    const min = this.solo
      ? this.width * 0.08
      : owner === 0
        ? this.width * 0.08
        : this.width * 0.58;
    const max = this.solo
      ? this.width * 0.92
      : owner === 0
        ? this.width * 0.42
        : this.width * 0.92;
    const roll = Math.random();
    this.foods.push({
      owner,
      size,
      x: min + Math.random() * (max - min),
      y: -size,
      speed: this.height * (0.22 + Math.random() * 0.12),
      color: COLORS[owner],
      shape: ['circle', 'diamond', 'oval'][Math.floor(Math.random() * 3)] as Food['shape'],
      kind: roll < 0.14 ? 'bomb' : roll < 0.28 ? 'gold' : 'normal',
      caught: false,
    });
  }
  private burst(x: number, y: number, color: string): void {
    for (let i = 0; i < 8; i++)
      this.particles.push({
        x,
        y,
        vx: (Math.random() - 0.5) * this.width * 0.3,
        vy: (Math.random() - 0.5) * this.height * 0.3,
        life: 0.25,
        color,
      });
  }
}
