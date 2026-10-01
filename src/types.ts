export type CameraStatus = 'idle' | 'starting' | 'active' | 'denied' | 'missing' | 'error';

export interface CameraError {
  status: Exclude<CameraStatus, 'idle' | 'starting' | 'active'>;
  message: string;
}

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export type NormalizedLandmark = HandLandmark;

export type PlayerTracking = {
  hands: NormalizedLandmark[][];
  pose: PlayerPose | null;
  detected: boolean;
};

export type PlayerPose = { pose: NormalizedLandmark[] | null; detected: boolean };

export type PlayersTracking = [PlayerTracking, PlayerTracking];

export type GameState = 'MENU' | 'CALIBRATION' | 'COUNTDOWN' | 'PLAYING' | 'RESULT' | 'FINAL';

export type MiniGame = {
  tracking: 'hands' | 'pose';
  start(width: number, height: number): void;
  update(deltaTime: number, players: PlayersTracking): void;
  draw(context: CanvasRenderingContext2D): void;
  getScores(): [number, number];
};

export interface HandTrackingError {
  status: 'model';
  message: string;
}
