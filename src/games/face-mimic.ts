import type { MiniGame, PlayersTracking } from '../types';
import { audio } from '../audio';

type FeatureRange = readonly [min: number, max: number];
type Expression = { name: string; icon: string; alternatives: Record<string, FeatureRange>[] };
type Round = { best: number };
const COLORS = ['#60a5fa', '#f472b6'] as const;
// Initial thresholds: tune with real-camera testing across players and lighting.
const EXPRESSION_RANGES = {
  active: [0.6, 1],
  raisedBrow: [0.5, 1],
  relaxed: [0, 0.3],
} as const;
export const EXPRESSIONS: Expression[] = [
  {
    name: 'Büyük gülümseme',
    icon: '😄',
    alternatives: [
      {
        mouthSmileLeft: EXPRESSION_RANGES.active,
        mouthSmileRight: EXPRESSION_RANGES.active,
      },
    ],
  },
  {
    name: 'Şaşkın yüz',
    icon: '😮',
    alternatives: [
      {
        jawOpen: EXPRESSION_RANGES.active,
        browInnerUp: EXPRESSION_RANGES.raisedBrow,
        mouthSmileLeft: EXPRESSION_RANGES.relaxed,
        mouthSmileRight: EXPRESSION_RANGES.relaxed,
      },
    ],
  },
  {
    name: 'Bir gözünü kapat, diğerini açık tut',
    icon: '😉',
    alternatives: [
      { eyeBlinkLeft: EXPRESSION_RANGES.active, eyeBlinkRight: EXPRESSION_RANGES.relaxed },
      { eyeBlinkLeft: EXPRESSION_RANGES.relaxed, eyeBlinkRight: EXPRESSION_RANGES.active },
    ],
  },
  {
    name: 'Öpücük ifadesi',
    icon: '😘',
    alternatives: [
      {
        mouthPucker: EXPRESSION_RANGES.active,
        mouthSmileLeft: EXPRESSION_RANGES.relaxed,
        mouthSmileRight: EXPRESSION_RANGES.relaxed,
      },
    ],
  },
];

function featureScore(value: number, [min, max]: FeatureRange): number {
  // These branches imply min > 0 or max < 1, so their divisors cannot be zero.
  if (value < min) return Math.max(0, Math.min(1, value / min));
  if (value > max) return Math.max(0, Math.min(1, (1 - value) / (1 - max)));
  return 1;
}

export function scoreExpression(
  actual: Record<string, number>,
  expression: Expression,
): { score: number; reliable: boolean } {
  let best = 0;
  if (!expression.alternatives.length) return { score: 0, reliable: false };
  for (const target of expression.alternatives) {
    const features = Object.entries(target);
    if (!features.length) return { score: 0, reliable: false };
    let weakest = 1;
    for (const [name, range] of features) {
      const value = actual[name];
      const [min, max] = range;
      if (
        !Object.prototype.hasOwnProperty.call(actual, name) ||
        !Number.isFinite(value) ||
        value < 0 ||
        value > 1 ||
        !Number.isFinite(min) ||
        !Number.isFinite(max) ||
        min < 0 ||
        max > 1 ||
        min > max
      ) {
        return { score: 0, reliable: false };
      }
      weakest = Math.min(weakest, featureScore(value, range));
    }
    best = Math.max(best, weakest);
  }
  return { score: best, reliable: true };
}

export class FaceMimic implements MiniGame {
  readonly name = 'Surat Taklidi';
  readonly description = 'Gösterilen yüz ifadesini taklit et.';
  readonly tracking = 'face' as const;
  readonly needs = 'face' as const;
  readonly duration = 24;
  private width = 0;
  private height = 0;
  private elapsed = 0;
  private round = 0;
  private rounds: [Round, Round] = [{ best: 0 }, { best: 0 }];
  private scores: [number, number] = [0, 0];

  start(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.elapsed = 0;
    this.round = 0;
    this.rounds = [{ best: 0 }, { best: 0 }];
    this.scores = [0, 0];
  }
  update(dt: number, players: PlayersTracking): void {
    const next = Math.min(3, Math.floor(this.elapsed / 6));
    if (next !== this.round) {
      this.addRoundScores();
      this.round = next;
      this.rounds = [{ best: 0 }, { best: 0 }];
      audio.tone(560, 0.08, 0.03, { fadeOut: false });
    }
    this.elapsed += dt;
    players.forEach((player, index) => {
      if (!player.face.detected || !player.face.blend) return;
      const result = scoreExpression(player.face.blend, EXPRESSIONS[this.round]);
      if (result.reliable)
        this.rounds[index].best = Math.max(this.rounds[index].best, result.score);
    });
  }
  draw(context: CanvasRenderingContext2D): void {
    const expression = EXPRESSIONS[this.round];
    context.save();
    context.textAlign = 'center';
    context.fillStyle = '#fff';
    context.font = `700 ${Math.max(14, this.width / 42)}px system-ui`;
    context.fillText(
      `${expression.icon}  Surat Taklidi • ${expression.name}`,
      this.width / 2,
      Math.max(28, this.height * 0.11),
    );
    context.font = `600 ${Math.max(13, this.width / 48)}px system-ui`;
    context.fillText(
      `Tur süresi: ${Math.max(0, Math.ceil(6 - (this.elapsed % 6)))} sn`,
      this.width / 2,
      this.height * 0.17,
    );
    context.font = `700 ${Math.max(34, this.width / 10)}px system-ui`;
    context.fillText(expression.icon, this.width / 2, this.height * 0.35);
    this.rounds.forEach((round, index) => {
      const x = index ? this.width * 0.75 : this.width * 0.25;
      context.fillStyle = COLORS[index];
      context.font = `700 ${Math.max(14, this.width / 40)}px system-ui`;
      context.fillText(
        `Oyuncu ${index + 1}: ${Math.round(round.best * 100)}% • ${this.scores[index]}`,
        x,
        this.height * 0.78,
      );
      context.strokeStyle = '#ffffff55';
      context.strokeRect(x - this.width * 0.16, this.height * 0.83, this.width * 0.32, 12);
      context.fillRect(
        x - this.width * 0.16,
        this.height * 0.83,
        this.width * 0.32 * round.best,
        12,
      );
    });
    context.restore();
  }
  getScores(): [number, number] {
    const result: [number, number] = [...this.scores];
    if (this.elapsed >= 24) {
      result[0] += Math.round(this.rounds[0].best * 10);
      result[1] += Math.round(this.rounds[1].best * 10);
    }
    return result;
  }
  private addRoundScores(): void {
    this.scores[0] += Math.round(this.rounds[0].best * 10);
    this.scores[1] += Math.round(this.rounds[1].best * 10);
  }
}
