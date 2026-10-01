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

export interface HandTrackingError {
  status: 'model';
  message: string;
}
