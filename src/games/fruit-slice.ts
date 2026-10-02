import { toCanvasPoint, type VideoRect } from '../coordinate-mapper';
import type { MiniGame, PlayersTracking } from '../types';

type Fruit = { x: number; y: number; vx: number; vy: number; radius: number; color: string; shape: 'circle' | 'diamond' | 'oval'; bomb: boolean; sliced: boolean; owner: 0 | 1; age: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };
const COLORS = ['#60a5fa', '#f472b6'] as const;

export class FruitSlice implements MiniGame {
  readonly name = 'Meyve Kesme';
  readonly description = 'Meyveleri kes, bombalara dokunma.';
  readonly tracking = 'hands' as const;
  readonly needs = 'hands' as const;
  private width = 0; private height = 0; private fruits: Fruit[] = []; private particles: Particle[] = []; private scores: [number, number] = [0, 0]; private spawn = 0; private audio: AudioContext | null = null;

  start(width: number, height: number): void { this.width = width; this.height = height; this.fruits = []; this.particles = []; this.scores = [0, 0]; this.spawn = 0; }
  update(dt: number, players: PlayersTracking, rect: VideoRect): void {
    this.spawn += dt;
    if (this.spawn > 0.7) { this.spawn = 0; this.addFruit(Math.random() < 0.5 ? 0 : 1); }
    for (const fruit of this.fruits) { fruit.age += dt; fruit.x += fruit.vx * dt; fruit.y += fruit.vy * dt; }
    this.fruits = this.fruits.filter((fruit) => !fruit.sliced && fruit.age < 5 && fruit.y < this.height + fruit.radius);
    for (const particle of this.particles) { particle.life -= dt; particle.x += particle.vx * dt; particle.y += particle.vy * dt; }
    this.particles = this.particles.filter((particle) => particle.life > 0);
    players.forEach((player, index) => {
      for (const hand of player.hands) {
        const tip = hand[8];
        if (!tip) continue;
        const { x, y } = toCanvasPoint(tip, rect);
        const fruit = this.fruits.find(
          (item) => item.owner === index && Math.hypot(item.x - x, item.y - y) < item.radius,
        );
        if (fruit) {
          fruit.sliced = true;
          this.burst(fruit.x, fruit.y, fruit.bomb ? '#f87171' : fruit.color);
          if (fruit.bomb) {
            this.scores[index] = Math.max(0, this.scores[index] - 2);
            this.beep(120, 0.2);
          } else {
            this.scores[index] += 1;
            this.beep(620, 0.08);
          }
        }
      }
    });
  }
  draw(context: CanvasRenderingContext2D): void {
    context.save(); context.textAlign = 'center'; context.font = `700 ${Math.max(14, this.width / 42)}px system-ui`; context.fillStyle = '#fff'; context.fillText('Meyveleri kes, bombalara dokunma!', this.width / 2, Math.max(28, this.height * 0.13));
    for (const fruit of this.fruits) { context.save(); context.translate(fruit.x, fruit.y); context.rotate(fruit.age * 2); context.fillStyle = fruit.bomb ? '#111827' : fruit.color; context.strokeStyle = fruit.bomb ? '#f87171' : '#ffffffcc'; context.lineWidth = Math.max(2, this.width / 420); context.beginPath(); if (fruit.shape === 'diamond') { context.moveTo(0, -fruit.radius); context.lineTo(fruit.radius, 0); context.lineTo(0, fruit.radius); context.lineTo(-fruit.radius, 0); } else if (fruit.shape === 'oval') context.ellipse(0, 0, fruit.radius * 0.75, fruit.radius, 0, 0, Math.PI * 2); else context.arc(0, 0, fruit.radius, 0, Math.PI * 2); context.fill(); context.stroke(); if (fruit.bomb) { context.strokeStyle = '#fca5a5'; context.beginPath(); context.moveTo(-fruit.radius * .5, -fruit.radius * .5); context.lineTo(fruit.radius * .5, fruit.radius * .5); context.moveTo(fruit.radius * .5, -fruit.radius * .5); context.lineTo(-fruit.radius * .5, fruit.radius * .5); context.stroke(); } context.restore(); }
    context.restore();
    for (const particle of this.particles) { context.globalAlpha = Math.max(0, particle.life * 4); context.fillStyle = particle.color; context.beginPath(); context.arc(particle.x, particle.y, 4, 0, Math.PI * 2); context.fill(); }
    context.globalAlpha = 1;
  }
  getScores(): [number, number] { return [...this.scores]; }
  private addFruit(owner: 0 | 1): void { const radius = Math.max(18, Math.min(this.width, this.height) * 0.045); const left = owner === 0 ? this.width * 0.08 : this.width * 0.58; const right = owner === 0 ? this.width * 0.42 : this.width * 0.92; this.fruits.push({ owner, radius, x: left + Math.random() * (right - left), y: -radius, vx: (Math.random() - 0.5) * this.width * 0.25, vy: this.height * (0.25 + Math.random() * 0.2), color: ['#facc15', '#4ade80', '#fb923c', COLORS[owner]][Math.floor(Math.random() * 4)], shape: ['circle', 'diamond', 'oval'][Math.floor(Math.random() * 3)] as Fruit['shape'], bomb: Math.random() < 0.18, sliced: false, age: 0 }); }
  private beep(frequency: number, duration: number): void { try { this.audio ??= new AudioContext(); const oscillator = this.audio.createOscillator(); const gain = this.audio.createGain(); oscillator.frequency.value = frequency; gain.gain.value = 0.035; oscillator.connect(gain).connect(this.audio.destination); oscillator.start(); oscillator.stop(this.audio.currentTime + duration); } catch { /* Ses kullanılamazsa oyun devam eder. */ } }
  private burst(x: number, y: number, color: string): void { for (let i = 0; i < 8; i++) this.particles.push({ x, y, vx: (Math.random() - 0.5) * this.width * 0.35, vy: (Math.random() - 0.5) * this.height * 0.35, life: 0.25, color }); }
}
