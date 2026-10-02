import type { MiniGame, PlayersTracking, NormalizedLandmark } from '../types';
import { audio } from '../audio';

type JumpState = { samples: number[]; reference: number | null; jumping: boolean; label: string };

export class JumpRace implements MiniGame {
  readonly name = 'Zıplama Yarışı';
  readonly description = 'Zıplayarak puan topla.';
  readonly tracking = 'pose' as const;
  readonly needs = 'pose' as const;
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
    context.save();
    context.textAlign = 'center';
    context.fillStyle = '#ffffff';
    context.font = `700 ${Math.max(14, this.width / 42)}px system-ui`;
    context.fillText('En çok zıplayan kazanır!', this.width / 2, Math.max(28, this.height * 0.13));
    this.states.forEach((state, index) => {
      context.fillStyle = index === 0 ? '#60a5fa' : '#f472b6';
      context.font = `700 ${Math.max(14, this.width / 38)}px system-ui`;
      context.fillText(
        `Oyuncu ${index + 1}: ${state.label}`,
        index === 0 ? this.width * 0.25 : this.width * 0.75,
        this.height * 0.9,
      );
    });
    context.restore();
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
