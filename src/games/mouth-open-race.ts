import type { MiniGame, PlayersTracking } from '../types';
import { audio } from '../audio';
export class MouthOpenRace implements MiniGame {
  readonly id = 'mouth-open-race' as const;
  readonly name = 'Ağız Açma Yarışı';
  readonly description = 'Ağzını aç, rakibinden fazla puan al.';
  readonly tracking = 'face' as const;
  private scores: [number, number] = [0, 0];
  private open = [false, false];
  start(): void {
    this.scores = [0, 0];
    this.open = [false, false];
  }
  update(_: number, players: PlayersTracking): void {
    players.forEach((p, i) => {
      const value = p.face.blend.jawOpen ?? 0;
      if (value > 0.6 && !this.open[i]) {
        this.open[i] = true;
        this.scores[i]++;
        audio.tone(520, 0.07, 0.03, { fadeOut: false });
      } else if (value <= 0.6) this.open[i] = false;
    });
  }
  draw(): void {}
  getScores(): [number, number] {
    return [...this.scores];
  }
}
