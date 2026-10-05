import { drawInstruction, overlayLayout, panel, canvasTheme } from '../canvas-ui';
import type { MiniGame, PlayersTracking, NormalizedLandmark } from '../types';
import { audio } from '../audio';

type JumpState = { samples: number[]; reference: number | null; jumping: boolean; label: string };

export class JumpRace implements MiniGame {
  readonly id = 'jump-race' as const;
  readonly name = 'Zıplama Yarışı';
  readonly description = 'Zıplayarak puan topla.';
  readonly tracking = 'pose' as const;
  readonly needs = 'pose' as const;
  readonly calibrationLandmarks = [23, 24] as const;
  readonly calibrationInstruction = 'İki tarafta kalçalar görünür olsun. Dik durun.';
  private width = 0;
  private height = 0;
  private scores: [number, number] = [0, 0];
  private states: [JumpState, JumpState] = [this.createState(), this.createState()];

  start(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.scores = [0, 0];
    this.states = [this.createState(), this.createState()];
  }

  update(_: number, players: PlayersTracking): void {
    players.forEach((player, index) => {
      const pose = player.pose?.pose;
      if (!pose || !this.isReliable(pose[23]) || !this.isReliable(pose[24])) {
        this.states[index].label = 'Hazır';
        return;
      }
      const hipY = (pose[23].y + pose[24].y) / 2;
      const state = this.states[index];
      if (state.reference === null) {
        state.samples.push(hipY);
        if (state.samples.length >= 12)
          state.reference =
            state.samples.reduce((sum, value) => sum + value, 0) / state.samples.length;
        state.label = 'Hazır';
        return;
      }
      const rise = state.reference - hipY;
      if (!state.jumping && rise > 0.045) {
        state.jumping = true;
        state.label = 'Zıplıyor';
      } else if (state.jumping && rise < 0.018) {
        state.jumping = false;
        state.label = 'Hazır';
        this.scores[index] += 1;
        audio.tone(720, 0.09, 0.035, { fadeOut: false });
      }
    });
  }

  draw(context: CanvasRenderingContext2D): void {
    drawInstruction(context, this.width, this.height, this.description);
    const { ratio, bottom } = overlayLayout(context, this.width, this.height);
    context.save();
    this.states.forEach((state, index) => {
      const color = index ? canvasTheme().pink : canvasTheme().blue;
      const left = (index * this.width) / 2 + 12 * ratio;
      const width = this.width / 2 - 24 * ratio;
      panel(context, left, bottom - 42 * ratio, width, 42 * ratio, color, 12 * ratio);
      context.fillStyle = color;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.font = `700 ${12 * ratio}px system-ui`;
      context.fillText(
        `Oyuncu ${index + 1}: ${state.label}`,
        left + width / 2,
        bottom - 21 * ratio,
      );
    });
    context.restore();
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }
  getScores(): [number, number] {
    return [...this.scores];
  }

  private createState(): JumpState {
    return { samples: [], reference: null, jumping: false, label: 'Hazır' };
  }
  private isReliable(landmark: NormalizedLandmark | undefined): boolean {
    return Boolean(landmark && (landmark.visibility ?? landmark.presence ?? 1) >= 0.55);
  }
}
