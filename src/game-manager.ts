import type { GameState, MiniGame, PlayersTracking } from './types';

export class GameManager {
  private state: GameState = 'MENU';
  private countdown = 3;
  private elapsed = 0;
  private resultTime = 0;
  private lastScores: [number, number] = [0, 0];

  private index = 0;
  constructor(private readonly games: MiniGame[]) {}
  private get miniGame(): MiniGame { return this.games[this.index]; }
  getTrackingType(): 'hands' | 'pose' | 'face' { return this.miniGame.tracking; }

  getState(): GameState { return this.state; }
  getCountdown(): number { return Math.ceil(this.countdown); }
  getRemainingTime(): number { return Math.max(0, Math.ceil(20 - this.elapsed)); }
  getScores(): [number, number] { return [...this.lastScores]; }

  enterCalibration(): void { this.state = 'CALIBRATION'; }

  update(deltaTime: number, players: PlayersTracking, width: number, height: number): void {
    if (this.state === 'CALIBRATION' && players[0].detected && players[1].detected) {
      this.state = 'COUNTDOWN';
      this.countdown = 3;
      this.playBeep();
    } else if (this.state === 'COUNTDOWN') {
      const previous = Math.ceil(this.countdown);
      this.countdown -= deltaTime;
      if (Math.ceil(this.countdown) < previous && this.countdown > 0) this.playBeep();
      if (this.countdown <= 0) {
        this.state = 'PLAYING';
        this.elapsed = 0;
        this.miniGame.start(width, height);
      }
    } else if (this.state === 'PLAYING') {
      this.elapsed += deltaTime;
      this.miniGame.update(deltaTime, players);
      if (this.elapsed >= 20) {
        this.lastScores = this.miniGame.getScores();
        this.state = 'RESULT';
        this.resultTime = 0;
      }
    } else if (this.state === 'RESULT') {
      this.resultTime += deltaTime;
      if (this.resultTime >= 3 && this.index < this.games.length - 1) { this.index++; this.state = 'COUNTDOWN'; this.countdown = 3; this.playBeep(); }
      else if (this.resultTime >= 5) this.state = 'FINAL';
    }
  }

  draw(context: CanvasRenderingContext2D): void {
    if (this.state === 'PLAYING') this.miniGame.draw(context);
    context.save();
    context.textAlign = 'center';
    context.fillStyle = '#ffffff';
    context.font = `700 ${Math.max(18, context.canvas.width / 28)}px system-ui`;
    if (this.state === 'COUNTDOWN') context.fillText(`${this.getCountdown()}`, context.canvas.width / 2, context.canvas.height / 2);
    if (this.state === 'PLAYING') {
      context.fillText(`Süre: ${this.getRemainingTime()} sn`, context.canvas.width / 2, Math.max(34, context.canvas.height * 0.08));
      context.textAlign = 'left';
      context.fillStyle = '#60a5fa';
      context.fillText(`Oyuncu 1: ${this.miniGame.getScores()[0]}`, 20, Math.max(34, context.canvas.height * 0.08));
      context.textAlign = 'right';
      context.fillStyle = '#f472b6';
      context.fillText(`Oyuncu 2: ${this.miniGame.getScores()[1]}`, context.canvas.width - 20, Math.max(34, context.canvas.height * 0.08));
    }
    if (this.state === 'RESULT' || this.state === 'FINAL') {
      const [one, two] = this.lastScores;
      const title = one === two ? 'Berabere!' : one > two ? 'Oyuncu 1 kazandı!' : 'Oyuncu 2 kazandı!';
      context.fillText('Buz Kırma Sonucu', context.canvas.width / 2, context.canvas.height * 0.4);
      context.font = `700 ${Math.max(16, context.canvas.width / 38)}px system-ui`;
      context.fillText(`Oyuncu 1: ${one}  -  Oyuncu 2: ${two}`, context.canvas.width / 2, context.canvas.height * 0.5);
      context.fillText(title, context.canvas.width / 2, context.canvas.height * 0.6);
    }
    context.restore();
  }

  private playBeep(): void {
    try {
      const audio = new AudioContext();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();
      oscillator.frequency.value = 600;
      gain.gain.value = 0.04;
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + 0.08);
      oscillator.addEventListener('ended', () => void audio.close(), { once: true });
    } catch { /* Ses desteği yoksa oyun devam eder. */ }
  }
}
