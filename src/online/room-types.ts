import type { GameId } from '../games';

export type RoomStatus = 'waiting' | 'closed';
export type SessionState = 'waiting' | 'countdown' | 'playing' | 'finished';

export type Room = {
  id: string;
  code: string;
  hostUserId: string;
  status: RoomStatus;
  expiresAt: string;
  selectedGameId: GameId | null;
  sessionState: SessionState;
  roundId: string | null;
  startAt: string | null;
  roundSeed: number | null;
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

export type RoundScore = {
  roundId: string;
  playerSlot: 1 | 2;
  score: number;
  sequence: number;
  isFinal: boolean;
  updatedAt: string;
};

export type RoomSnapshot = {
  room: Room;
  players: RoomPlayer[];
  scores: RoundScore[];
  currentUserId: string;
};
export type PresenceState = Record<string, boolean>;
export type OnlineBusyAction =
  | 'recovering'
  | 'creating'
  | 'joining'
  | 'ready'
  | 'selecting'
  | 'starting'
  | 'finishing'
  | 'resetting'
  | 'leaving'
  | null;

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
      | 'host-only'
      | 'invalid-game'
      | 'game-required'
      | 'players-required'
      | 'players-not-ready'
      | 'already-started'
      | 'invalid-transition'
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
