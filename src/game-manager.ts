import type { VideoRect } from './coordinate-mapper';
import type { GameMode, GameState, MiniGame, PlayersTracking } from './types';
import { audio } from './audio';
import { calibrationReadiness } from './calibration';
import { createSeededRandom } from './random';

type Session = { mode: GameMode; games: readonly MiniGame[]; localPlayerSlot?: 1 | 2 };

export class GameManager {
  private state: GameState = 'MENU';
  private countdown = 3;
  private elapsed = 0;
  private resultTime = 0;
  private index = 0;
  private waitingForModel = false;
  private lastScores: [number, number] = [0, 0];
  private totals: [number, number] = [0, 0];
  private onlineStartDelay = 0;
  private onlineStartAt: number | null = null;
  private onlineNow: () => number = Date.now;
  private onlineRoundSeed: number | undefined;
  private onlineDurationMultiplier = 1;
  private remoteScores: [number | null, number | null] = [null, null];
  private activeSession: Session;
  constructor(private readonly games: MiniGame[]) {
    this.activeSession = { mode: 'party', games };
  }
  private get miniGame(): MiniGame {
    return this.activeSession.games[this.index];
  }
  getGames(): readonly MiniGame[] {
    return this.games;
  }
  getSession(): Readonly<Session> {
    return this.activeSession;
  }
  startParty(): void {
    this.activeSession = { mode: 'party', games: this.games };
    this.reset();
  }
  startSingle(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.games.length)
      throw new Error('Geçersiz oyun seçimi.');
    this.activeSession = { mode: 'single', games: [this.games[index]] };
    this.reset();
  }
  startSoloTest(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.games.length)
      throw new Error('GeÃ§ersiz oyun seÃ§imi.');
    this.activeSession = { mode: 'solo-test', games: [this.games[index]] };
    this.reset();
  }
  startOnline(
    index: number,
    localPlayerSlot: 1 | 2,
    roundSeed?: number,
    durationMultiplier = 1,
  ): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.games.length)
      throw new Error('Geçersiz oyun seçimi.');
    this.activeSession = { mode: 'online', games: [this.games[index]], localPlayerSlot };
    this.onlineRoundSeed = roundSeed;
    this.onlineDurationMultiplier = Math.max(0.5, Math.min(1.5, durationMultiplier));
    this.reset();
  }
  isSoloTest(): boolean {
    return this.activeSession.mode === 'solo-test';
  }
  isOnline(): boolean {
    return this.activeSession.mode === 'online';
  }
  getLocalPlayerSlot(): 1 | 2 {
    return this.activeSession.localPlayerSlot ?? 1;
  }
  getCalibrationReadiness(
    players: PlayersTracking,
    width?: number,
    height?: number,
    rect?: VideoRect,
  ): [boolean, boolean] {
    const readiness = calibrationReadiness(this.miniGame, players, width, height, rect);
    if (this.isSoloTest()) return [readiness[0], true];
    if (this.isOnline())
      return this.getLocalPlayerSlot() === 1 ? [readiness[0], true] : [true, readiness[1]];
    return readiness;
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
    return Math.max(0, Math.ceil(this.getRoundDuration() - this.elapsed));
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
    const scores = this.miniGame.getScores();
    if (!this.isOnline()) return scores;
    const remoteIndex = this.getLocalPlayerSlot() === 1 ? 1 : 0;
    if (this.remoteScores[remoteIndex] !== null)
      scores[remoteIndex] = this.remoteScores[remoteIndex] as number;
    return scores;
  }
  setOnlineRemoteScore(playerSlot: 1 | 2, score: number): void {
    if (!this.isOnline() || playerSlot === this.getLocalPlayerSlot() || !Number.isFinite(score))
      return;
    const index = playerSlot - 1;
    this.remoteScores[index] = Math.max(0, Math.trunc(score));
    if (this.state === 'RESULT' || this.state === 'FINAL')
      this.lastScores[index] = this.remoteScores[index] as number;
  }
  hasNextGame(): boolean {
    return this.index < this.activeSession.games.length - 1;
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
    this.onlineStartDelay = 0;
    this.onlineStartAt = null;
    if (!this.isOnline()) this.onlineDurationMultiplier = 1;
    this.remoteScores = [null, null];
  }
  enterCalibration(): void {
    this.state = 'CALIBRATION';
  }
  enterOnlineCalibration(
    startDelaySeconds: number,
    startAt?: number,
    now: () => number = Date.now,
  ): void {
    this.onlineStartDelay = Math.max(0, startDelaySeconds);
    this.onlineNow = now;
    this.onlineStartAt = startAt ?? now() + this.onlineStartDelay * 1000;
    this.state = 'CALIBRATION';
  }
  setOnlineRoundSeed(roundSeed: number | null): void {
    if (this.isOnline() && roundSeed !== null && Number.isInteger(roundSeed))
      this.onlineRoundSeed = roundSeed;
  }
  update(
    dt: number,
    players: PlayersTracking,
    width: number,
    height: number,
    rect: VideoRect,
    modelReady = true,
  ): void {
    if (this.isOnline() && this.onlineStartAt !== null) {
      this.updateOnline(dt, players, width, height, rect, modelReady);
      return;
    }
    if (this.isOnline() && (this.state === 'CALIBRATION' || this.state === 'COUNTDOWN'))
      this.onlineStartDelay = Math.max(0, this.onlineStartDelay - dt);
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
    const ready =
      this.state === 'CALIBRATION'
        ? this.getCalibrationReadiness(players, width, height, rect)
        : [false, false];
    if (this.state === 'CALIBRATION' && ready[0] && ready[1]) {
      this.state = 'COUNTDOWN';
      this.countdown = this.isOnline() ? this.onlineStartDelay : 3;
      audio.tone(600, 0.08);
    } else if (this.state === 'COUNTDOWN') {
      const old = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (Math.ceil(this.countdown) < old && this.countdown > 0) audio.tone(600, 0.08);
      if (this.countdown <= 0) {
        this.state = 'PLAYING';
        this.elapsed = 0;
        this.miniGame.start(width, height, {
          mode: this.activeSession.mode,
          activePlayers: this.isSoloTest() || this.isOnline() ? 1 : 2,
          localPlayerSlot: this.isOnline() ? this.getLocalPlayerSlot() : undefined,
          roundSeed: this.onlineRoundSeed,
          random:
            this.isOnline() && this.onlineRoundSeed !== undefined
              ? createSeededRandom(this.onlineRoundSeed)
              : undefined,
        });
      }
    } else if (this.state === 'PLAYING') {
      this.elapsed += dt;
      this.miniGame.update(dt, players, rect);
      if (this.elapsed >= this.getRoundDuration()) {
        this.lastScores = this.getLiveScores();
        this.totals[0] += this.lastScores[0];
        this.totals[1] += this.lastScores[1];
        this.state = 'RESULT';
        this.resultTime = 0;
      }
    } else if (this.state === 'RESULT') {
      this.resultTime += dt;
      if (this.resultTime >= 3 && this.hasNextGame()) {
        this.index++;
        this.state = 'COUNTDOWN';
        this.countdown = 3;
        audio.tone(600, 0.08);
      } else if (this.resultTime >= 5) this.state = 'FINAL';
    }
  }
  private updateOnline(
    dt: number,
    players: PlayersTracking,
    width: number,
    height: number,
    rect: VideoRect,
    modelReady: boolean,
  ): void {
    if (this.state === 'MENU' || this.state === 'FINAL') return;
    const elapsed = Math.max(0, (this.onlineNow() - this.onlineStartAt!) / 1000);
    const duration = this.getRoundDuration();
    this.countdown = Math.max(0, (this.onlineStartAt! - this.onlineNow()) / 1000);
    if (this.countdown > 0) {
      this.state = 'COUNTDOWN';
      return;
    }
    if (this.state === 'CALIBRATION' || this.state === 'COUNTDOWN') {
      this.state = 'PLAYING';
      this.miniGame.start(width, height, {
        mode: 'online',
        activePlayers: 1,
        localPlayerSlot: this.getLocalPlayerSlot(),
        roundSeed: this.onlineRoundSeed,
        random:
          this.onlineRoundSeed === undefined ? undefined : createSeededRandom(this.onlineRoundSeed),
      });
    }
    const targetElapsed = Math.min(duration, Math.max(this.elapsed, elapsed));
    const empty = (): PlayersTracking[number] => ({
      hands: [],
      pose: null,
      face: { face: null, blend: {}, detected: false },
      detected: false,
    });
    const absent: PlayersTracking = [empty(), empty()];
    // Advance missed time without applying today's observation to past frames.
    // Bounded steps preserve each game's timed rounds and spawning behavior.
    const gap = targetElapsed - this.elapsed;
    const observedTime = modelReady && elapsed < duration ? Math.min(0.1, Math.max(0, dt)) : 0;
    // Millisecond clock rounding is not tracking loss. Only a real frame gap
    // may inject absent observations (which reset squat/contact state).
    if (gap > 0.25 || !modelReady || elapsed >= duration) {
      while (targetElapsed - this.elapsed > observedTime + 0.000001) {
        const step = Math.min(0.1, targetElapsed - this.elapsed - observedTime);
        this.miniGame.update(step, absent, rect);
        this.elapsed += step;
      }
    }
    const remaining = targetElapsed - this.elapsed;
    if (remaining > 0)
      this.miniGame.update(remaining, modelReady && elapsed < duration ? players : absent, rect);
    this.elapsed = targetElapsed;
    if (elapsed >= duration) {
      this.lastScores = this.getLiveScores();
      this.totals = [...this.lastScores];
      this.state = 'FINAL';
    }
  }
  private getRoundDuration(): number {
    return (this.miniGame.duration ?? 20) * (this.isOnline() ? this.onlineDurationMultiplier : 1);
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
