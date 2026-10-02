import type { VideoRect } from './coordinate-mapper';

export type CameraStatus = 'idle' | 'starting' | 'active' | 'denied' | 'missing' | 'error';

export interface CameraError {
  status: Exclude<CameraStatus, 'idle' | 'starting' | 'active'>;
  message: string;
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
  presence?: number;
}

export type NormalizedLandmark = HandLandmark;

export type PlayerTracking = {
  hands: NormalizedLandmark[][];
  pose: PlayerPose | null;
  face: PlayerFace;
  detected: boolean;
};

export type PlayerPose = { pose: NormalizedLandmark[] | null; detected: boolean };
export type PlayerFace = {
  face: NormalizedLandmark[] | null;
  blend: Record<string, number>;
  detected: boolean;
};

export type PlayersTracking = [PlayerTracking, PlayerTracking];

export type GameState = 'MENU' | 'CALIBRATION' | 'COUNTDOWN' | 'PLAYING' | 'RESULT' | 'FINAL';

export type GameMode = 'party' | 'single' | 'solo-test';

export type GameStartContext = {
  mode: GameMode;
  activePlayers: 1 | 2;
};

export type MiniGame = {
  name: string;
  description: string;
  tracking: 'hands' | 'pose' | 'face';
  needs?: 'hands' | 'pose' | 'face';
  duration?: number;
  calibrationLandmarks?: readonly number[];
  calibrationInstruction?: string;
  start(width: number, height: number, context?: GameStartContext): void;
  update(deltaTime: number, players: PlayersTracking, rect: VideoRect): void;
  draw(context: CanvasRenderingContext2D): void;
  getScores(): [number, number];
};

export interface HandTrackingError {
  status: 'model';
  message: string;
}
