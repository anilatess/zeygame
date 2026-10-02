import type { MiniGame, PlayersTracking } from '../types';
export class MouthOpenRace implements MiniGame {
  readonly name = 'Ağız Açma Yarışı';
  readonly description = 'Ağzını aç, rakibinden fazla puan al.';
  readonly tracking = 'face' as const; private scores: [number, number] = [0, 0]; private open = [false, false]; private audio: AudioContext | null = null;
  start(): void { this.scores = [0, 0]; this.open = [false, false]; }
  update(_: number, players: PlayersTracking): void { players.forEach((p, i) => { const value = p.face.blend.jawOpen ?? 0; if (value > 0.6 && !this.open[i]) { this.open[i] = true; this.scores[i]++; this.beep(); } else if (value <= 0.6) this.open[i] = false; }); }
  draw(): void {}
  getScores(): [number, number] { return [...this.scores]; }
  private beep(): void { try { this.audio ??= new AudioContext(); const o = this.audio.createOscillator(); const g = this.audio.createGain(); o.frequency.value = 520; g.gain.value = 0.03; o.connect(g).connect(this.audio.destination); o.start(); o.stop(this.audio.currentTime + 0.07); } catch { /* ses yoksa oyun sürer */ } }
}
