import type { MiniGame, PlayersTracking } from '../types';

type Food = { x: number; y: number; size: number; speed: number; color: string; shape: 'circle' | 'diamond' | 'oval'; kind: 'normal' | 'gold' | 'bomb'; owner: 0 | 1; caught: boolean };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
const COLORS = ['#60a5fa', '#f472b6'] as const;

export class MouthCatch implements MiniGame {
  readonly tracking = 'face' as const;
  readonly needs = 'face' as const;
  private width = 0; private height = 0; private foods: Food[] = []; private particles: Particle[] = []; private scores: [number, number] = [0, 0]; private spawn = 0; private audio: AudioContext | null = null;
  start(width: number, height: number): void { this.width = width; this.height = height; this.foods = []; this.particles = []; this.scores = [0, 0]; this.spawn = 0; }
  update(dt: number, players: PlayersTracking): void {
    this.spawn += dt; if (this.spawn > 0.65) { this.spawn = 0; this.addFood(Math.random() < 0.5 ? 0 : 1); }
    for (const food of this.foods) food.y += food.speed * dt;
    for (const particle of this.particles) { particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    this.foods = this.foods.filter((food) => !food.caught && food.y < this.height + food.size);
    players.forEach((player, index) => {
      const face = player.face; if (!face.detected || !face.face || (face.blend.jawOpen ?? 0) < 0.6) return;
      const nose = face.face[1] ?? face.face[0]; if (!nose) return;
      const mouthX = (1 - nose.x) * this.width; const mouthY = nose.y * this.height + this.height * 0.07; const tolerance = Math.max(28, this.width * 0.045);
      const food = this.foods.find((item) => item.owner === index && Math.abs(item.x - mouthX) < item.size + tolerance && Math.abs(item.y - mouthY) < item.size + tolerance);
      if (!food) return; food.caught = true; this.burst(food.x, food.y, food.kind === 'bomb' ? '#f87171' : food.color);
      if (food.kind === 'bomb') { this.scores[index] = Math.max(0, this.scores[index] - 2); this.beep(130, 0.2); }
      else if (food.kind === 'gold') { this.scores[index] += 2; this.beep(820, 0.12); }
      else { this.scores[index] += 1; this.beep(560, 0.08); }
    });
  }
  draw(context: CanvasRenderingContext2D): void {
    context.save(); context.textAlign = 'center'; context.fillStyle = '#fff'; context.font = `700 ${Math.max(14, this.width / 42)}px system-ui`; context.fillText('Ağzını aç ve yiyecekleri yakala!', this.width / 2, Math.max(28, this.height * 0.13));
    for (const food of this.foods) { context.save(); context.translate(food.x, food.y); context.fillStyle = food.kind === 'bomb' ? '#111827' : food.kind === 'gold' ? '#facc15' : food.color; context.strokeStyle = food.kind === 'bomb' ? '#f87171' : '#ffffffcc'; context.lineWidth = 3; context.beginPath(); if (food.shape === 'diamond') { context.moveTo(0, -food.size); context.lineTo(food.size, 0); context.lineTo(0, food.size); context.lineTo(-food.size, 0); } else if (food.shape === 'oval') context.ellipse(0, 0, food.size * .7, food.size, 0, 0, Math.PI * 2); else context.arc(0, 0, food.size, 0, Math.PI * 2); context.fill(); context.stroke(); if (food.kind === 'bomb') { context.moveTo(-food.size * .5, -food.size * .5); context.lineTo(food.size * .5, food.size * .5); context.moveTo(food.size * .5, -food.size * .5); context.lineTo(-food.size * .5, food.size * .5); context.stroke(); } context.restore(); }
    for (const particle of this.particles) { context.globalAlpha = Math.max(0, particle.life * 4); context.fillStyle = particle.color; context.beginPath(); context.arc(particle.x, particle.y, 4, 0, Math.PI * 2); context.fill(); } context.globalAlpha = 1; context.restore();
  }
  getScores(): [number, number] { return [...this.scores]; }
  private addFood(owner: 0 | 1): void { const size = Math.max(17, Math.min(this.width, this.height) * .04); const min = owner === 0 ? this.width * .08 : this.width * .58; const max = owner === 0 ? this.width * .42 : this.width * .92; const roll = Math.random(); this.foods.push({ owner, size, x: min + Math.random() * (max - min), y: -size, speed: this.height * (.22 + Math.random() * .12), color: COLORS[owner], shape: ['circle', 'diamond', 'oval'][Math.floor(Math.random() * 3)] as Food['shape'], kind: roll < .14 ? 'bomb' : roll < .28 ? 'gold' : 'normal', caught: false }); }
  private burst(x: number, y: number, color: string): void { for (let i = 0; i < 8; i++) this.particles.push({ x, y, vx: (Math.random() - .5) * this.width * .3, vy: (Math.random() - .5) * this.height * .3, life: .25, color }); }
  private beep(frequency: number, duration: number): void { try { this.audio ??= new AudioContext(); const o = this.audio.createOscillator(); const g = this.audio.createGain(); o.frequency.value = frequency; g.gain.value = .03; o.connect(g).connect(this.audio.destination); o.start(); o.stop(this.audio.currentTime + duration); } catch { /* ses yoksa oyun devam eder */ } }
}
