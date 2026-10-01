import type { MiniGame, PlayersTracking } from '../types';

type IceCube = { x: number; y: number; size: number; hits: number; age: number; owner: 0 | 1 };

const PLAYER_COLORS = ['#60a5fa', '#f472b6'] as const;
const CUBE_LIFETIME = 4;

export class IceBreaker implements MiniGame {
  readonly tracking = 'hands' as const;
  private width = 0;
  private height = 0;
  private cubes: IceCube[] = [];
  private scores: [number, number] = [0, 0];
  private spawnTimer = 0;
  private audioContext: AudioContext | null = null;

  start(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.cubes = [];
    this.scores = [0, 0];
    this.spawnTimer = 0;
    this.spawnCube(0);
    this.spawnCube(1);
  }

  update(deltaTime: number, players: PlayersTracking): void {
    this.spawnTimer += deltaTime;
    if (this.spawnTimer >= 1.2) {
      this.spawnTimer = 0;
      this.spawnCube(Math.random() < 0.5 ? 0 : 1);
    }
    for (const cube of this.cubes) cube.age += deltaTime;
    this.cubes = this.cubes.filter((cube) => cube.age < CUBE_LIFETIME);

    players.forEach((player, playerIndex) => {
      for (const hand of player.hands) {
        const fingertip = hand[8];
        if (!fingertip) continue;
        const x = (1 - fingertip.x) * this.width;
        const y = fingertip.y * this.height;
        for (const cube of this.cubes) {
          if (cube.owner !== playerIndex || !this.isInside(cube, x, y)) continue;
          cube.hits += 1;
          this.playTone(420, 0.045);
          if (cube.hits >= 3) {
            this.scores[playerIndex as 0 | 1] += 1;
            this.playTone(760, 0.12);
            this.cubes = this.cubes.filter((candidate) => candidate !== cube);
          }
          break;
        }
      }
    });
  }

  draw(context: CanvasRenderingContext2D): void {
    context.save();
    for (const cube of this.cubes) {
      const half = cube.size / 2;
      context.fillStyle = `${PLAYER_COLORS[cube.owner]}dd`;
      context.strokeStyle = '#ffffffdd';
      context.lineWidth = Math.max(2, this.width / 360);
      context.fillRect(cube.x - half, cube.y - half, cube.size, cube.size);
      context.strokeRect(cube.x - half, cube.y - half, cube.size, cube.size);
      context.fillStyle = '#ffffff';
      context.font = `700 ${Math.max(14, this.width / 34)}px system-ui`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(`${cube.hits}/3`, cube.x, cube.y);
    }
    context.restore();
  }

  getScores(): [number, number] { return [...this.scores]; }

  private spawnCube(owner: 0 | 1): void {
    const minX = owner === 0 ? this.width * 0.08 : this.width * 0.58;
    const maxX = owner === 0 ? this.width * 0.42 : this.width * 0.92;
    const size = Math.max(42, Math.min(this.width, this.height) * 0.11);
    this.cubes.push({
      owner,
      size,
      x: minX + Math.random() * Math.max(1, maxX - minX),
      y: this.height * 0.2 + Math.random() * this.height * 0.6,
      hits: 0,
      age: 0,
    });
  }

  private isInside(cube: IceCube, x: number, y: number): boolean {
    return Math.abs(x - cube.x) <= cube.size / 2 && Math.abs(y - cube.y) <= cube.size / 2;
  }

  private playTone(frequency: number, duration: number): void {
    try {
      this.audioContext ??= new AudioContext();
      if (this.audioContext.state === 'suspended') void this.audioContext.resume();
      const oscillator = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = 'sine';
      gain.gain.setValueAtTime(0.04, this.audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
      oscillator.connect(gain).connect(this.audioContext.destination);
      oscillator.start();
      oscillator.stop(this.audioContext.currentTime + duration);
    } catch { /* Ses desteği yoksa oyun devam eder. */ }
  }
}
