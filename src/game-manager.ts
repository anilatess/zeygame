import type { VideoRect } from './coordinate-mapper';
import type { GameState, MiniGame, PlayersTracking } from './types';
import { audio } from './audio';

export class GameManager {
  private state: GameState = 'MENU';
  private countdown = 3;
  private elapsed = 0;
  private resultTime = 0;
  private index = 0;
  private waitingForModel = false;
  private lastScores: [number, number] = [0, 0];
  private totals: [number, number] = [0, 0];
  constructor(private readonly games: MiniGame[]) {}
  private get miniGame(): MiniGame {
    return this.games[this.index];
  }
  getGames(): readonly MiniGame[] {
    return this.games;
  }
  getTrackingType(): 'hands' | 'pose' | 'face' {
    return this.miniGame.needs ?? this.miniGame.tracking;
  }
  getState(): GameState {
    return this.state;
  }
  getCountdown(): number {
    return Math.ceil(this.countdown);
  }
  getRemainingTime(): number {
    return Math.max(0, Math.ceil((this.miniGame.duration ?? 20) - this.elapsed));
  }
  getScores(): [number, number] {
    return [...this.lastScores];
  }
  getTotals(): [number, number] {
    return [...this.totals];
  }
  getGameName(): string {
    return this.miniGame.name;
  }
  getCurrentGame(): MiniGame {
    return this.miniGame;
  }
  getLiveScores(): [number, number] {
    return this.miniGame.getScores();
  }
  hasNextGame(): boolean {
    return this.index < this.games.length - 1;
  }
  getResultCountdown(): number {
    return Math.max(0, Math.ceil(3 - this.resultTime));
  }
  reset(): void {
    this.state = 'MENU';
    this.waitingForModel = false;
    this.index = 0;
    this.elapsed = 0;
    this.resultTime = 0;
    this.lastScores = [0, 0];
    this.totals = [0, 0];
  }
  enterCalibration(): void {
    this.state = 'CALIBRATION';
  }
  update(
    dt: number,
    players: PlayersTracking,
    width: number,
    height: number,
    rect: VideoRect,
    modelReady = true,
  ): void {
    if (['CALIBRATION', 'COUNTDOWN', 'PLAYING'].includes(this.state)) {
      if (!modelReady) {
        this.waitingForModel = true;
        return;
      }
      if (this.waitingForModel) {
        dt = 0;
        this.waitingForModel = false;
      }
    }
    if (this.state === 'CALIBRATION' && players[0].detected && players[1].detected) {
      this.state = 'COUNTDOWN';
      this.countdown = 3;
      audio.tone(600, 0.08);
    } else if (this.state === 'COUNTDOWN') {
      const old = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (Math.ceil(this.countdown) < old && this.countdown > 0) audio.tone(600, 0.08);
      if (this.countdown <= 0) {
        this.state = 'PLAYING';
        this.elapsed = 0;
        this.miniGame.start(width, height);
      }
    } else if (this.state === 'PLAYING') {
      this.elapsed += dt;
      this.miniGame.update(dt, players, rect);
      if (this.elapsed >= (this.miniGame.duration ?? 20)) {
        this.lastScores = this.miniGame.getScores();
        this.totals[0] += this.lastScores[0];
        this.totals[1] += this.lastScores[1];
        this.state = 'RESULT';
        this.resultTime = 0;
      }
    } else if (this.state === 'RESULT') {
      this.resultTime += dt;
      if (this.resultTime >= 3 && this.index < this.games.length - 1) {
        this.index++;
        this.state = 'COUNTDOWN';
        this.countdown = 3;
        audio.tone(600, 0.08);
      } else if (this.resultTime >= 5) this.state = 'FINAL';
    }
  }
  draw(context: CanvasRenderingContext2D): void {
    if (this.state !== 'PLAYING') return;
    context.save();
    try {
      this.miniGame.draw(context);
    } finally {
      context.restore();
    }
  }
}
