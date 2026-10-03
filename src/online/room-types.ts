export type RoomStatus = 'waiting' | 'closed';

export type Room = {
  id: string;
  code: string;
  hostUserId: string;
  status: RoomStatus;
  expiresAt: string;
};

export type RoomPlayer = {
  id: string;
  roomId: string;
  userId: string;
  displayName: string;
  playerSlot: 1 | 2;
  isReady: boolean;
  joinedAt: string;
};

export type RoomSnapshot = { room: Room; players: RoomPlayer[]; currentUserId: string };
export type PresenceState = Record<string, boolean>;
export type OnlineBusyAction = 'recovering' | 'creating' | 'joining' | 'ready' | 'leaving' | null;

export class OnlineRoomError extends Error {
  constructor(
    public readonly kind:
      | 'config'
      | 'auth'
      | 'invalid-name'
      | 'invalid-code'
      | 'not-found'
      | 'full'
      | 'closed'
      | 'expired'
      | 'not-member'
      | 'network'
      | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'OnlineRoomError';
  }
}

export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function validateDisplayName(value: string): string {
  const normalized = normalizeDisplayName(value);
  if (!normalized || normalized.length > 20)
    throw new OnlineRoomError('invalid-name', 'Adın 1–20 karakter arasında olmalı.');
  return normalized;
}

export function validateRoomCode(value: string): string {
  const normalized = value.replace(/\D/g, '');
  if (!/^\d{6}$/.test(normalized))
    throw new OnlineRoomError('invalid-code', '6 haneli oda kodunu kontrol et.');
  return normalized;
}
