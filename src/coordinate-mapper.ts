import type { NormalizedLandmark } from './types';

export type VideoRect = { drawWidth: number; drawHeight: number; offsetX: number; offsetY: number };

export function getCoverRect(
  videoWidth: number,
  videoHeight: number,
  canvasWidth: number,
  canvasHeight: number,
): VideoRect {
  const scale = Math.max(canvasWidth / videoWidth, canvasHeight / videoHeight);
  const drawWidth = videoWidth * scale;
  const drawHeight = videoHeight * scale;
  return {
    drawWidth,
    drawHeight,
    offsetX: (canvasWidth - drawWidth) / 2,
    offsetY: (canvasHeight - drawHeight) / 2,
  };
}

export function toCanvasPoint(
  landmark: NormalizedLandmark,
  rect: VideoRect,
): { x: number; y: number } {
  // MediaPipe coordinates are unmirrored. Mirror once to match the camera image;
  // keep cropped points outside the Canvas instead of clamping them to its edges.
  return {
    x: rect.offsetX + (1 - landmark.x) * rect.drawWidth,
    y: rect.offsetY + landmark.y * rect.drawHeight,
  };
}
