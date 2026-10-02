import { toCanvasPoint, type VideoRect } from './coordinate-mapper';
import type { MiniGame, NormalizedLandmark, PlayersTracking } from './types';

/** Readiness of tracking data, never identity verification. */
export function calibrationReadiness(
  game: MiniGame,
  players: PlayersTracking,
  width?: number,
  height?: number,
  rect?: VideoRect,
): [boolean, boolean] {
  const type = game.needs ?? game.tracking;
  const visible = (point: NormalizedLandmark | undefined) => {
    if (
      !point ||
      ![point.x, point.y, point.z].every(Number.isFinite) ||
      point.x < 0 ||
      point.x > 1 ||
      point.y < 0 ||
      point.y > 1
    )
      return false;
    if (!rect || width === undefined || height === undefined) return true;
    const mapped = toCanvasPoint(point, rect);
    return mapped.x >= 0 && mapped.x <= width && mapped.y >= 0 && mapped.y <= height;
  };
  const ready = players.map((player) => {
    if (type === 'hands') return player.detected;
    if (type === 'face')
      return player.face.detected && visible(player.face.face?.[1] ?? player.face.face?.[0]);
    const pose = player.pose;
    return Boolean(
      pose?.detected &&
      pose.pose &&
      (game.calibrationLandmarks ?? [23, 24]).every((index) => {
        const point = pose.pose![index];
        if (!visible(point)) return false;
        const confidence = [point.visibility, point.presence].filter(
          (value) => value !== undefined,
        );
        return (
          confidence.length > 0 &&
          confidence.every((value) => Number.isFinite(value) && value >= 0.55 && value <= 1)
        );
      }),
    );
  });
  return [ready[0], ready[1]];
}
