import type { MiniGame, PlayersTracking } from '../types';

type Expression = { name: string; icon: string; values: Record<string, number> };
type Round = { best: number };
const COLORS = ['#60a5fa', '#f472b6'] as const;
const FEATURES = ['jawOpen', 'mouthSmileLeft', 'mouthSmileRight', 'eyeBlinkLeft', 'eyeBlinkRight', 'browInnerUp', 'mouthPucker'];
const EXPRESSIONS: Expression[] = [
  { name: 'Büyük gülümseme', icon: '😄', values: { mouthSmileLeft: 0.9, mouthSmileRight: 0.9, jawOpen: 0.25 } },
  { name: 'Şaşkın yüz', icon: '😮', values: { jawOpen: 0.9, browInnerUp: 0.8, mouthSmileLeft: 0, mouthSmileRight: 0 } },
  { name: 'Göz kırpma', icon: '😉', values: { eyeBlinkLeft: 0.9, eyeBlinkRight: 0.15, jawOpen: 0.05 } },
  { name: 'Öpücük ifadesi', icon: '😘', values: { mouthPucker: 0.9, mouthSmileLeft: 0.05, mouthSmileRight: 0.05 } },
];

export class FaceMimic implements MiniGame {
  readonly name = 'Surat Taklidi';
  readonly description = 'Gösterilen yüz ifadesini taklit et.';
  readonly tracking = 'face' as const;
  readonly needs = 'face' as const;
  readonly duration = 24;
  private width = 0; private height = 0; private elapsed = 0; private round = 0; private rounds: [Round, Round] = [{ best: 0 }, { best: 0 }]; private scores: [number, number] = [0, 0]; private audio: AudioContext | null = null;

  start(width: number, height: number): void { this.width = width; this.height = height; this.elapsed = 0; this.round = 0; this.rounds = [{ best: 0 }, { best: 0 }]; this.scores = [0, 0]; }
  update(dt: number, players: PlayersTracking): void {
    const next = Math.min(3, Math.floor(this.elapsed / 6));
    if (next !== this.round) { this.addRoundScores(); this.round = next; this.rounds = [{ best: 0 }, { best: 0 }]; this.beep(); }
    this.elapsed += dt;
    players.forEach((player, index) => { if (!player.face.detected || !player.face.blend) return; const result = this.similarity(player.face.blend, EXPRESSIONS[this.round].values); if (result.reliable) this.rounds[index].best = Math.max(this.rounds[index].best, result.score); });
  }
  draw(context: CanvasRenderingContext2D): void {
    const expression = EXPRESSIONS[this.round]; context.save(); context.textAlign = 'center'; context.fillStyle = '#fff'; context.font = `700 ${Math.max(14, this.width / 42)}px system-ui`; context.fillText(`${expression.icon}  Surat Taklidi • ${expression.name}`, this.width / 2, Math.max(28, this.height * .11)); context.font = `600 ${Math.max(13, this.width / 48)}px system-ui`; context.fillText(`Tur süresi: ${Math.max(0, Math.ceil(6 - (this.elapsed % 6)))} sn`, this.width / 2, this.height * .17); context.font = `700 ${Math.max(34, this.width / 10)}px system-ui`; context.fillText(expression.icon, this.width / 2, this.height * .35); this.rounds.forEach((round, index) => { const x = index ? this.width * .75 : this.width * .25; context.fillStyle = COLORS[index]; context.font = `700 ${Math.max(14, this.width / 40)}px system-ui`; context.fillText(`Oyuncu ${index + 1}: ${Math.round(round.best * 100)}% • ${this.scores[index]}`, x, this.height * .78); context.strokeStyle = '#ffffff55'; context.strokeRect(x - this.width * .16, this.height * .83, this.width * .32, 12); context.fillRect(x - this.width * .16, this.height * .83, this.width * .32 * round.best, 12); }); context.restore();
  }
  getScores(): [number, number] { const result: [number, number] = [...this.scores]; if (this.elapsed >= 24) { result[0] += Math.round(this.rounds[0].best * 10); result[1] += Math.round(this.rounds[1].best * 10); } return result; }
  private similarity(actual: Record<string, number>, target: Record<string, number>): { score: number; reliable: boolean } { const relevant = Object.entries(target).filter(([, value]) => value > 0.1); if (!relevant.length) return { score: 0, reliable: false }; const active = relevant.some(([name]) => (actual[name] ?? 0) > 0.1); if (!active) return { score: 0, reliable: false }; return { score: relevant.reduce((sum, [name, value]) => sum + Math.min(1, (actual[name] ?? 0) / value), 0) / relevant.length, reliable: true }; }
  private addRoundScores(): void { this.scores[0] += Math.round(this.rounds[0].best * 10); this.scores[1] += Math.round(this.rounds[1].best * 10); }
  private beep(): void { try { this.audio ??= new AudioContext(); const oscillator = this.audio.createOscillator(); const gain = this.audio.createGain(); oscillator.frequency.value = 560; gain.gain.value = 0.03; oscillator.connect(gain).connect(this.audio.destination); oscillator.start(); oscillator.stop(this.audio.currentTime + 0.08); } catch { /* Ses yoksa oyun devam eder. */ } }
}
