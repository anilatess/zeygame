import type { HandLandmark, PlayersTracking } from './types';
import { toCanvasPoint, type VideoRect } from './coordinate-mapper';

const PLAYER_COLORS = ['#60a5fa', '#f472b6'] as const;

const CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 2],
  [2, 3],
  [3, 4],
  [0, 5],
  [5, 6],
  [6, 7],
  [7, 8],
  [5, 9],
  [9, 10],
  [10, 11],
  [11, 12],
  [9, 13],
  [13, 14],
  [14, 15],
  [15, 16],
  [13, 17],
  [17, 18],
  [18, 19],
  [19, 20],
  [0, 17],
];

export class PlayerTracker {
  classify(hands: HandLandmark[][]): PlayersTracking {
    const players: PlayersTracking = [
      { hands: [], pose: null, face: { face: null, blend: {}, detected: false }, detected: false },
      { hands: [], pose: null, face: { face: null, blend: {}, detected: false }, detected: false },
    ];
    for (const hand of hands) {
      const wrist = hand[0];
      if (!wrist) continue;
      const displayedX = 1 - wrist.x;
      const player = displayedX < 0.5 ? players[0] : players[1];
      player.hands.push(hand);
      player.detected = true;
    }
    return players;
  }

  drawOverlay(canvas: HTMLCanvasElement, players: PlayersTracking, rect: VideoRect): void {
    this.drawRegions(canvas);
    this.drawLandmarks(canvas, players, rect);
  }

  drawRegions(canvas: HTMLCanvasElement): void {
    const context = canvas.getContext('2d');
    if (!context) return;
    const middle = canvas.width / 2;
    context.save();
    context.strokeStyle = '#ffffffaa';
    context.setLineDash([12, 10]);
    context.lineWidth = Math.max(2, canvas.width / 700);
    context.beginPath();
    context.moveTo(middle, 0);
    context.lineTo(middle, canvas.height);
    context.stroke();
    context.setLineDash([]);
    context.restore();
  }

  drawLandmarks(canvas: HTMLCanvasElement, players: PlayersTracking, rect: VideoRect): void {
    const context = canvas.getContext('2d');
    if (!context) return;
    context.save();
    players.forEach((player, playerIndex) => {
      context.strokeStyle = PLAYER_COLORS[playerIndex];
      context.fillStyle = PLAYER_COLORS[playerIndex];
      context.lineWidth = Math.max(3, canvas.width / 300);
      for (const hand of player.hands) {
        for (const [from, to] of CONNECTIONS) {
          const start = toCanvasPoint(hand[from], rect);
          const end = toCanvasPoint(hand[to], rect);
          context.beginPath();
          context.moveTo(start.x, start.y);
          context.lineTo(end.x, end.y);
          context.stroke();
        }
        for (const landmark of hand) {
          const point = toCanvasPoint(landmark, rect);
          context.beginPath();
          context.arc(point.x, point.y, Math.max(4, canvas.width / 160), 0, Math.PI * 2);
          context.fill();
        }
      }
    });
    context.restore();
  }
}
