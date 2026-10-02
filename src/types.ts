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
export type PlayerFace = { face: NormalizedLandmark[] | null; blend: Record<string, number>; detected: boolean };

export type PlayersTracking = [PlayerTracking, PlayerTracking];

export type GameState = 'MENU' | 'CALIBRATION' | 'COUNTDOWN' | 'PLAYING' | 'RESULT' | 'FINAL';

export type MiniGame = {
  name: string;
  description: string;
  tracking: 'hands' | 'pose' | 'face';
  needs?: 'hands' | 'pose' | 'face';
  duration?: number;
  start(width: number, height: number): void;
  update(deltaTime: number, players: PlayersTracking): void;
  draw(context: CanvasRenderingContext2D): void;
  getScores(): [number, number];
};

export interface HandTrackingError {
  status: 'model';
  message: string;
}
