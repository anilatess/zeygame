import type { CameraError } from '../types';

export const ONLINE_CAMERA_PREPARATION_TIMEOUT_MS = 90_000;

export class CameraPreparationTimeoutError extends Error {
  constructor() {
    super('Online camera preparation timed out.');
    this.name = 'CameraPreparationTimeoutError';
  }
}

export async function withCameraPreparationTimeout<T>(
  task: Promise<T>,
  onTimeout: () => void,
  timeoutMs = ONLINE_CAMERA_PREPARATION_TIMEOUT_MS,
): Promise<T> {
  let timeout = 0;
  const expired = new Promise<never>((_, reject) => {
    timeout = window.setTimeout(() => {
      onTimeout();
      reject(new CameraPreparationTimeoutError());
    }, timeoutMs);
  });
  try {
    return await Promise.race([task, expired]);
  } finally {
    window.clearTimeout(timeout);
  }
}

export function cameraPreparationErrorMessage(error: unknown): string {
  if (error instanceof CameraPreparationTimeoutError)
    return 'Kamera ve hareket algılama zamanında hazırlanamadı. Tekrar deneyebilirsin.';
  if (isCameraError(error)) return error.message;
  const name = error instanceof DOMException ? error.name : '';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError')
    return 'Bu cihazda kullanılabilir bir kamera bulunamadı.';
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError')
    return 'Kamera izni verilmedi. Tarayıcı ayarlarından kamera iznini açıp tekrar dene.';
  if (name === 'NotReadableError' || name === 'TrackStartError')
    return 'Kamera başka bir uygulama tarafından kullanılıyor olabilir.';
  if (name === 'AbortError') return 'Kamera hazırlığı yarıda kesildi. Tekrar deneyebilirsin.';
  if (name === 'OverconstrainedError' || name === 'ConstraintNotSatisfiedError')
    return 'Kamera bu cihazda gereken görüntü ayarlarını desteklemiyor.';
  return 'Kamera hazırlanamadı. Tekrar deneyebilirsin.';
}

function isCameraError(error: unknown): error is CameraError {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as Partial<CameraError>;
  return (
    (candidate.status === 'denied' ||
      candidate.status === 'missing' ||
      candidate.status === 'error') &&
    typeof candidate.message === 'string'
  );
}
