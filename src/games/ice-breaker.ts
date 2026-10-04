import type { GameStartContext, MiniGame, PlayersTracking } from '../types';
import { audio } from '../audio';
import { toCanvasPoint, type VideoRect } from '../coordinate-mapper';

type IceCube = {
  x: number;
  y: number;
  size: number;
  hits: number;
  age: number;
  owner: 0 | 1;
  lastHit: number;
  touching: boolean;
  contactHandCount: number;
};

const PLAYER_COLORS = ['#60a5fa', '#f472b6'] as const;
const CUBE_LIFETIME = 4;
const HIT_COOLDOWN = 0.25;
const EXIT_MARGIN_RATIO = 0.1;

export class IceBreaker implements MiniGame {
  readonly id = 'ice-breaker' as const;
  readonly name = 'Buz Kırma';
  readonly description =
    'İşaret parmağınla küpe üç ayrı kez dokun; her dokunuştan sonra parmağını küpten çıkar.';
  readonly tracking = 'hands' as const;
  private width = 0;
  private height = 0;
  private cubes: IceCube[] = [];
  private scores: [number, number] = [0, 0];
  private spawnTimer = 0;
  private hitClock = 0;
  private solo = false;
  private localOwner: 0 | 1 = 0;
  private random = Math.random;

  start(width: number, height: number, context?: GameStartContext): void {
    this.width = width;
    this.height = height;
    this.cubes = [];
    this.scores = [0, 0];
    this.spawnTimer = 0;
    this.hitClock = 0;
    this.solo = context?.activePlayers === 1;
    this.localOwner = context?.mode === 'online' && context.localPlayerSlot === 2 ? 1 : 0;
    this.random = context?.random ?? Math.random;
    this.spawnCube(this.solo ? this.localOwner : 0);
    if (!this.solo) this.spawnCube(1);
  }

  update(deltaTime: number, players: PlayersTracking, rect: VideoRect): void {
    this.spawnTimer += deltaTime;
    this.hitClock += deltaTime;
    if (this.spawnTimer >= 1.2) {
      this.spawnTimer = 0;
      this.spawnCube(this.solo ? this.localOwner : this.random() < 0.5 ? 0 : 1);
    }
    for (const cube of this.cubes) cube.age += deltaTime;
    this.cubes = this.cubes.filter((cube) => cube.age < CUBE_LIFETIME);

    for (const cube of this.cubes) {
      const hands = players[cube.owner].hands;
      const points = hands.map((hand) => {
        const tip = hand[8];
        if (!tip || !Number.isFinite(tip.x) || !Number.isFinite(tip.y)) return null;
        const point = toCanvasPoint(tip, rect);
        return Number.isFinite(point.x) && Number.isFinite(point.y) ? point : null;
      });
      if (cube.touching) {
        // Hand order is not identity. A reduced hand count or invalid/missing
        // observation cannot prove that all previously involved fingers left.
        cube.contactHandCount = Math.max(cube.contactHandCount, hands.length);
        if (
          points.length >= cube.contactHandCount &&
          points.length > 0 &&
          points.every(
            (point) => point && !this.isInside(cube, point.x, point.y, EXIT_MARGIN_RATIO),
          )
        ) {
          cube.touching = false;
          cube.contactHandCount = 0;
        }
        continue;
      }
      if (!points.some((point) => point && this.isInside(cube, point.x, point.y))) continue;
      // Consume the entry even during cooldown: staying inside cannot turn a
      // rejected entry into a delayed hit.
      cube.touching = true;
      cube.contactHandCount = hands.length;
      if (this.hitClock - cube.lastHit < HIT_COOLDOWN) continue;
      cube.lastHit = this.hitClock;
      cube.hits += 1;
      audio.tone(420, 0.045);
      if (cube.hits >= 3) {
        this.scores[cube.owner] += 1;
        audio.tone(760, 0.12);
      }
    }
    this.cubes = this.cubes.filter((cube) => cube.hits < 3);
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

  getScores(): [number, number] {
    return [...this.scores];
  }

  private spawnCube(owner: 0 | 1): void {
    const minX = this.solo
      ? this.width * 0.08
      : owner === 0
        ? this.width * 0.08
        : this.width * 0.58;
    const maxX = this.solo
      ? this.width * 0.92
      : owner === 0
        ? this.width * 0.42
        : this.width * 0.92;
    const size = Math.max(42, Math.min(this.width, this.height) * 0.11);
    this.cubes.push({
      owner,
      size,
      x: minX + this.random() * Math.max(1, maxX - minX),
      y: this.height * 0.2 + this.random() * this.height * 0.6,
      hits: 0,
      age: 0,
      lastHit: -Infinity,
      touching: false,
      contactHandCount: 0,
    });
  }

  private isInside(cube: IceCube, x: number, y: number, marginRatio = 0): boolean {
    const half = cube.size / 2 + cube.size * marginRatio;
    return Math.abs(x - cube.x) <= half && Math.abs(y - cube.y) <= half;
  }
}
